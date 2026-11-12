-- BOQ in levels: cost code (level 1) → work groups → work items → optional detail lines (max 4 levels
-- under the cost code). Group rows only hold children; their totals are the sum of what is under them.
-- A line can be a per-house template (counted once for every house of the project, or of one house
-- type), and a house can override a template line with its own quantity/rate (0 = not in this house).
-- Lines can point at the spec-list item they price. The financial plan can take a cost code's total
-- straight from the working BOQ version (method FROM_BOQ), so the plan stays a summary.

alter table public.boq_items
  add column if not exists parent_id uuid references public.boq_items(id) on delete cascade,
  add column if not exists is_group boolean not null default false,
  add column if not exists per_unit boolean not null default false,
  add column if not exists house_type_id uuid references public.house_types(id) on delete set null,
  add column if not exists overrides_item_id uuid references public.boq_items(id) on delete cascade,
  add column if not exists spec_item_id uuid references public.spec_items(id) on delete set null,
  add column if not exists note text;

do $$ begin
  alter table public.boq_items add constraint boq_items_group_shape
    check (not is_group or (quantity = 0 and rate = 0 and not per_unit and overrides_item_id is null));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.boq_items add constraint boq_items_scope
    check (not (per_unit and unit_id is not null));
exception when duplicate_object then null; end $$;

create index if not exists boq_items_parent_idx on public.boq_items(parent_id);
create index if not exists boq_items_overrides_idx on public.boq_items(overrides_item_id);
create index if not exists boq_items_spec_item_idx on public.boq_items(spec_item_id);
create index if not exists boq_items_house_type_idx on public.boq_items(house_type_id);

-- Draft-only (as before) plus the tree rules. Children take their cost code from the parent, an
-- override takes its place in the tree from the template it overrides.
create or replace function public.guard_boq_item()
returns trigger language plpgsql as $$
declare
  st text;
  par boq_items;
  tpl boq_items;
  depth int := 1;
  cur uuid;
begin
  select status into st from budget_versions where id = new.budget_version_id;
  if st <> 'DRAFT' then raise exception 'Budget version is locked'; end if;
  if new.removed_at is not null then return new; end if;
  -- A house that is deleted leaves its overrides detached (unit_id null); they no longer count.
  if tg_op = 'UPDATE' and new.overrides_item_id is not null and new.unit_id is null then return new; end if;

  if new.overrides_item_id is not null then
    select * into tpl from boq_items where id = new.overrides_item_id;
    if not found or tpl.budget_version_id <> new.budget_version_id or not tpl.per_unit or tpl.is_group
       or tpl.removed_at is not null or new.unit_id is null or new.is_group then
      raise exception 'Invalid override';
    end if;
    if tpl.house_type_id is not null and not exists(
      select 1 from units u where u.id = new.unit_id and u.house_type_id = tpl.house_type_id) then
      raise exception 'Invalid override';
    end if;
    if exists(select 1 from boq_items o where o.overrides_item_id = tpl.id and o.unit_id = new.unit_id
              and o.removed_at is null and o.id <> new.id) then
      raise exception 'Override exists';
    end if;
    new.parent_id := tpl.parent_id;
    new.cost_category_id := tpl.cost_category_id;
    new.per_unit := false;
  end if;

  if new.parent_id is not null then
    if new.parent_id = new.id then raise exception 'Invalid parent'; end if;
    select * into par from boq_items where id = new.parent_id;
    if not found or par.budget_version_id <> new.budget_version_id or not par.is_group or par.removed_at is not null then
      raise exception 'Invalid parent';
    end if;
    new.cost_category_id := par.cost_category_id;
    cur := par.parent_id;
    depth := 2;
    while cur is not null loop
      if cur = new.id then raise exception 'Invalid parent'; end if;
      depth := depth + 1;
      select parent_id into cur from boq_items where id = cur;
    end loop;
    if depth > 4 then raise exception 'Too many levels'; end if;
  end if;

  if new.is_group then
    new.quantity := 0;
    new.rate := 0;
    new.per_unit := false;
  end if;
  if tg_op = 'UPDATE' then
    if old.is_group and not new.is_group
       and exists(select 1 from boq_items c where c.parent_id = new.id and c.removed_at is null) then
      raise exception 'Group has items';
    end if;
    if new.cost_category_id <> old.cost_category_id then
      update boq_items set cost_category_id = new.cost_category_id where parent_id = new.id and removed_at is null;
    end if;
  end if;
  return new;
end $$;

