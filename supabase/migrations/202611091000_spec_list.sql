-- Project specification list (รายการประกอบแบบ) with per-unit upgrades.
--
-- spec_items is the project's standard spec: one row per material or equipment item, with area,
-- size, colour, brand, model, supplier, quantity, unit and unit price. An item can apply to the
-- whole project or to one house type. spec_options are priced upgrade choices for an item
-- (for example 5 kW solar -> 10 kW).
--
-- unit_spec_items holds what one unit does differently from the standard: CHANGE an item
-- (upgrade or swap, usually by picking an option), ADD a new item, or OMIT a standard one.
-- Everything a unit does not change is inherited from the standard, so editing the standard
-- updates every unit that has not changed that item. unit_spec_lines() returns a unit's full
-- effective list with the cost difference and the customer charge of every change.
-- create_spec_variation() turns a unit's draft changes into one variation order (VO) with
-- add/omit items, so pricing, customer approval and release follow the existing Changes flow.
-- Lines in a live VO are locked; a cancelled or rejected VO frees them again.
--
-- Prices here are developer cost, so only project staff can read these tables (not customers,
-- contractors or investors). Writes go through the RPCs below.

-- ---------------------------------------------------------------- tables

create table if not exists public.spec_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  house_type_id uuid references public.house_types(id) on delete set null,
  item_no text not null,
  seq int not null default 0,
  category text not null check (category in ('STRUCTURE','ROOF','WALL','FLOOR','CEILING','DOOR_WINDOW',
    'SANITARY','KITCHEN','ELECTRICAL','LIGHTING','PLUMBING','AIRCON','POOL','EXTERIOR','FURNITURE','OTHER')),
  area text,
  name text not null,
  description text,
  material_id uuid references public.materials(id) on delete set null,
  brand text,
  model text,
  color text,
  size text,
  supplier text,
  quantity numeric(14,3) check (quantity >= 0),
  unit text,
  unit_price numeric(18,2) check (unit_price >= 0),
  warranty text,
  note text,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, item_no)
);
create index if not exists spec_items_project_idx on public.spec_items(project_id, seq);
create index if not exists spec_items_org_idx on public.spec_items(organization_id);
create index if not exists spec_items_house_type_idx on public.spec_items(house_type_id);
create index if not exists spec_items_material_idx on public.spec_items(material_id);
create index if not exists spec_items_created_by_idx on public.spec_items(created_by);

create table if not exists public.spec_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  item_id uuid not null references public.spec_items(id) on delete cascade,
  seq int not null default 0,
  name text not null,
  brand text,
  model text,
  color text,
  size text,
  supplier text,
  -- Cost per unit of the option; null keeps the standard unit price.
  unit_price numeric(18,2) check (unit_price >= 0),
  -- What the buyer pays for choosing it; null charges the cost difference.
  customer_price numeric(18,2),
  note text,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists spec_options_item_idx on public.spec_options(item_id, seq);
create index if not exists spec_options_project_idx on public.spec_options(project_id);
create index if not exists spec_options_org_idx on public.spec_options(organization_id);
create index if not exists spec_options_created_by_idx on public.spec_options(created_by);

create table if not exists public.unit_spec_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  base_item_id uuid references public.spec_items(id) on delete cascade,
  option_id uuid references public.spec_options(id) on delete set null,
  kind text not null check (kind in ('CHANGE','ADD','OMIT')),
  -- For CHANGE a null field keeps the option's or the standard's value; ADD fills its own.
  category text check (category in ('STRUCTURE','ROOF','WALL','FLOOR','CEILING','DOOR_WINDOW',
    'SANITARY','KITCHEN','ELECTRICAL','LIGHTING','PLUMBING','AIRCON','POOL','EXTERIOR','FURNITURE','OTHER')),
  area text,
  name text,
  description text,
  brand text,
  model text,
  color text,
  size text,
  supplier text,
  quantity numeric(14,3) check (quantity >= 0),
  unit text,
  unit_price numeric(18,2) check (unit_price >= 0),
  -- Buyer charge for this line (negative = credit); null charges the cost difference.
  customer_price numeric(18,2),
  note text,
  status text not null default 'DRAFT' check (status in ('DRAFT','IN_VO','CANCELLED')),
  variation_order_id uuid references public.variation_orders(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'ADD') = (base_item_id is null)),
  check (kind <> 'ADD' or (name is not null and category is not null))
);
create unique index if not exists unit_spec_items_one_open on public.unit_spec_items(unit_id, base_item_id)
  where base_item_id is not null and status <> 'CANCELLED';
