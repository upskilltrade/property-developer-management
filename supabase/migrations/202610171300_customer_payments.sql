-- Customer payment schedule, evidence, finance verification and receipts
-- (MVP-ROADMAP Release 2, BUSINESS-PROCESS-MAP Process 23, DATA-MODEL §16).
--
-- Scheduled → Due → Evidence submitted → Finance verification → Paid.
-- Evidence never makes an installment paid by itself; only a payment recorded by Finance does.
-- Payments are never edited or deleted: a mistake is corrected by a reversal. Evidence files live
-- in the private payment-evidence bucket; tables store only the object path.

-- ---------------------------------------------------------------- permissions

-- Finance may verify / record / reverse payments (FINANCE.APPROVE or POST); owners always can.
create or replace function public.can_verify_payments(target_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from projects p
     where p.id = target_project
       and (public.can_manage_access(p.organization_id)
         or public.has_effective_permission(p.organization_id, p.id, 'FINANCE', 'APPROVE')
         or public.has_effective_permission(p.organization_id, p.id, 'FINANCE', 'POST')));
$$;

-- Finance may set up schedules (FINANCE.CREATE or EDIT); owners always can.
create or replace function public.can_manage_payment_schedule(target_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from projects p
     where p.id = target_project
       and (public.can_manage_access(p.organization_id)
         or public.has_effective_permission(p.organization_id, p.id, 'FINANCE', 'CREATE')
         or public.has_effective_permission(p.organization_id, p.id, 'FINANCE', 'EDIT')));
$$;

-- The signed-in customer bought this unit.
create or replace function public.is_unit_customer(target_unit uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from unit_sales us join customers c on c.id = us.customer_id
     where us.unit_id = target_unit and c.primary_profile_id = auth.uid());
$$;

-- ---------------------------------------------------------------- tables

create table if not exists public.payment_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  sequence int not null,
  kind text not null check (kind in ('BOOKING','CONTRACT','INSTALLMENT','TRANSFER','OTHER')),
  label_th text not null,
  label_en text not null,
  amount numeric(18,2) not null check (amount > 0),
  due_date date not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','WAIVED','CANCELLED')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One active installment per sequence; replaced schedules stay as CANCELLED history.
create unique index if not exists payment_schedules_active_seq_idx
  on public.payment_schedules(unit_id, sequence) where status = 'ACTIVE';

create table if not exists public.payment_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  schedule_id uuid not null references public.payment_schedules(id) on delete cascade,
  amount numeric(18,2) not null check (amount > 0),
  paid_on date not null,
  method text not null check (method in ('TRANSFER','CASH','CHEQUE','CARD','OTHER')),
  reference text,
  note text,
  file_path text,
  submitted_by uuid references public.profiles(id),
  submitted_by_customer boolean not null default false,
  submitted_at timestamptz not null default now(),
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED','VERIFIED','REJECTED')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text
);
create index if not exists payment_evidence_schedule_idx on public.payment_evidence(schedule_id, submitted_at desc);
create index if not exists payment_evidence_pending_idx on public.payment_evidence(project_id) where status = 'SUBMITTED';

create table if not exists public.document_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  prefix text not null,
  period text not null,
  last_no int not null default 0,
  primary key (organization_id, prefix, period)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  schedule_id uuid not null references public.payment_schedules(id),
  evidence_id uuid references public.payment_evidence(id),
  amount numeric(18,2) not null check (amount > 0),
  currency_code char(3) not null default 'THB',
  paid_on date not null,
  method text not null check (method in ('TRANSFER','CASH','CHEQUE','CARD','OTHER')),
  reference text,
  receipt_no text not null,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz not null default now(),
  status text not null default 'VALID' check (status in ('VALID','REVERSED')),
  reversed_by uuid references public.profiles(id),
  reversed_at timestamptz,
  reversal_reason text,
  unique (organization_id, receipt_no)
);
create index if not exists payments_schedule_idx on public.payments(schedule_id);

-- RLS: internal project members read; writes only through RPCs. Customers use RPCs.
alter table public.payment_schedules enable row level security;
alter table public.payment_evidence enable row level security;
alter table public.payments enable row level security;
alter table public.document_counters enable row level security;

create policy payment_schedules_project_select on public.payment_schedules
  for select to authenticated using (public.can_access_project(project_id));
create policy payment_evidence_project_select on public.payment_evidence
  for select to authenticated using (public.can_access_project(project_id));
create policy payments_project_select on public.payments
  for select to authenticated using (public.can_access_project(project_id));

-- ---------------------------------------------------------------- derived status

