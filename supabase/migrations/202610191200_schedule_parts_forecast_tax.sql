-- 1) Customer instalments can point at a contract part (e.g. "land lease" vs "construction"), so the
--    money for each contract is tracked separately on leasehold / split deals.
-- 2) The financial plan taxes revenue by contract type: land-lease and construction-contract revenue
--    get their own owner-entered rates instead of the house-sale transfer fee and business tax.
--    These rates are never defaulted; the accountant sets them.

alter table public.payment_schedules add column if not exists contract_part_id uuid
  references public.contract_parts(id) on delete set null;
create index if not exists payment_schedules_contract_part_idx on public.payment_schedules (contract_part_id);

create or replace view public.payment_schedule_status with (security_invoker = true) as
 SELECT s.id, s.organization_id, s.project_id, s.unit_id, s.customer_id, s.sequence, s.kind, s.label_th, s.label_en,
    s.amount, s.due_date, s.status, s.created_by, s.created_at, s.updated_at,
    COALESCE(p.paid, 0::numeric) AS paid_amount,
    GREATEST(s.amount - COALESCE(p.paid, 0::numeric), 0::numeric) AS outstanding,
    COALESCE(e.pending, 0::bigint) AS pending_evidence,
        CASE
            WHEN s.status <> 'ACTIVE'::text THEN s.status
            WHEN COALESCE(p.paid, 0::numeric) >= s.amount THEN 'PAID'::text
            WHEN COALESCE(e.pending, 0::bigint) > 0 THEN 'SUBMITTED'::text
            WHEN COALESCE(p.paid, 0::numeric) > 0::numeric AND s.due_date < CURRENT_DATE THEN 'OVERDUE'::text
            WHEN COALESCE(p.paid, 0::numeric) > 0::numeric THEN 'PARTIAL'::text
            WHEN s.due_date < CURRENT_DATE THEN 'OVERDUE'::text
            WHEN s.due_date <= (CURRENT_DATE + 7) THEN 'DUE'::text
            ELSE 'SCHEDULED'::text
        END AS payment_status,
    s.contract_part_id
   FROM payment_schedules s
     LEFT JOIN ( SELECT payments.schedule_id, sum(payments.amount) AS paid
           FROM payments WHERE payments.status = 'VALID'::text GROUP BY payments.schedule_id) p ON p.schedule_id = s.id
     LEFT JOIN ( SELECT payment_evidence.schedule_id, count(*) AS pending
           FROM payment_evidence WHERE payment_evidence.status = 'SUBMITTED'::text GROUP BY payment_evidence.schedule_id) e
       ON e.schedule_id = s.id;

-- Same as before, plus an optional contract_part_id per item (must be a part of this unit's live contract).
create or replace function public.set_payment_schedule(target_unit uuid, items jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  u record;
  sale record;
  item jsonb;
  seq int := 0;
  part uuid;
begin
  select un.id, un.project_id, p.organization_id into u
    from units un join projects p on p.id = un.project_id where un.id = target_unit;
  if not found then raise exception 'Unit not found'; end if;
  if not public.can_manage_payment_schedule(u.project_id) then raise exception 'Not authorized'; end if;
  select * into sale from unit_sales where unit_id = target_unit;
  if sale.customer_id is null then raise exception 'Unit has no customer'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then raise exception 'Invalid schedule'; end if;
  if exists(select 1 from payment_evidence e join payment_schedules s on s.id = e.schedule_id where s.unit_id = target_unit)
     or exists(select 1 from payments pm join payment_schedules s on s.id = pm.schedule_id where s.unit_id = target_unit) then
    raise exception 'Schedule already has payments';
  end if;

  update payment_schedules set status = 'CANCELLED', updated_at = now()
   where unit_id = target_unit and status = 'ACTIVE';
  for item in select * from jsonb_array_elements(items) loop
    seq := seq + 1;
    if coalesce((item->>'amount')::numeric, 0) <= 0 or nullif(item->>'due_date', '') is null then
      raise exception 'Invalid schedule';
    end if;
    part := public.try_uuid(nullif(item->>'contract_part_id', ''));
    if part is not null and not exists(select 1 from contract_parts cp join sales_contracts sc on sc.id = cp.contract_id
        where cp.id = part and cp.removed_at is null and sc.unit_id = target_unit and sc.status <> 'CANCELLED') then
      raise exception 'Invalid schedule';
    end if;
    insert into payment_schedules (organization_id, project_id, unit_id, customer_id, sequence, kind,
      label_th, label_en, amount, due_date, created_by, contract_part_id)
    values (u.organization_id, u.project_id, target_unit, sale.customer_id, seq,
      coalesce(nullif(item->>'kind', ''), 'INSTALLMENT'),
      coalesce(nullif(trim(item->>'label_th'), ''), 'งวดที่ ' || seq),
      coalesce(nullif(trim(item->>'label_en'), ''), 'Installment ' || seq),
      (item->>'amount')::numeric, (item->>'due_date')::date, auth.uid(), part);
  end loop;
  return seq;
end $$;

alter table public.forecast_plans
  add column if not exists lease_tax_pct numeric(6,3) check (lease_tax_pct between 0 and 100),
  add column if not exists lease_fee_pct numeric(6,3) check (lease_fee_pct between 0 and 100),
  add column if not exists construction_tax_pct numeric(6,3) check (construction_tax_pct between 0 and 100);

create or replace function public.save_forecast_plan(target_project uuid, data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare org uuid;
  pct text[] := array['agent_commission_pct','target_margin_pct','transfer_fee_pct','developer_transfer_share_pct',
    'business_tax_pct','income_tax_pct','lease_tax_pct','lease_fee_pct','construction_tax_pct'];
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
    lease_tax_pct = case when data ? 'lease_tax_pct' then nullif(data->>'lease_tax_pct', '')::numeric else lease_tax_pct end,
    lease_fee_pct = case when data ? 'lease_fee_pct' then nullif(data->>'lease_fee_pct', '')::numeric else lease_fee_pct end,
    construction_tax_pct = case when data ? 'construction_tax_pct' then nullif(data->>'construction_tax_pct', '')::numeric else construction_tax_pct end,
    notes = nullif(trim(data->>'notes'), ''),
    updated_by = auth.uid(), updated_at = now()
   where project_id = target_project;
end $$;