create index if not exists unit_spec_items_unit_idx on public.unit_spec_items(unit_id);
create index if not exists unit_spec_items_project_idx on public.unit_spec_items(project_id);
create index if not exists unit_spec_items_org_idx on public.unit_spec_items(organization_id);
create index if not exists unit_spec_items_base_idx on public.unit_spec_items(base_item_id);
create index if not exists unit_spec_items_option_idx on public.unit_spec_items(option_id);
create index if not exists unit_spec_items_vo_idx on public.unit_spec_items(variation_order_id);
create index if not exists unit_spec_items_created_by_idx on public.unit_spec_items(created_by);

alter table public.spec_items enable row level security;
alter table public.spec_options enable row level security;
alter table public.unit_spec_items enable row level security;

drop policy if exists spec_items_select on public.spec_items;
create policy spec_items_select on public.spec_items for select to authenticated
  using (public.can_access_project(project_id));
drop policy if exists spec_options_select on public.spec_options;
create policy spec_options_select on public.spec_options for select to authenticated
  using (public.can_access_project(project_id));
drop policy if exists unit_spec_items_select on public.unit_spec_items;
create policy unit_spec_items_select on public.unit_spec_items for select to authenticated
  using (public.can_access_project(project_id));
grant select on public.spec_items, public.spec_options, public.unit_spec_items to authenticated;

-- ---------------------------------------------------------------- helpers

create or replace function public.spec_text(v jsonb, k text)
returns text language sql immutable set search_path = public as $$
  select nullif(trim(v->>k), '');
$$;

-- Blank -> null; anything that is not a non-negative number is refused.
create or replace function public.spec_amount(v jsonb, k text, allow_negative boolean default false)
returns numeric language plpgsql immutable set search_path = public as $$
declare
  t text := nullif(trim(v->>k), '');
  n numeric;
begin
  if t is null then return null; end if;
  begin
    n := t::numeric;
  exception when others then
    raise exception 'Invalid spec';
  end;
  if n < 0 and not allow_negative then raise exception 'Invalid spec'; end if;
  return n;
end $$;

