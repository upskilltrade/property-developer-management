-- Online payment with Omise (Opn Payments) PromptPay: the customer pays an installment by scanning
-- a QR from Omise; when Omise reports the charge paid, the payment is recorded automatically.
-- * The app never trusts a webhook body or the browser: it retrieves the charge from Omise with the
--   secret key and only then calls settle_online_payment, which also requires a server-only key
--   kept in Vault ('payment_settle_key') and in the app's PAYMENT_SETTLE_KEY.
-- * The QR stays on Omise; only its link is stored.
-- * Settlement is idempotent and records exactly one payment per charge.

create table if not exists public.online_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  schedule_id uuid not null references public.payment_schedules(id),
  provider text not null default 'OMISE' check (provider in ('OMISE')),
  method text not null default 'PROMPTPAY' check (method in ('PROMPTPAY')),
  amount numeric(18,2) not null check (amount > 0),
  currency char(3) not null default 'THB',
  status text not null default 'CREATED' check (status in ('CREATED','PENDING','SUCCESSFUL','FAILED','EXPIRED')),
  charge_id text unique,
  qr_image_uri text,
  expires_at timestamptz,
  failure_message text,
  payment_id uuid references public.payments(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists online_payments_schedule_idx on public.online_payments(schedule_id, created_at desc);
create index if not exists online_payments_unit_idx on public.online_payments(unit_id);
alter table public.online_payments enable row level security;
create policy online_payments_select on public.online_payments for select to authenticated
  using (public.is_unit_customer(unit_id) or public.can_access_project(project_id));

alter table public.payments add column if not exists online_payment_id uuid references public.online_payments(id);
create unique index if not exists payments_online_payment_uq on public.payments(online_payment_id) where online_payment_id is not null;

-- Step 1 (customer or staff): reserve an online payment for an installment.
create or replace function public.begin_online_payment(target_schedule uuid, pay_amount numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare s payment_schedule_status; oid uuid;
begin
  select * into s from payment_schedule_status where id = target_schedule;
  if s.id is null or s.status <> 'ACTIVE' then raise exception 'Installment not found'; end if;
  if not (public.is_unit_customer(s.unit_id) or public.can_access_project(s.project_id)) then
    raise exception 'Not authorized';
  end if;
  if pay_amount is null or pay_amount <= 0 or pay_amount > s.outstanding or pay_amount <> round(pay_amount, 2) then
    raise exception 'Invalid amount';
  end if;
  -- One live QR per installment: older unpaid attempts are closed.
  update online_payments set status = 'EXPIRED', updated_at = now()
   where schedule_id = s.id and status in ('CREATED','PENDING');
  insert into online_payments (organization_id, project_id, unit_id, schedule_id, amount, created_by)
  values (s.organization_id, s.project_id, s.unit_id, s.id, pay_amount, auth.uid())
  returning id into oid;
  return oid;
end $$;

-- Step 2 (same person): attach the Omise charge and its QR link. A charge id can be set once;
-- whatever is attached here is re-checked against Omise before anything is paid.
create or replace function public.attach_online_charge(target uuid, omise_charge text, qr_uri text, expires timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(omise_charge, '') !~ '^chrg_[A-Za-z0-9_]+$' then raise exception 'Invalid charge'; end if;
  if qr_uri is not null and qr_uri !~ '^https://' then raise exception 'Invalid charge'; end if;
  update online_payments set charge_id = omise_charge, qr_image_uri = qr_uri, expires_at = expires,
         status = 'PENDING', updated_at = now()
   where id = target and status = 'CREATED' and charge_id is null and created_by = auth.uid();
  if not found then raise exception 'Not authorized'; end if;
end $$;

-- Step 3 (server only, after retrieving the charge from Omise): record the outcome.
-- Amounts arrive in satang as Omise reports them.
create or replace function public.settle_online_payment(settle_key text, target uuid, omise_charge text,
  charge_status text, charge_amount_satang bigint, charge_currency text, paid timestamptz, failure text)
returns text language plpgsql security definer set search_path = public as $$
declare
  op online_payments;
  key text := public.vault_secret('payment_settle_key');
  pay uuid;
begin
  if key is null or settle_key is distinct from key then raise exception 'Not authorized'; end if;
  select * into op from online_payments where id = target for update;
  if op.id is null or op.charge_id is distinct from omise_charge then raise exception 'Unknown charge'; end if;
  if op.status = 'SUCCESSFUL' then return 'SUCCESSFUL'; end if;

  if charge_status = 'successful' then
    if upper(charge_currency) <> op.currency or charge_amount_satang <> round(op.amount * 100) then
      raise exception 'Charge does not match';
    end if;
    insert into payments (organization_id, project_id, unit_id, schedule_id, amount, paid_on, method, reference,
      receipt_no, verified_by, online_payment_id)
    values (op.organization_id, op.project_id, op.unit_id, op.schedule_id, op.amount,
      (coalesce(paid, now()) at time zone 'Asia/Bangkok')::date, 'TRANSFER', 'Omise PromptPay ' || op.charge_id,
      public.next_document_no(op.organization_id, 'RC'), null, op.id)
    returning id into pay;
    update online_payments set status = 'SUCCESSFUL', paid_at = coalesce(paid, now()), payment_id = pay,
           updated_at = now() where id = op.id;
    perform public.log_timeline(op.organization_id, op.project_id, op.unit_id, 'PAYMENT_RECEIVED_ONLINE',
      'payment', pay, 'Omise PromptPay ' || to_char(op.amount, 'FM999,999,999,990.00'), '{}'::jsonb);
    return 'SUCCESSFUL';
  elsif charge_status in ('failed', 'expired', 'reversed') then
    update online_payments set status = case when charge_status = 'failed' then 'FAILED' else 'EXPIRED' end,
           failure_message = left(failure, 300), updated_at = now() where id = op.id;
    return upper(charge_status);
  end if;
  return op.status;
end $$;

revoke all on function public.begin_online_payment(uuid, numeric) from public, anon;
revoke all on function public.attach_online_charge(uuid, text, text, timestamptz) from public, anon;
revoke all on function public.settle_online_payment(text, uuid, text, text, bigint, text, timestamptz, text) from public;
grant execute on function public.begin_online_payment(uuid, numeric) to authenticated;
grant execute on function public.attach_online_charge(uuid, text, text, timestamptz) to authenticated;
-- The webhook has no user session; the settle key is what authorizes the call.
grant execute on function public.settle_online_payment(text, uuid, text, text, bigint, text, timestamptz, text) to anon, authenticated;