-- Status is derived from verified payments and pending evidence, never typed in.
create or replace view public.payment_schedule_status with (security_invoker = true) as
select s.*,
       coalesce(p.paid, 0) as paid_amount,
       greatest(s.amount - coalesce(p.paid, 0), 0) as outstanding,
       coalesce(e.pending, 0) as pending_evidence,
       case
         when s.status <> 'ACTIVE' then s.status
         when coalesce(p.paid, 0) >= s.amount then 'PAID'
         when coalesce(e.pending, 0) > 0 then 'SUBMITTED'
         when coalesce(p.paid, 0) > 0 and s.due_date < current_date then 'OVERDUE'
         when coalesce(p.paid, 0) > 0 then 'PARTIAL'
         when s.due_date < current_date then 'OVERDUE'
         when s.due_date <= current_date + 7 then 'DUE'
         else 'SCHEDULED'
       end as payment_status
  from payment_schedules s
  left join (select schedule_id, sum(amount) paid from payments where status = 'VALID' group by schedule_id) p
    on p.schedule_id = s.id
  left join (select schedule_id, count(*) pending from payment_evidence where status = 'SUBMITTED' group by schedule_id) e
    on e.schedule_id = s.id;
grant select on public.payment_schedule_status to authenticated;

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-evidence', 'payment-evidence', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create or replace function public.can_upload_payment_evidence(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  -- <org>/<project>/<unit>/<schedule>/<file>
  select exists(
    select 1 from payment_schedules s
     where s.id = public.try_uuid((storage.foldername(object_name))[4])
       and s.unit_id = public.try_uuid((storage.foldername(object_name))[3])
       and s.project_id = public.try_uuid((storage.foldername(object_name))[2])
       and s.organization_id = public.try_uuid((storage.foldername(object_name))[1])
       and (public.is_unit_customer(s.unit_id) or public.can_access_project(s.project_id)));
$$;

create or replace function public.can_read_payment_evidence(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from payment_evidence e
     where e.file_path = object_name
       and (public.can_access_project(e.project_id) or public.is_unit_customer(e.unit_id)));
$$;

create policy payment_evidence_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'payment-evidence' and public.can_upload_payment_evidence(name));
create policy payment_evidence_read on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-evidence' and public.can_read_payment_evidence(name));

-- ---------------------------------------------------------------- RPCs

create or replace function public.next_document_no(target_org uuid, doc_prefix text)
returns text language plpgsql security definer set search_path = public as $$
declare
  p text := to_char(current_date, 'YYYYMM');
  n int;
begin
  insert into document_counters (organization_id, prefix, period, last_no)
  values (target_org, doc_prefix, p, 1)
  on conflict (organization_id, prefix, period) do update set last_no = document_counters.last_no + 1
  returning last_no into n;
  return doc_prefix || '-' || p || '-' || lpad(n::text, 4, '0');
end $$;
revoke all on function public.next_document_no(uuid, text) from public, anon, authenticated;