-- What each live line really costs: a per-house template once for every house it applies to that has
-- not overridden it; every other line once (an override counts for its own house).
create or replace function public.boq_effective(target_version uuid)
returns table(item_id uuid, cost_category_id uuid, unit_id uuid, amount numeric)
language sql stable security definer set search_path = public as $$
  with v as (select b.id, b.project_id from budget_versions b where b.id = target_version),
  it as (
    select i.* from boq_items i join v on v.id = i.budget_version_id
     where i.removed_at is null and not i.is_group
       and not (i.overrides_item_id is not null and i.unit_id is null)
       and not exists(select 1 from boq_items g where g.id = i.overrides_item_id and g.removed_at is not null)
  )
  select it.id, it.cost_category_id, u.id, it.amount
    from it join v on true
    join units u on u.project_id = v.project_id and (it.house_type_id is null or u.house_type_id = it.house_type_id)
   where it.per_unit
     and not exists(select 1 from it o where o.overrides_item_id = it.id and o.unit_id = u.id)
  union all
  select it.id, it.cost_category_id, it.unit_id, it.amount from it where not it.per_unit;
$$;
revoke all on function public.boq_effective(uuid) from public, anon, authenticated;

-- The version the plan should read: the open draft/submitted one, else the approved one.
create or replace function public.working_budget_version(target_project uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from budget_versions where project_id = target_project
   order by case when status in ('DRAFT','SUBMITTED') then 0 when status = 'APPROVED' then 1 else 2 end, version desc
   limit 1;
$$;
revoke all on function public.working_budget_version(uuid) from public, anon, authenticated;

-- Totals per cost code of the working version, for the financial plan (FROM_BOQ lines).
create or replace function public.get_boq_totals(target_project uuid)
returns table(cost_category_id uuid, amount numeric, version int, status text)
language sql stable security definer set search_path = public as $$
  with p as (
    select pr.id from projects pr where pr.id = target_project
       and (public.can_cost(pr.id, 'VIEW') or public.can_plan_forecast(pr.organization_id))
  ),
  bv as (select b.* from budget_versions b join p on true where b.id = public.working_budget_version(p.id))
  select e.cost_category_id, round(sum(e.amount), 2), bv.version, bv.status
    from bv cross join lateral public.boq_effective(bv.id) e
   group by e.cost_category_id, bv.version, bv.status;
$$;
revoke all on function public.get_boq_totals(uuid) from public, anon;
grant execute on function public.get_boq_totals(uuid) to authenticated;

-- New version: copy the approved one with its tree, templates and overrides.
create or replace function public.create_budget_version(target_project uuid, note text)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  pr projects;
  prev budget_versions;
  n int;
  id uuid;
begin
  select * into pr from projects where projects.id = target_project;
  if not found or not (public.can_cost(pr.id, 'CREATE') or public.can_cost(pr.id, 'EDIT')) then raise exception 'Not authorized'; end if;
  select coalesce(max(version), 0) + 1 into n from budget_versions b where b.project_id = pr.id;
  select * into prev from budget_versions b where b.project_id = pr.id and b.status = 'APPROVED';
  insert into budget_versions (organization_id, project_id, version, note, created_by)
  values (pr.organization_id, pr.id, n, nullif(trim(note), ''), auth.uid())
  returning budget_versions.id into id;
  if prev.id is not null then
    create temp table if not exists boq_copy_map (old_id uuid primary key, new_id uuid not null) on commit drop;
    delete from boq_copy_map;
    insert into boq_copy_map select x.id, gen_random_uuid() from boq_items x
     where x.budget_version_id = prev.id and x.removed_at is null;
    -- Parents before children, templates before overrides, so the guard finds what it checks.
    insert into boq_items (id, organization_id, budget_version_id, cost_category_id, unit_id, item_code, description, uom,
      quantity, rate, sort_order, parent_id, is_group, per_unit, house_type_id, overrides_item_id, spec_item_id, note)
    select m.new_id, x.organization_id, id, x.cost_category_id, x.unit_id, x.item_code, x.description, x.uom,
           x.quantity, x.rate, x.sort_order, pm.new_id, x.is_group, x.per_unit, x.house_type_id, om.new_id, x.spec_item_id, x.note
      from (
        with recursive t as (
          select i.*, 1 lvl from boq_items i where i.budget_version_id = prev.id and i.removed_at is null and i.parent_id is null
          union all
          select c.*, t.lvl + 1 from boq_items c join t on c.parent_id = t.id where c.removed_at is null
        ) select * from t
      ) x
      join boq_copy_map m on m.old_id = x.id
      left join boq_copy_map pm on pm.old_id = x.parent_id
      left join boq_copy_map om on om.old_id = x.overrides_item_id
     order by x.lvl, (x.overrides_item_id is not null), x.sort_order;
  end if;
  return id;
end $$;

create or replace function public.upsert_boq_item(target_version uuid, target_item uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  b budget_versions;
  id uuid := target_item;
  grp boolean := coalesce((data->>'is_group')::boolean, false);
  per boolean := coalesce((data->>'per_unit')::boolean, false);
  par uuid := public.try_uuid(nullif(data->>'parent_id', ''));
  ovr uuid := public.try_uuid(nullif(data->>'overrides_item_id', ''));
  unit uuid := public.try_uuid(nullif(data->>'unit_id', ''));
  htype uuid := public.try_uuid(nullif(data->>'house_type_id', ''));
  spec uuid := public.try_uuid(nullif(data->>'spec_item_id', ''));
  cat uuid := public.try_uuid(nullif(data->>'cost_category_id', ''));
begin
  select * into b from budget_versions where budget_versions.id = target_version;
  if not found or not (public.can_cost(b.project_id, 'CREATE') or public.can_cost(b.project_id, 'EDIT')) then raise exception 'Not authorized'; end if;
  if b.status <> 'DRAFT' then raise exception 'Budget version is locked'; end if;
  if par is not null or ovr is not null then
    select coalesce(cat, i.cost_category_id) into cat from boq_items i where i.id = coalesce(ovr, par);
  end if;
  if coalesce(trim(data->>'description'), '') = '' or cat is null
     or not exists(select 1 from cost_categories c where c.id = cat and c.organization_id = b.organization_id) then
    raise exception 'Invalid item';
  end if;
  if unit is not null and not exists(select 1 from units u where u.id = unit and u.project_id = b.project_id) then
    raise exception 'Invalid item';
  end if;
  if htype is not null and not exists(select 1 from units u where u.house_type_id = htype and u.project_id = b.project_id) then
    raise exception 'Invalid item';
  end if;
  if spec is not null and not exists(select 1 from spec_items s where s.id = spec and s.project_id = b.project_id) then
    raise exception 'Invalid item';
  end if;
  if per then unit := null; end if;
  if not per then htype := null; end if;
  if ovr is not null then per := false; htype := null; end if;
  if id is null then
    insert into boq_items (organization_id, budget_version_id, cost_category_id, unit_id, item_code, description, uom, quantity, rate,
      parent_id, is_group, per_unit, house_type_id, overrides_item_id, spec_item_id, note, sort_order)
    values (b.organization_id, b.id, cat, unit, nullif(trim(data->>'item_code'), ''), trim(data->>'description'),
      coalesce(nullif(trim(data->>'uom'), ''), 'LS'),
      case when grp then 0 else coalesce(nullif(data->>'quantity', '')::numeric, 1) end,
      case when grp then 0 else coalesce(nullif(data->>'rate', '')::numeric, 0) end,
      par, grp, per, htype, ovr, spec, nullif(trim(data->>'note'), ''),
      coalesce((select max(sort_order) from boq_items where budget_version_id = b.id), 0) + 1)
    returning boq_items.id into id;
  else
    update boq_items set cost_category_id = cat, unit_id = unit,
      item_code = nullif(trim(data->>'item_code'), ''), description = trim(data->>'description'),
      uom = coalesce(nullif(trim(data->>'uom'), ''), 'LS'),
      quantity = case when grp then 0 else coalesce(nullif(data->>'quantity', '')::numeric, 1) end,
      rate = case when grp then 0 else coalesce(nullif(data->>'rate', '')::numeric, 0) end,
      parent_id = par, is_group = grp, per_unit = per, house_type_id = htype, overrides_item_id = ovr,
      spec_item_id = spec, note = nullif(trim(data->>'note'), '')
     where boq_items.id = id and budget_version_id = b.id and removed_at is null;
    if not found then raise exception 'Not authorized'; end if;
  end if;
  return id;
end $$;

-- Removing a group removes everything under it; removing a template removes its overrides.
create or replace function public.remove_boq_item(target_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b budget_versions;
begin
  select v.* into b from boq_items i join budget_versions v on v.id = i.budget_version_id where i.id = target_item;
  if not found or not (public.can_cost(b.project_id, 'CREATE') or public.can_cost(b.project_id, 'EDIT')) then raise exception 'Not authorized'; end if;
  with recursive t as (
    select id from boq_items where id = target_item
    union
    select c.id from boq_items c join t on c.parent_id = t.id or c.overrides_item_id = t.id where c.removed_at is null
  )
  update boq_items set removed_at = now() where id in (select id from t) and removed_at is null;
end $$;

-- Bulk import: same as before, plus optional per-house flag (lines still land at the top level).
create or replace function public.add_boq_items(target_version uuid, items jsonb)
returns int language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  b budget_versions;
  it jsonb;
  n int := 0;
  start_order int;
  cat uuid;
begin
  select * into b from budget_versions where budget_versions.id = target_version;
  if not found or not (public.can_cost(b.project_id, 'CREATE') or public.can_cost(b.project_id, 'EDIT')) then
    raise exception 'Not authorized';
  end if;
  if b.status <> 'DRAFT' then raise exception 'Budget version is locked'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 or jsonb_array_length(items) > 500 then
    raise exception 'Invalid items';
  end if;
  select coalesce(max(sort_order), 0) into start_order from boq_items where budget_version_id = b.id;

  for it in select * from jsonb_array_elements(items) loop
    n := n + 1;
    cat := public.try_uuid(it->>'cost_category_id');
    if coalesce(trim(it->>'description'), '') = ''
       or cat is null
       or not exists(select 1 from cost_categories c where c.id = cat and c.organization_id = b.organization_id)
       or coalesce(nullif(it->>'quantity', '')::numeric, -1) < 0
       or coalesce(nullif(it->>'rate', '')::numeric, -1) < 0 then
      raise exception 'Invalid item %', n;
    end if;
    insert into boq_items (organization_id, budget_version_id, cost_category_id, item_code, description, uom,
      quantity, rate, sort_order, per_unit)
    values (b.organization_id, b.id, cat, nullif(trim(it->>'item_code'), ''), left(trim(it->>'description'), 500),
      coalesce(nullif(trim(it->>'uom'), ''), 'LS'), (it->>'quantity')::numeric, (it->>'rate')::numeric, start_order + n,
      coalesce((it->>'per_unit')::boolean, false));
  end loop;
  return n;
end $$;

-- Approval: per-cost-code baseline now counts templates once per house.
create or replace function public.decide_budget_version(target_version uuid, approve boolean, note text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare b budget_versions;
begin
  select * into b from budget_versions where id = target_version for update;
  if not found or not public.can_cost(b.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if b.status <> 'SUBMITTED' then raise exception 'Budget version is not submitted'; end if;
  if b.submitted_by = auth.uid() and not public.can_manage_access(b.organization_id) then
    raise exception 'Submitter cannot approve their own budget';
  end if;
  if not approve then
    if coalesce(trim(note), '') = '' then raise exception 'Reason required'; end if;
    update budget_versions set status = 'DRAFT', review_note = trim(note) where id = b.id;
    return;
  end if;
  update budget_versions set status = 'SUPERSEDED' where project_id = b.project_id and status = 'APPROVED';
  update budget_versions set status = 'APPROVED', approved_by = auth.uid(), approved_at = now(), review_note = nullif(trim(note), '')
   where id = b.id;
  insert into project_budgets (project_id, cost_category_id, budget_amount, updated_at)
  select b.project_id, e.cost_category_id, round(sum(e.amount), 2), now() from public.boq_effective(b.id) e
   group by e.cost_category_id
  on conflict (project_id, cost_category_id) do update set budget_amount = excluded.budget_amount, updated_at = now();
  update project_budgets pb set budget_amount = 0, updated_at = now()
   where pb.project_id = b.project_id
     and not exists(select 1 from public.boq_effective(b.id) e where e.cost_category_id = pb.cost_category_id);
  perform public.log_timeline(b.organization_id, b.project_id, null, 'BUDGET_APPROVED', 'budget_version', b.id,
    'Budget v' || b.version, '{}'::jsonb);
end $$;

-- Cost report: baseline from the approved BOQ with templates per house (the unit filter gets that
-- house's share: its template lines unless overridden, plus its own lines).
create or replace function public.get_cost_report(target_project uuid, target_unit uuid default null)
returns table(cost_category_id uuid, code text, name text, baseline numeric, committed numeric, actual numeric,
  certified numeric, forecast numeric, variance numeric)
language sql stable security definer set search_path = public as $$
  with p as (select * from projects where id = target_project and public.can_cost(target_project, 'VIEW')),
  bv as (select b.id from budget_versions b join p on p.id = b.project_id where b.status = 'APPROVED'),
  base as (select e.cost_category_id, sum(e.amount) amt from bv cross join lateral public.boq_effective(bv.id) e
            where target_unit is null or e.unit_id = target_unit group by 1),
  docs as (select d.cost_category_id,
             sum(case when d.document_type = 'COMMITMENT' and d.status <> 'VOID' then d.amount else 0 end) committed,
             sum(case when d.document_type = 'PAYMENT' and d.status = 'POSTED' then d.amount else 0 end) actual
           from financial_documents d join p on p.id = d.project_id
          where target_unit is null or d.unit_id = target_unit group by 1),
  claims as (select c.cost_category_id, sum(coalesce(c.certified_amount, 0)) amt from progress_claims c join p on p.id = c.project_id
              where c.status = 'CERTIFIED' and target_unit is null group by 1),
  fc as (select pb.cost_category_id, pb.forecast_amount from project_budgets pb join p on p.id = pb.project_id where target_unit is null)
  select cc.id, cc.code, cc.name,
         coalesce(base.amt, 0), coalesce(docs.committed, 0), coalesce(docs.actual, 0), coalesce(claims.amt, 0),
         greatest(coalesce(nullif(fc.forecast_amount, 0), 0), coalesce(base.amt, 0), coalesce(docs.committed, 0), coalesce(docs.actual, 0)),
         coalesce(base.amt, 0) - greatest(coalesce(nullif(fc.forecast_amount, 0), 0), coalesce(base.amt, 0), coalesce(docs.committed, 0), coalesce(docs.actual, 0))
    from cost_categories cc join p on p.organization_id = cc.organization_id
    left join base on base.cost_category_id = cc.id
    left join docs on docs.cost_category_id = cc.id
    left join claims on claims.cost_category_id = cc.id
    left join fc on fc.cost_category_id = cc.id
   where cc.active or base.amt is not null or docs.committed is not null
   order by cc.code;
$$;

-- ---------------------------------------------------------------- plan lines from the BOQ

alter table public.forecast_lines drop constraint if exists forecast_lines_method_check;
alter table public.forecast_lines add constraint forecast_lines_method_check
  check (method in ('LUMP','PER_SQM','PER_UNIT','PCT_REVENUE','UNITS_FROM_SYSTEM','FROM_BOQ'));

create or replace function public.save_forecast_line(target_project uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare org uuid; lid uuid := public.try_uuid(nullif(data->>'id', '')); cat uuid := public.try_uuid(nullif(data->>'cost_category_id', ''));
  k text := data->>'kind'; c text := data->>'category'; m text := data->>'method';
begin
  select organization_id into org from projects where id = target_project;
  if org is null or not public.can_plan_forecast(org) then raise exception 'Not authorized'; end if;
  if coalesce(trim(data->>'label'), '') = '' or k not in ('REVENUE','COST')
     or (k = 'REVENUE' and c not in ('SALES_HOUSES','OTHER_REVENUE'))
     or (k = 'COST' and c in ('SALES_HOUSES','OTHER_REVENUE'))
     or (m = 'UNITS_FROM_SYSTEM' and c <> 'SALES_HOUSES')
     or (m = 'PCT_REVENUE' and k = 'REVENUE')
     or (m = 'FROM_BOQ' and (k <> 'COST' or cat is null)) then
    raise exception 'Invalid line';
  end if;
  if cat is not null and not exists(select 1 from cost_categories where id = cat and organization_id = org) then
    raise exception 'Invalid line';
  end if;
  if lid is null then
    insert into forecast_lines (organization_id, project_id, kind, category, label, method, amount, rate, quantity, pct,
      timing, cost_category_id, self_sales_only, sort_order)
    values (org, target_project, k, c, trim(data->>'label'), m,
      coalesce(nullif(data->>'amount', '')::numeric, 0), coalesce(nullif(data->>'rate', '')::numeric, 0),
      coalesce(nullif(data->>'quantity', '')::numeric, 0), coalesce(nullif(data->>'pct', '')::numeric, 0),
      coalesce(nullif(data->>'timing', ''), 'SPREAD'), cat, coalesce((data->>'self_sales_only')::boolean, false),
      coalesce((select max(sort_order) from forecast_lines where project_id = target_project), 0) + 1)
    returning id into lid;
  else
    update forecast_lines set label = trim(data->>'label'), method = m,
      amount = coalesce(nullif(data->>'amount', '')::numeric, 0), rate = coalesce(nullif(data->>'rate', '')::numeric, 0),
      quantity = coalesce(nullif(data->>'quantity', '')::numeric, 0), pct = coalesce(nullif(data->>'pct', '')::numeric, 0),
      timing = coalesce(nullif(data->>'timing', ''), timing), cost_category_id = cat,
      self_sales_only = coalesce((data->>'self_sales_only')::boolean, self_sales_only), updated_at = now()
     where id = lid and project_id = target_project and removed_at is null;
    if not found then raise exception 'Not authorized'; end if;
  end if;
  return lid;
end $$;
