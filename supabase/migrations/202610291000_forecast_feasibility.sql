-- Financial plan, feasibility pass: interest worked out from the monthly cash shortfall instead of
-- a fixed amount, the project's total land area (for the sellable-area ratio), and starter lines
-- that were easy to forget (land purchase fees, legal, soil survey, in-house sales commission).
-- New plan fields stay empty until the owner enters them; empty means "not used".

alter table public.forecast_plans
  add column if not exists land_area_sqm numeric(14,2) check (land_area_sqm >= 0),
  add column if not exists loan_rate_pct numeric(6,3) check (loan_rate_pct between 0 and 100),
  add column if not exists equity_amount numeric(18,2) check (equity_amount >= 0);

create or replace function public.save_forecast_plan(target_project uuid, data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare org uuid;
  pct text[] := array['agent_commission_pct','target_margin_pct','transfer_fee_pct','developer_transfer_share_pct',
    'business_tax_pct','income_tax_pct','lease_tax_pct','lease_fee_pct','construction_tax_pct','loan_rate_pct'];
  k text;
begin
  select organization_id into org from projects where id = target_project;
  if org is null or not public.can_plan_forecast(org) then raise exception 'Not authorized'; end if;
  foreach k in array pct loop
    if nullif(data->>k, '') is not null and ((data->>k)::numeric < 0 or (data->>k)::numeric > 100) then
      raise exception 'Invalid plan';
    end if;
  end loop;
  foreach k in array array['land_area_sqm','equity_amount'] loop
    if nullif(data->>k, '') is not null and (data->>k)::numeric < 0 then raise exception 'Invalid plan'; end if;
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
    lease_tax_pct = case when data ? 'lease_tax_pct' then nullif(data->>'lease_tax_pct', '')::numeric else lease_tax_pct end,
    lease_fee_pct = case when data ? 'lease_fee_pct' then nullif(data->>'lease_fee_pct', '')::numeric else lease_fee_pct end,
    construction_tax_pct = case when data ? 'construction_tax_pct' then nullif(data->>'construction_tax_pct', '')::numeric else construction_tax_pct end,
    land_area_sqm = case when data ? 'land_area_sqm' then nullif(data->>'land_area_sqm', '')::numeric else land_area_sqm end,
    loan_rate_pct = case when data ? 'loan_rate_pct' then nullif(data->>'loan_rate_pct', '')::numeric else loan_rate_pct end,
    equity_amount = case when data ? 'equity_amount' then nullif(data->>'equity_amount', '')::numeric else equity_amount end,
    notes = nullif(trim(data->>'notes'), ''),
    updated_by = auth.uid(), updated_at = now()
   where project_id = target_project;
end $$;

-- Lines added for a new plan and, once, to plans that already exist (at 0, so no total changes).
create or replace function public.forecast_extra_lines()
returns table(kind text, category text, label text, method text, timing text, self_only boolean, ord int)
language sql immutable set search_path = public as $$
  values
    ('COST','LAND','ค่าโอน / รังวัด / นายหน้า ตอนซื้อที่ดิน','LUMP','START',false,111),
    ('COST','PERMITS','ค่ากฎหมาย / ทนาย / ที่ปรึกษาจัดสรร','LUMP','START',false,121),
    ('COST','DESIGN','สำรวจดิน / ทดสอบดิน','LUMP','START',false,131),
    ('COST','SALES_TEAM','ค่าคอมมิชชั่นทีมขาย','PCT_REVENUE','WITH_SALES',true,221)
$$;

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
    ) as d(kind, category, label, method, timing, ctype, self_only, ord)
  union all
  select org, target_project, x.kind, x.category, x.label, x.method, x.timing, null, x.self_only, x.ord
    from public.forecast_extra_lines() x;
end $$;

-- Existing plans get the new starter lines once, at 0.
insert into public.forecast_lines (organization_id, project_id, kind, category, label, method, timing, self_sales_only, sort_order)
select fp.organization_id, fp.project_id, x.kind, x.category, x.label, x.method, x.timing, x.self_only, x.ord
  from public.forecast_plans fp cross join public.forecast_extra_lines() x
 where exists(select 1 from public.forecast_lines l where l.project_id = fp.project_id)
   and not exists(select 1 from public.forecast_lines l
                   where l.project_id = fp.project_id and l.category = x.category and l.label = x.label);

revoke all on function public.forecast_extra_lines() from public, anon;
