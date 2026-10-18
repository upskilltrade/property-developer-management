-- Project financial plan: round-number forecast by category (revenue and costs), sell-out period,
-- sales mode (self vs sole agent), tax and transfer rates entered by the owner, compared with
-- actuals from the system. Owner/Admin edit; people who may view project finance can read.
-- Rates are never defaulted: the owner or their accountant enters them.

create or replace function public.can_plan_forecast(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from organization_memberships om
    join membership_roles mr on mr.membership_id = om.id join roles r on r.id = mr.role_id
   where om.organization_id = target_org and om.user_id = auth.uid() and om.status = 'ACTIVE'
     and r.code in ('OWNER', 'ADMIN') and r.is_system and mr.scope_type = 'ORGANIZATION');
$$;

create table if not exists public.forecast_plans (
  project_id uuid primary key references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  start_month date not null default date_trunc('month', current_date)::date,
  sell_out_months int not null default 24 check (sell_out_months between 1 and 240),
  sales_mode text not null default 'SELF' check (sales_mode in ('SELF', 'AGENT')),
  agent_commission_pct numeric(6,3) check (agent_commission_pct between 0 and 100),
  target_margin_pct numeric(6,3) check (target_margin_pct between 0 and 100),
  transfer_fee_pct numeric(6,3) check (transfer_fee_pct between 0 and 100),
  developer_transfer_share_pct numeric(6,3) check (developer_transfer_share_pct between 0 and 100),
  business_tax_pct numeric(6,3) check (business_tax_pct between 0 and 100),
  income_tax_pct numeric(6,3) check (income_tax_pct between 0 and 100),
  notes text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.forecast_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('REVENUE', 'COST')),
  category text not null check (category in (
    'SALES_HOUSES','OTHER_REVENUE',
    'LAND','PERMITS','DESIGN','SITE_PREP','INFRASTRUCTURE','COMMON_AREA','CONSTRUCTION','SHOWHOUSE',
    'MARKETING','SALES_TEAM','PROMOTIONS','UTILITY_GUARANTEE','JURISTIC_FUND','WARRANTY_RESERVE',
    'HOLDING','FINANCE','ADMIN','CONTINGENCY','OTHER')),
  label text not null,
  method text not null check (method in ('LUMP','PER_SQM','PER_UNIT','PCT_REVENUE','UNITS_FROM_SYSTEM')),
  amount numeric(18,2) not null default 0 check (amount >= 0),
  rate numeric(18,2) not null default 0 check (rate >= 0),
  quantity numeric(18,3) not null default 0 check (quantity >= 0),
  pct numeric(6,3) not null default 0 check (pct between 0 and 100),
  timing text not null default 'SPREAD' check (timing in ('START','SPREAD','WITH_SALES','END')),
  -- Where actual spending for this line comes from (one line per cost category).
  cost_category_id uuid references public.cost_categories(id),
  -- Sales and marketing done in-house; left out when the project sells through a sole agent.
  self_sales_only boolean not null default false,
  sort_order int not null default 0,
  removed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists forecast_lines_project_idx on public.forecast_lines(project_id) where removed_at is null;
create unique index if not exists forecast_lines_category_link_uq on public.forecast_lines(project_id, cost_category_id)
  where cost_category_id is not null and removed_at is null;

alter table public.forecast_plans enable row level security;
alter table public.forecast_lines enable row level security;
create policy forecast_plans_select on public.forecast_plans for select to authenticated
  using (public.can_plan_forecast(organization_id) or public.can_view_finance(project_id));
create policy forecast_lines_select on public.forecast_lines for select to authenticated
  using (public.can_plan_forecast(organization_id) or public.can_view_finance(project_id));