-- Replace a unit's schedule while nothing has been paid or submitted against it.
-- items: [{"kind","label_th","label_en","amount","due_date"}]
create or replace function public.set_payment_schedule(target_unit uuid, items jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  u record;
  sale record;
  item jsonb;
  seq int := 0;
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
    insert into payment_schedules (organization_id, project_id, unit_id, customer_id, sequence, kind,
      label_th, label_en, amount, due_date, created_by)
    values (u.organization_id, u.project_id, target_unit, sale.customer_id, seq,
      coalesce(nullif(item->>'kind', ''), 'INSTALLMENT'),
      coalesce(nullif(trim(item->>'label_th'), ''), 'งวดที่ ' || seq),
      coalesce(nullif(trim(item->>'label_en'), ''), 'Installment ' || seq),
      (item->>'amount')::numeric, (item->>'due_date')::date, auth.uid());
  end loop;
  return seq;
end $$;

-- Customer (or staff on their behalf) submits proof of payment. It does not mark anything paid.
create or replace function public.submit_payment_evidence(target_schedule uuid, amount numeric, paid_on date,
  method text, reference text, note text, file_path text)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  s payment_schedules;
  as_customer boolean;
  id uuid;
begin
  select * into s from payment_schedules where payment_schedules.id = target_schedule;
  if not found or s.status <> 'ACTIVE' then raise exception 'Installment not found'; end if;
  as_customer := public.is_unit_customer(s.unit_id);
  if not as_customer and not public.can_access_project(s.project_id) then raise exception 'Not authorized'; end if;
  if amount is null or amount <= 0 then raise exception 'Invalid amount'; end if;
  if paid_on is null or paid_on > current_date then raise exception 'Invalid date'; end if;
  if method not in ('TRANSFER','CASH','CHEQUE','CARD','OTHER') then raise exception 'Invalid method'; end if;
  if file_path is null and as_customer then raise exception 'Evidence file required'; end if;
  if file_path is not null and (
       left(file_path, length(s.organization_id || '/' || s.project_id || '/' || s.unit_id || '/' || s.id || '/'))
         <> s.organization_id || '/' || s.project_id || '/' || s.unit_id || '/' || s.id || '/'
       or not exists(select 1 from storage.objects o where o.bucket_id = 'payment-evidence' and o.name = file_path)) then
    raise exception 'Evidence file not uploaded';
  end if;

  insert into payment_evidence (organization_id, project_id, unit_id, schedule_id, amount, paid_on, method,
    reference, note, file_path, submitted_by, submitted_by_customer)
  values (s.organization_id, s.project_id, s.unit_id, s.id, amount, paid_on, method,
    nullif(trim(reference), ''), nullif(trim(note), ''), file_path, auth.uid(), as_customer)
  returning payment_evidence.id into id;
  return id;
end $$;

-- Finance verifies evidence: creates the official payment and its receipt number.
-- Staff may not verify evidence they submitted themselves.
create or replace function public.verify_payment_evidence(target_evidence uuid, amount numeric, paid_on date, note text)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  e payment_evidence;
  pay uuid;
begin
  select * into e from payment_evidence where payment_evidence.id = target_evidence for update;
  if not found then raise exception 'Evidence not found'; end if;
  if not public.can_verify_payments(e.project_id) then raise exception 'Not authorized'; end if;
  if e.status <> 'SUBMITTED' then raise exception 'Evidence already reviewed'; end if;
  if not e.submitted_by_customer and e.submitted_by = auth.uid() then
    raise exception 'Submitter cannot verify their own evidence';
  end if;
  if amount is null or amount <= 0 then raise exception 'Invalid amount'; end if;

  update payment_evidence set status = 'VERIFIED', reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = nullif(trim(note), '')
   where payment_evidence.id = e.id;
  insert into payments (organization_id, project_id, unit_id, schedule_id, evidence_id, amount, paid_on,
    method, reference, receipt_no, verified_by)
  values (e.organization_id, e.project_id, e.unit_id, e.schedule_id, e.id, amount, coalesce(paid_on, e.paid_on),
    e.method, e.reference, public.next_document_no(e.organization_id, 'RC'), auth.uid())
  returning payments.id into pay;
  return pay;
end $$;

create or replace function public.reject_payment_evidence(target_evidence uuid, note text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  e payment_evidence;
begin
  select * into e from payment_evidence where payment_evidence.id = target_evidence for update;
  if not found then raise exception 'Evidence not found'; end if;
  if not public.can_verify_payments(e.project_id) then raise exception 'Not authorized'; end if;
  if e.status <> 'SUBMITTED' then raise exception 'Evidence already reviewed'; end if;
  if coalesce(trim(note), '') = '' then raise exception 'Reason required'; end if;
  update payment_evidence set status = 'REJECTED', reviewed_by = auth.uid(), reviewed_at = now(), review_note = trim(note)
   where payment_evidence.id = e.id;
end $$;

-- Finance records money it received directly (e.g. cash at the office).
create or replace function public.record_payment(target_schedule uuid, amount numeric, paid_on date,
  method text, reference text)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  s payment_schedules;
  pay uuid;
begin
  select * into s from payment_schedules where payment_schedules.id = target_schedule;
  if not found or s.status <> 'ACTIVE' then raise exception 'Installment not found'; end if;
  if not public.can_verify_payments(s.project_id) then raise exception 'Not authorized'; end if;
  if amount is null or amount <= 0 then raise exception 'Invalid amount'; end if;
  if paid_on is null or paid_on > current_date then raise exception 'Invalid date'; end if;
  if method not in ('TRANSFER','CASH','CHEQUE','CARD','OTHER') then raise exception 'Invalid method'; end if;
  insert into payments (organization_id, project_id, unit_id, schedule_id, amount, paid_on, method, reference,
    receipt_no, verified_by)
  values (s.organization_id, s.project_id, s.unit_id, s.id, amount, paid_on, method, nullif(trim(reference), ''),
    public.next_document_no(s.organization_id, 'RC'), auth.uid())
  returning payments.id into pay;
  return pay;
end $$;

-- Verified payments are corrected by reversal, never edited or deleted.
create or replace function public.reverse_payment(target_payment uuid, reason text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  pm payments;
begin
  select * into pm from payments where payments.id = target_payment for update;
  if not found then raise exception 'Payment not found'; end if;
  if not public.can_verify_payments(pm.project_id) then raise exception 'Not authorized'; end if;
  if pm.status <> 'VALID' then raise exception 'Payment already reversed'; end if;
  if coalesce(trim(reason), '') = '' then raise exception 'Reason required'; end if;
  update payments set status = 'REVERSED', reversed_by = auth.uid(), reversed_at = now(), reversal_reason = trim(reason)
   where payments.id = pm.id;
end $$;

-- Customer view of their own installments, evidence and receipts.
create or replace function public.get_customer_payments()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'unit_id', u.id, 'unit_code', u.code, 'project_name', pr.name,
    'organization_id', pr.organization_id, 'project_id', pr.id,
    'installments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'sequence', s.sequence, 'kind', s.kind, 'label_th', s.label_th, 'label_en', s.label_en,
        'amount', s.amount, 'due_date', s.due_date, 'paid_amount', s.paid_amount, 'outstanding', s.outstanding,
        'status', s.payment_status,
        'evidence', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', e.id, 'amount', e.amount, 'paid_on', e.paid_on, 'status', e.status,
            'review_note', case when e.status = 'REJECTED' then e.review_note end,
            'file_path', e.file_path, 'submitted_at', e.submitted_at) order by e.submitted_at desc), '[]'::jsonb)
          from payment_evidence e where e.schedule_id = s.id),
        'receipts', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', pm.id, 'receipt_no', pm.receipt_no, 'amount', pm.amount, 'paid_on', pm.paid_on)
            order by pm.paid_on), '[]'::jsonb)
          from payments pm where pm.schedule_id = s.id and pm.status = 'VALID')
      ) order by s.sequence), '[]'::jsonb)
        from payment_schedule_status s where s.unit_id = u.id and s.status = 'ACTIVE')
  ) order by u.code), '[]'::jsonb)
  from customers c
  join unit_sales us on us.customer_id = c.id
  join units u on u.id = us.unit_id
  join projects pr on pr.id = u.project_id
  where c.primary_profile_id = auth.uid();