-- A line can be edited while it is a draft, or when the VO it went into was cancelled or rejected.
create or replace function public.unit_spec_editable(line_status text, vo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select line_status = 'DRAFT'
      or (line_status = 'IN_VO' and (vo is null or exists(
            select 1 from variation_orders v where v.id = vo and v.status in ('CANCELLED','CUSTOMER_REJECTED'))));
$$;

-- ---------------------------------------------------------------- effective list

-- A unit's full spec: every standard item that applies to it (with its change, if any), then the
-- items it adds. amount = quantity x unit price; cost_delta = amount - standard amount;
-- charge = what the buyer pays for the change (negative = credit). Null when a price is missing.
create or replace function public.unit_spec_lines(target_unit uuid)
returns table (
  line_id uuid, base_item_id uuid, option_id uuid, option_name text, kind text, status text,
  editable boolean, variation_order_id uuid, vo_no text, vo_status text,
  item_no text, seq int, category text, area text, name text, description text,
  brand text, model text, color text, size text, supplier text,
  quantity numeric, unit text, unit_price numeric, amount numeric,
  std_brand text, std_model text, std_color text, std_size text, std_supplier text,
  std_quantity numeric, std_unit_price numeric, std_amount numeric,
  cost_delta numeric, charge numeric, note text
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare u units;
begin
  select * into u from units where units.id = target_unit;
  if not found or not public.can_access_project(u.project_id) then raise exception 'Not authorized'; end if;
  return query
  with ov as (
    select o.* from unit_spec_items o where o.unit_id = u.id and o.status <> 'CANCELLED'
  ), std as (
    select s.*, o.id as o_id, o.kind as o_kind, o.status as o_status, o.option_id as o_option,
           o.variation_order_id as o_vo, o.area as o_area, o.name as o_name, o.description as o_description,
           o.brand as o_brand, o.model as o_model, o.color as o_color, o.size as o_size,
           o.supplier as o_supplier, o.quantity as o_quantity, o.unit as o_unit,
           o.unit_price as o_unit_price, o.customer_price as o_customer_price, o.note as o_note,
           op.name as op_name, op.brand as op_brand, op.model as op_model, op.color as op_color,
           op.size as op_size, op.supplier as op_supplier, op.unit_price as op_unit_price,
           op.customer_price as op_customer_price,
           (o.id is not null and public.unit_spec_editable(o.status, o.variation_order_id)) as o_editable,
           round(s.quantity * s.unit_price, 2) as s_amount
      from spec_items s
      left join ov o on o.base_item_id = s.id
      left join spec_options op on op.id = o.option_id
     where s.project_id = u.project_id
       and (s.house_type_id is null or s.house_type_id is not distinct from u.house_type_id)
       and (s.active or o.id is not null)
  ), eff as (
    select x.*,
      case x.o_kind when 'OMIT' then 0::numeric
        when 'CHANGE' then round(coalesce(x.o_quantity, x.quantity)
                                 * coalesce(x.o_unit_price, x.op_unit_price, x.unit_price), 2)
        else x.s_amount end as e_amount
      from std x
  )
  select e.o_id, e.id, e.o_option, e.op_name, coalesce(e.o_kind, 'STANDARD'), e.o_status,
         coalesce(e.o_editable, false), e.o_vo, v.vo_no, v.status,
         e.item_no, e.seq, e.category, coalesce(e.o_area, e.area), coalesce(e.o_name, e.name),
         coalesce(e.o_description, e.description),
         coalesce(e.o_brand, e.op_brand, e.brand), coalesce(e.o_model, e.op_model, e.model),
         coalesce(e.o_color, e.op_color, e.color), coalesce(e.o_size, e.op_size, e.size),
         coalesce(e.o_supplier, e.op_supplier, e.supplier),
         case when e.o_kind = 'OMIT' then 0::numeric else coalesce(e.o_quantity, e.quantity) end,
         coalesce(e.o_unit, e.unit),
         case when e.o_kind = 'OMIT' then null else coalesce(e.o_unit_price, e.op_unit_price, e.unit_price) end,
         e.e_amount,
         e.brand, e.model, e.color, e.size, e.supplier, e.quantity, e.unit_price, e.s_amount,
         case when e.o_kind is null then 0::numeric else e.e_amount - e.s_amount end,
         case when e.o_kind is null then 0::numeric
              when e.o_kind = 'OMIT' then coalesce(e.o_customer_price, -e.s_amount)
              else coalesce(e.o_customer_price, e.op_customer_price, e.e_amount - e.s_amount) end,
         coalesce(e.o_note, e.note)
    from eff e left join variation_orders v on v.id = e.o_vo
  union all
  select o.id, null, null, null, 'ADD', o.status, public.unit_spec_editable(o.status, o.variation_order_id), o.variation_order_id,
         v.vo_no, v.status, 'ADD', 100000, o.category, o.area, o.name, o.description,
         o.brand, o.model, o.color, o.size, o.supplier, o.quantity, o.unit, o.unit_price,
         round(o.quantity * o.unit_price, 2),
         null, null, null, null, null, null, null, null,
         round(o.quantity * o.unit_price, 2),
         coalesce(o.customer_price, round(o.quantity * o.unit_price, 2)),
         o.note
    from ov o left join variation_orders v on v.id = o.variation_order_id
   where o.kind = 'ADD'
   order by 12, 11;
end $$;

-- ---------------------------------------------------------------- RPCs: project standard

create or replace function public.upsert_spec_item(target_project uuid, target_item uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  pr projects;
  id uuid := target_item;
  ht uuid := nullif(data->>'house_type_id', '')::uuid;
  mat uuid := nullif(data->>'material_id', '')::uuid;
  m materials;
begin
  select * into pr from projects where projects.id = target_project;
  if not found or not public.can_design(pr.id, 'EDIT') then raise exception 'Not authorized'; end if;
  if public.spec_text(data, 'item_no') is null or public.spec_text(data, 'name') is null
     or upper(coalesce(data->>'category', '')) not in ('STRUCTURE','ROOF','WALL','FLOOR','CEILING','DOOR_WINDOW',
       'SANITARY','KITCHEN','ELECTRICAL','LIGHTING','PLUMBING','AIRCON','POOL','EXTERIOR','FURNITURE','OTHER') then
    raise exception 'Invalid spec';
  end if;
  if ht is not null and not exists(select 1 from house_types h where h.id = ht and h.organization_id = pr.organization_id) then
    raise exception 'Invalid spec';
  end if;
  if mat is not null then
    select * into m from materials where materials.id = mat and organization_id = pr.organization_id;
    if not found then raise exception 'Invalid spec'; end if;
  end if;
  if id is null then
    insert into spec_items (organization_id, project_id, house_type_id, item_no, seq, category, area, name, description,
      material_id, brand, model, color, size, supplier, quantity, unit, unit_price, warranty, note, created_by)
    values (pr.organization_id, pr.id, ht, upper(public.spec_text(data, 'item_no')),
      coalesce(nullif(data->>'seq', '')::int,
        (select coalesce(max(s.seq), 0) + 10 from spec_items s where s.project_id = pr.id)),
      upper(data->>'category'), public.spec_text(data, 'area'), public.spec_text(data, 'name'),
      public.spec_text(data, 'description'), mat, coalesce(public.spec_text(data, 'brand'), m.brand),
      public.spec_text(data, 'model'), public.spec_text(data, 'color'), public.spec_text(data, 'size'),
      public.spec_text(data, 'supplier'), public.spec_amount(data, 'quantity'), public.spec_text(data, 'unit'),
      public.spec_amount(data, 'unit_price'), public.spec_text(data, 'warranty'), public.spec_text(data, 'note'),
      auth.uid())
    returning spec_items.id into id;
  else
    update spec_items set house_type_id = ht, item_no = upper(public.spec_text(data, 'item_no')),
      seq = coalesce(nullif(data->>'seq', '')::int, seq), category = upper(data->>'category'),
      area = public.spec_text(data, 'area'), name = public.spec_text(data, 'name'),
      description = public.spec_text(data, 'description'), material_id = mat,
      brand = coalesce(public.spec_text(data, 'brand'), m.brand), model = public.spec_text(data, 'model'),
      color = public.spec_text(data, 'color'), size = public.spec_text(data, 'size'),
      supplier = public.spec_text(data, 'supplier'), quantity = public.spec_amount(data, 'quantity'),
      unit = public.spec_text(data, 'unit'), unit_price = public.spec_amount(data, 'unit_price'),
      warranty = public.spec_text(data, 'warranty'), note = public.spec_text(data, 'note'),
      active = coalesce((data->>'active')::boolean, active), updated_at = now()
     where spec_items.id = id and project_id = pr.id;
    if not found then raise exception 'Not authorized'; end if;
  end if;
  return id;
end $$;

-- Deletes an item no unit uses; one that a unit has changed is only switched off.
create or replace function public.remove_spec_item(target_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s spec_items;
begin
  select * into s from spec_items where id = target_item for update;
  if not found or not public.can_design(s.project_id, 'EDIT') then raise exception 'Not authorized'; end if;
  if exists(select 1 from unit_spec_items o where o.base_item_id = s.id and o.status <> 'CANCELLED') then
    update spec_items set active = false, updated_at = now() where id = s.id;
  else
    delete from unit_spec_items where base_item_id = s.id;
    delete from spec_items where id = s.id;
  end if;
end $$;

create or replace function public.upsert_spec_option(target_item uuid, target_option uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  s spec_items;
  id uuid := target_option;
begin
  select * into s from spec_items where spec_items.id = target_item;
  if not found or not public.can_design(s.project_id, 'EDIT') then raise exception 'Not authorized'; end if;
  if public.spec_text(data, 'name') is null then raise exception 'Invalid spec'; end if;
  if id is null then
    insert into spec_options (organization_id, project_id, item_id, seq, name, brand, model, color, size, supplier,
      unit_price, customer_price, note, created_by)
    values (s.organization_id, s.project_id, s.id,
      (select coalesce(max(o.seq), 0) + 1 from spec_options o where o.item_id = s.id),
      public.spec_text(data, 'name'), public.spec_text(data, 'brand'), public.spec_text(data, 'model'),
      public.spec_text(data, 'color'), public.spec_text(data, 'size'), public.spec_text(data, 'supplier'),
      public.spec_amount(data, 'unit_price'), public.spec_amount(data, 'customer_price', true),
      public.spec_text(data, 'note'), auth.uid())
    returning spec_options.id into id;
  else
    update spec_options set name = public.spec_text(data, 'name'), brand = public.spec_text(data, 'brand'),
      model = public.spec_text(data, 'model'), color = public.spec_text(data, 'color'),
      size = public.spec_text(data, 'size'), supplier = public.spec_text(data, 'supplier'),
      unit_price = public.spec_amount(data, 'unit_price'),
      customer_price = public.spec_amount(data, 'customer_price', true), note = public.spec_text(data, 'note'),
      active = coalesce((data->>'active')::boolean, active), updated_at = now()
     where spec_options.id = id and item_id = s.id;
    if not found then raise exception 'Not authorized'; end if;
  end if;
  return id;
end $$;

create or replace function public.remove_spec_option(target_option uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o spec_options;
begin
  select * into o from spec_options where id = target_option for update;
  if not found or not public.can_design(o.project_id, 'EDIT') then raise exception 'Not authorized'; end if;
  if exists(select 1 from unit_spec_items x where x.option_id = o.id and x.status <> 'CANCELLED') then
    update spec_options set active = false, updated_at = now() where id = o.id;
  else
    delete from spec_options where id = o.id;
  end if;
end $$;

-- ---------------------------------------------------------------- RPCs: unit changes

-- Saves a unit's change to a standard item (CHANGE / OMIT) or an added item (ADD).
-- A standard item has at most one open change per unit: saving again edits it.
create or replace function public.save_unit_spec(target_unit uuid, target_line uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  u units;
  pr projects;
  line unit_spec_items;
  k text := upper(coalesce(data->>'kind', ''));
  base uuid := nullif(data->>'base_item_id', '')::uuid;
  opt uuid := nullif(data->>'option_id', '')::uuid;
  id uuid;
begin
  select * into u from units where units.id = target_unit;
  if not found or not public.can_design(u.project_id, 'EDIT') then raise exception 'Not authorized'; end if;
  select * into pr from projects where projects.id = u.project_id;
  if k not in ('CHANGE','ADD','OMIT') then raise exception 'Invalid spec'; end if;
  if k = 'ADD' then
    base := null;
    opt := null;
    if public.spec_text(data, 'name') is null
       or upper(coalesce(data->>'category', '')) not in ('STRUCTURE','ROOF','WALL','FLOOR','CEILING','DOOR_WINDOW',
         'SANITARY','KITCHEN','ELECTRICAL','LIGHTING','PLUMBING','AIRCON','POOL','EXTERIOR','FURNITURE','OTHER')
       or public.spec_amount(data, 'quantity') is null or public.spec_amount(data, 'unit_price') is null then
      raise exception 'Invalid spec';
    end if;
  else
    if base is null or not exists(select 1 from spec_items s where s.id = base and s.project_id = u.project_id
         and (s.house_type_id is null or s.house_type_id is not distinct from u.house_type_id)) then
      raise exception 'Invalid spec';
    end if;
    if k = 'OMIT' then opt := null; end if;
    if opt is not null and not exists(select 1 from spec_options o where o.id = opt and o.item_id = base and o.active) then
      raise exception 'Invalid spec';
    end if;
  end if;

  if target_line is not null then
    select * into line from unit_spec_items where unit_spec_items.id = target_line and unit_id = u.id for update;
    if not found then raise exception 'Not authorized'; end if;
  elsif base is not null then
    select * into line from unit_spec_items where unit_id = u.id and base_item_id = base and status <> 'CANCELLED' for update;
  end if;
  if line.id is not null then
    if not public.unit_spec_editable(line.status, line.variation_order_id) then raise exception 'Spec line locked'; end if;
    if line.base_item_id is distinct from base then
      raise exception 'Invalid spec';
    end if;
  end if;

  if line.id is null then
    insert into unit_spec_items (organization_id, project_id, unit_id, base_item_id, kind, category, name, created_by)
    values (pr.organization_id, u.project_id, u.id, base, k,
      case when k = 'ADD' then upper(data->>'category') end, public.spec_text(data, 'name'), auth.uid())
    returning unit_spec_items.id into id;
  else
    id := line.id;
  end if;
  update unit_spec_items set kind = k, option_id = opt,
    category = case when k = 'ADD' then upper(data->>'category') end,
    area = public.spec_text(data, 'area'), name = public.spec_text(data, 'name'),
    description = public.spec_text(data, 'description'), brand = public.spec_text(data, 'brand'),
    model = public.spec_text(data, 'model'), color = public.spec_text(data, 'color'),
    size = public.spec_text(data, 'size'), supplier = public.spec_text(data, 'supplier'),
    quantity = case when k = 'OMIT' then null else public.spec_amount(data, 'quantity') end,
    unit = public.spec_text(data, 'unit'),
    unit_price = case when k = 'OMIT' then null else public.spec_amount(data, 'unit_price') end,
    customer_price = public.spec_amount(data, 'customer_price', true), note = public.spec_text(data, 'note'),
    status = 'DRAFT', variation_order_id = null, updated_at = now()
   where unit_spec_items.id = id;
  return id;
end $$;

-- Back to the standard: cancels a draft (or freed) change.
create or replace function public.cancel_unit_spec(target_line uuid)
returns void language plpgsql security definer set search_path = public as $$
declare line unit_spec_items;
begin
  select * into line from unit_spec_items where id = target_line for update;
  if not found or not public.can_design(line.project_id, 'EDIT') then raise exception 'Not authorized'; end if;
  if not public.unit_spec_editable(line.status, line.variation_order_id) then raise exception 'Spec line locked'; end if;
  update unit_spec_items set status = 'CANCELLED', updated_at = now() where id = line.id;
end $$;

-- Turns a unit's draft changes into one VO: each paid change is an ADD item, each credit an OMIT
-- item, and the cost difference goes to the VO's contractor cost. Returns the VO id.
create or replace function public.create_spec_variation(target_unit uuid, title text)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  u units;
  r record;
  items jsonb := '[]'::jsonb;
  revised text := '';
  original text := '';
  cost numeric := 0;
  ids uuid[] := '{}';
  label text;
  vo uuid;
begin
  select * into u from units where units.id = target_unit;
  if not found or not public.can_design(u.project_id, 'EDIT') then raise exception 'Not authorized'; end if;
  for r in select * from public.unit_spec_lines(u.id) l where l.line_id is not null and l.editable loop
    if r.charge is null then raise exception 'Spec price missing'; end if;
    label := concat_ws(' ', case r.kind when 'ADD' then '[+]' when 'OMIT' then '[-]' else '[~]' end,
      nullif(r.item_no, 'ADD'), r.name,
      nullif(concat_ws(' / ', r.brand, r.model, r.color, r.size), ''));
    revised := revised || label || E'\n';
    if r.kind <> 'ADD' then
      original := original || concat_ws(' ', r.item_no, r.name,
        nullif(concat_ws(' / ', r.std_brand, r.std_model, r.std_color, r.std_size), '')) || E'\n';
    end if;
    if r.charge <> 0 then
      items := items || jsonb_build_object('kind', case when r.charge > 0 then 'ADD' else 'OMIT' end,
        'description', left(label, 500), 'quantity', 1, 'unit', 'รายการ', 'unit_price', abs(r.charge));
    end if;
    cost := cost + coalesce(r.cost_delta, 0);
    ids := ids || r.line_id;
  end loop;
  if cardinality(ids) = 0 then raise exception 'Invalid variation'; end if;
  vo := public.create_variation(u.project_id, jsonb_build_object(
    'unit_id', u.id,
    'title', coalesce(nullif(trim(title), ''), 'Spec upgrade ' || u.code),
    'original_scope', coalesce(nullif(trim(original), ''), '-'),
    'revised_scope', trim(revised),
    'cost_delta', cost,
    'price_delta', 0,
    'customer_facing', true,
    'items', case when jsonb_array_length(items) = 0 then null else items end));
  update unit_spec_items set status = 'IN_VO', variation_order_id = vo, updated_at = now()
   where unit_spec_items.id = any(ids);
  return vo;
end $$;

-- ---------------------------------------------------------------- grants

do $$
declare f text;
begin
  foreach f in array array[
    'spec_text(jsonb, text)', 'spec_amount(jsonb, text, boolean)', 'unit_spec_editable(text, uuid)',
    'unit_spec_lines(uuid)', 'upsert_spec_item(uuid, uuid, jsonb)', 'remove_spec_item(uuid)',
    'upsert_spec_option(uuid, uuid, jsonb)', 'remove_spec_option(uuid)', 'save_unit_spec(uuid, uuid, jsonb)',
    'cancel_unit_spec(uuid)', 'create_spec_variation(uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