-- Creates the plan with every category as a zero line, linked to the matching cost category.
create or replace function public.init_project_forecast(target_project uuid)
returns void language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  select organization_id into org from projects where id = target_project;
  if org is null or not public.can_plan_forecast(org) then raise exception 'Not authorized'; end if;
  insert into forecast_plans (project_id, organization_id, updated_by) values (target_project, org, auth.uid())
  on conflict (project_id) do nothing;
  if exists(select 1 from forecast_lines where project_id = target_project) then return; end if;
  insert into forecast_lines (organization_id, project_id, kind, category, label, method, timing, cost_category_id, self_sales_only, sort_order)
  select org, target_project, d.kind, d.category, d.label, d.method, d.timing,
         (select c.id from cost_categories c where c.organization_id = org and c.active and c.category_type = d.ctype
           order by c.code limit 1),
         d.self_only, d.ord
    from (values
      ('REVENUE','SALES_HOUSES','ขายบ้าน','UNITS_FROM_SYSTEM','WITH_SALES',null,false,10),
      ('REVENUE','OTHER_REVENUE','รายรับอื่น','LUMP','WITH_SALES',null,false,20),
      ('COST','LAND','ค่าที่ดิน','LUMP','START','LAND',false,110),
      ('COST','PERMITS','ค่าขออนุญาต / ค่าธรรมเนียมราชการ','LUMP','START','PRE_DEVELOPMENT',false,120),
      ('COST','DESIGN','ค่าออกแบบ / วิศวกร / ที่ปรึกษา','LUMP','START','PROFESSIONAL',false,130),
      ('COST','SITE_PREP','ถมดิน / ปรับพื้นที่','LUMP','START',null,false,140),
      ('COST','INFRASTRUCTURE','สาธารณูปโภค (ถนน ไฟ น้ำ ระบายน้ำ)','LUMP','SPREAD','INFRASTRUCTURE',false,150),
      ('COST','COMMON_AREA','ส่วนกลาง / ภูมิทัศน์ / ป้อมยาม','LUMP','SPREAD',null,false,160),
      ('COST','CONSTRUCTION','ก่อสร้างบ้าน','PER_SQM','WITH_SALES','CONSTRUCTION',false,170),
      ('COST','SHOWHOUSE','บ้านตัวอย่าง / สำนักงานขาย','LUMP','START',null,false,180),
      ('COST','MARKETING','การตลาด','LUMP','SPREAD','SALES_MARKETING',true,210),
      ('COST','SALES_TEAM','ทีมขาย (ขายเอง)','LUMP','SPREAD',null,true,220),
      ('COST','PROMOTIONS','ส่วนลด / ของแถม / โปรโมชั่น','PER_UNIT','WITH_SALES',null,false,230),
      ('COST','UTILITY_GUARANTEE','ค้ำประกันสาธารณูปโภค','LUMP','START',null,false,310),
      ('COST','JURISTIC_FUND','กองทุนและส่วนกลางก่อนตั้งนิติบุคคล','LUMP','END',null,false,320),
      ('COST','WARRANTY_RESERVE','สำรองรับประกันหลังส่งมอบ','LUMP','END',null,false,330),
      ('COST','HOLDING','ค่าถือครองระหว่างขาย','LUMP','SPREAD',null,false,340),
      ('COST','FINANCE','ดอกเบี้ย / ค่าธรรมเนียมการเงิน','LUMP','SPREAD','FINANCE',false,350),
      ('COST','ADMIN','บริหาร / ส่วนกลางบริษัท','LUMP','SPREAD','ADMIN',false,360),
      ('COST','CONTINGENCY','สำรองเผื่อฉุกเฉิน','LUMP','SPREAD','CONTINGENCY',false,370),
      ('COST','OTHER','อื่นๆ','LUMP','SPREAD',null,false,380)
    ) as d(kind, category, label, method, timing, ctype, self_only, ord);
end $$;

create or replace function public.save_forecast_plan(target_project uuid, data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare org uuid;
  pct text[] := array['agent_commission_pct','target_margin_pct','transfer_fee_pct','developer_transfer_share_pct','business_tax_pct','income_tax_pct'];
  k text;
begin
  select organization_id into org from projects where id = target_project;
  if org is null or not public.can_plan_forecast(org) then raise exception 'Not authorized'; end if;
  foreach k in array pct loop
    if nullif(data->>k, '') is not null and ((data->>k)::numeric < 0 or (data->>k)::numeric > 100) then
      raise exception 'Invalid plan';
    end if;
  end loop;
  insert into forecast_plans (project_id, organization_id) values (target_project, org) on conflict (project_id) do nothing;
  update forecast_plans set
    start_month = coalesce(date_trunc('month', nullif(data->>'start_month', '')::date)::date, start_month),
    sell_out_months = coalesce(nullif(data->>'sell_out_months', '')::int, sell_out_months),
    sales_mode = coalesce(nullif(data->>'sales_mode', ''), sales_mode),
    agent_commission_pct = nullif(data->>'agent_commission_pct', '')::numeric,
    target_margin_pct = nullif(data->>'target_margin_pct', '')::numeric,
    transfer_fee_pct = nullif(data->>'transfer_fee_pct', '')::numeric,
    developer_transfer_share_pct = nullif(data->>'developer_transfer_share_pct', '')::numeric,
    business_tax_pct = nullif(data->>'business_tax_pct', '')::numeric,
    income_tax_pct = nullif(data->>'income_tax_pct', '')::numeric,
    notes = nullif(trim(data->>'notes'), ''),
    updated_by = auth.uid(), updated_at = now()
   where project_id = target_project;
end $$;

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
     or (m = 'PCT_REVENUE' and k = 'REVENUE') then
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

create or replace function public.remove_forecast_line(target_line uuid)
returns void language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  select organization_id into org from forecast_lines where id = target_line;
  if org is null or not public.can_plan_forecast(org) then raise exception 'Not authorized'; end if;
  update forecast_lines set removed_at = now(), cost_category_id = null where id = target_line;
end $$;

revoke all on function public.can_plan_forecast(uuid) from public, anon;
revoke all on function public.init_project_forecast(uuid) from public, anon;
revoke all on function public.save_forecast_plan(uuid, jsonb) from public, anon;
revoke all on function public.save_forecast_line(uuid, jsonb) from public, anon;
revoke all on function public.remove_forecast_line(uuid) from public, anon;
grant execute on function public.can_plan_forecast(uuid) to authenticated;
grant execute on function public.init_project_forecast(uuid) to authenticated;
grant execute on function public.save_forecast_plan(uuid, jsonb) to authenticated;
grant execute on function public.save_forecast_line(uuid, jsonb) to authenticated;
grant execute on function public.remove_forecast_line(uuid) to authenticated;