$$;

-- One receipt, for the customer who owns the unit or internal project members.
create or replace function public.get_receipt(target_payment uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'receipt_no', pm.receipt_no, 'amount', pm.amount, 'currency', pm.currency_code, 'paid_on', pm.paid_on,
    'method', pm.method, 'reference', pm.reference, 'status', pm.status, 'verified_at', pm.verified_at,
    'installment_th', s.label_th, 'installment_en', s.label_en,
    'unit_code', u.code, 'project_name', pr.name, 'organization_name', o.name,
    'customer_name', c.full_name)
  from payments pm
  join payment_schedules s on s.id = pm.schedule_id
  join units u on u.id = pm.unit_id
  join projects pr on pr.id = pm.project_id
  join organizations o on o.id = pm.organization_id
  left join customers c on c.id = s.customer_id
  where pm.id = target_payment
    and (public.can_access_project(pm.project_id) or public.is_unit_customer(pm.unit_id));
$$;

revoke all on function public.can_verify_payments(uuid) from public, anon;
revoke all on function public.can_manage_payment_schedule(uuid) from public, anon;
revoke all on function public.is_unit_customer(uuid) from public, anon;
revoke all on function public.can_upload_payment_evidence(text) from public, anon;
revoke all on function public.can_read_payment_evidence(text) from public, anon;
revoke all on function public.set_payment_schedule(uuid, jsonb) from public, anon;
revoke all on function public.submit_payment_evidence(uuid, numeric, date, text, text, text, text) from public, anon;
revoke all on function public.verify_payment_evidence(uuid, numeric, date, text) from public, anon;
revoke all on function public.reject_payment_evidence(uuid, text) from public, anon;
revoke all on function public.record_payment(uuid, numeric, date, text, text) from public, anon;
revoke all on function public.reverse_payment(uuid, text) from public, anon;
revoke all on function public.get_customer_payments() from public, anon;
revoke all on function public.get_receipt(uuid) from public, anon;
grant execute on function public.can_verify_payments(uuid) to authenticated;
grant execute on function public.can_manage_payment_schedule(uuid) to authenticated;
grant execute on function public.is_unit_customer(uuid) to authenticated;
grant execute on function public.can_upload_payment_evidence(text) to authenticated;
grant execute on function public.can_read_payment_evidence(text) to authenticated;
grant execute on function public.set_payment_schedule(uuid, jsonb) to authenticated;
grant execute on function public.submit_payment_evidence(uuid, numeric, date, text, text, text, text) to authenticated;
grant execute on function public.verify_payment_evidence(uuid, numeric, date, text) to authenticated;
grant execute on function public.reject_payment_evidence(uuid, text) to authenticated;
grant execute on function public.record_payment(uuid, numeric, date, text, text) to authenticated;
grant execute on function public.reverse_payment(uuid, text) to authenticated;
grant execute on function public.get_customer_payments() to authenticated;
grant execute on function public.get_receipt(uuid) to authenticated;
