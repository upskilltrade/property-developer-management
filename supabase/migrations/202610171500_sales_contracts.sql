-- Sales contracts and Customer 360° (MVP-ROADMAP Release 1 close-out, Release 2 contract core).
-- Booking -> Contract (draft versions) -> Signed (version and file locked).
--
-- A contract belongs to a confirmed booking. Every change while it is a draft creates a new
-- version; versions are append-only (a trigger rejects UPDATE/DELETE even from definer code), and
-- signing pins the version and the signed PDF, which lives in the private contract-files bucket
-- (the table stores only the object path). Customer rows become visible only to people who work
-- on that customer's projects in sales, customer relations or finance, or to the customer.

-- ---------------------------------------------------------------- customer visibility

create or replace function public.can_see_customer(target_customer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from customers c
     where c.id = target_customer
       and (c.primary_profile_id = auth.uid()
         or public.can_manage_access(c.organization_id)
         or exists(
           select 1 from (
             select u.project_id from unit_sales us join units u on u.id = us.unit_id where us.customer_id = c.id
             union select b.project_id from bookings b where b.customer_id = c.id
             union select l.project_id from leads l where l.customer_id = c.id) x
            where public.can_see_leads(x.project_id)
               or public.has_effective_permission(c.organization_id, x.project_id, 'FINANCE', 'VIEW'))));
$$;

alter policy customers_select on public.customers using (public.can_see_customer(id));

-- ---------------------------------------------------------------- tables

create table if not exists public.sales_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  booking_id uuid not null references public.bookings(id),
  customer_id uuid not null references public.customers(id),
  contract_no text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','SIGNED','CANCELLED')),
  current_version int not null default 1,
  signed_version int,
  signed_on date,
  signed_file_path text,
  signed_by uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  cancel_reason text,
  unique (organization_id, contract_no)
);
create unique index if not exists sales_contracts_one_live_idx
  on public.sales_contracts(unit_id) where status in ('DRAFT','SIGNED');
create index if not exists sales_contracts_customer_idx on public.sales_contracts(customer_id);

create table if not exists public.sales_contract_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  contract_id uuid not null references public.sales_contracts(id) on delete cascade,
  version int not null,
  contract_price numeric(18,2) not null check (contract_price > 0),
  down_payment numeric(18,2) not null default 0 check (down_payment >= 0),
  installment_count int not null default 0 check (installment_count between 0 and 120),
  transfer_due date,
  language text not null default 'TH' check (language in ('TH','EN','BILINGUAL')),
  terms text,
  change_note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (contract_id, version)
);

-- Versions are evidence: nobody rewrites them, not even security-definer RPCs.
create or replace function public.reject_contract_version_change()
returns trigger language plpgsql as $$
begin
  raise exception 'Contract versions are immutable';
end $$;
create or replace trigger sales_contract_versions_immutable before update or delete on public.sales_contract_versions
  for each row execute function public.reject_contract_version_change();

-- Once signed, the signed version, date and file cannot move; only cancellation is allowed.
create or replace function public.guard_signed_contract()
returns trigger language plpgsql as $$
begin
  if old.status = 'SIGNED' and (new.signed_version is distinct from old.signed_version
      or new.signed_on is distinct from old.signed_on
      or new.signed_file_path is distinct from old.signed_file_path
      or new.current_version is distinct from old.current_version
      or new.status not in ('SIGNED','CANCELLED')) then
    raise exception 'Signed contract cannot be changed';
  end if;
  if old.status = 'CANCELLED' then raise exception 'Cancelled contract cannot be changed'; end if;
  return new;
end $$;
create or replace trigger sales_contracts_guard before update on public.sales_contracts
  for each row execute function public.guard_signed_contract();

alter table public.sales_contracts enable row level security;
alter table public.sales_contract_versions enable row level security;

-- Staff who see the project's sales data; the customer sees their signed contract only.
create policy sales_contracts_select on public.sales_contracts for select to authenticated
  using (public.can_see_leads(project_id)
    or public.has_effective_permission(organization_id, project_id, 'FINANCE', 'VIEW')
    or (status = 'SIGNED' and public.is_unit_customer(unit_id)));
create policy sales_contract_versions_select on public.sales_contract_versions for select to authenticated
  using (exists(select 1 from sales_contracts c where c.id = contract_id
    and (public.can_see_leads(c.project_id)
      or public.has_effective_permission(c.organization_id, c.project_id, 'FINANCE', 'VIEW')
      or (c.status = 'SIGNED' and c.signed_version = version and public.is_unit_customer(c.unit_id)))));

grant select on public.sales_contracts, public.sales_contract_versions to authenticated;

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contract-files', 'contract-files', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

-- <org>/<project>/<unit>/<contract>/<file>.pdf, only while the contract is a draft.
create or replace function public.can_upload_contract_file(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from sales_contracts c
     where c.id = public.try_uuid((storage.foldername(object_name))[4])
       and c.unit_id = public.try_uuid((storage.foldername(object_name))[3])
       and c.project_id = public.try_uuid((storage.foldername(object_name))[2])
       and c.organization_id = public.try_uuid((storage.foldername(object_name))[1])
       and c.status = 'DRAFT'
       and public.can_edit_sales(c.project_id));
$$;

create or replace function public.can_read_contract_file(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from sales_contracts c
     where c.signed_file_path = object_name
       and (public.can_see_leads(c.project_id)
         or public.has_effective_permission(c.organization_id, c.project_id, 'FINANCE', 'VIEW')
         or public.is_unit_customer(c.unit_id)));
$$;

create policy contract_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'contract-files' and public.can_upload_contract_file(name));
create policy contract_files_read on storage.objects for select to authenticated
  using (bucket_id = 'contract-files' and public.can_read_contract_file(name));

-- ---------------------------------------------------------------- RPCs

create or replace function public.contract_version_insert(c sales_contracts, version int, data jsonb, floor_price numeric)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  price numeric := nullif(data->>'contract_price', '')::numeric;
  lang text := coalesce(nullif(data->>'language', ''), 'TH');
begin
  if price is null or price <= 0 then raise exception 'Invalid price'; end if;
  -- The discount was approved at booking; a contract cannot quietly go below it.
  if price < floor_price then raise exception 'Contract price below approved price'; end if;
  insert into sales_contract_versions (organization_id, project_id, contract_id, version, contract_price, down_payment,
    installment_count, transfer_due, language, terms, change_note, created_by)
  values (c.organization_id, c.project_id, c.id, version, price,
    coalesce(nullif(data->>'down_payment', '')::numeric, 0),
    coalesce(nullif(data->>'installment_count', '')::int, 0),
    nullif(data->>'transfer_due', '')::date, lang,
    nullif(trim(data->>'terms'), ''), nullif(trim(data->>'change_note'), ''), auth.uid());
end $$;
revoke all on function public.contract_version_insert(sales_contracts, int, jsonb, numeric) from public, anon, authenticated;

create or replace function public.create_contract(target_booking uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  bk bookings;
  c sales_contracts;
begin
  select * into bk from bookings where id = target_booking for update;
  if not found or not public.can_edit_sales(bk.project_id) then raise exception 'Not authorized'; end if;
  if bk.status <> 'CONFIRMED' then raise exception 'Booking is not confirmed'; end if;
  insert into sales_contracts (organization_id, project_id, unit_id, booking_id, customer_id, contract_no, created_by)
  values (bk.organization_id, bk.project_id, bk.unit_id, bk.id, bk.customer_id,
    public.next_document_no(bk.organization_id, 'CT'), auth.uid())
  returning * into c;
  perform public.contract_version_insert(c, 1,
    jsonb_set(coalesce(data, '{}'::jsonb), '{contract_price}',
      to_jsonb(coalesce(nullif(data->>'contract_price', ''), bk.agreed_price::text))), bk.agreed_price);
  perform public.log_timeline(c.organization_id, c.project_id, c.unit_id, 'CONTRACT_CREATED', 'contract', c.id, c.contract_no, '{}'::jsonb);
  return c.id;
end $$;

create or replace function public.revise_contract(target_contract uuid, data jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  c sales_contracts;
  floor_price numeric;
begin
  select * into c from sales_contracts where id = target_contract for update;
  if not found or not public.can_edit_sales(c.project_id) then raise exception 'Not authorized'; end if;
  if c.status <> 'DRAFT' then raise exception 'Signed contract cannot be changed'; end if;
  if coalesce(trim(data->>'change_note'), '') = '' then raise exception 'Change note required'; end if;
  select agreed_price into floor_price from bookings where id = c.booking_id;
  perform public.contract_version_insert(c, c.current_version + 1, data, floor_price);
  update sales_contracts set current_version = c.current_version + 1, updated_at = now() where id = c.id;
  perform public.log_timeline(c.organization_id, c.project_id, c.unit_id, 'CONTRACT_REVISED', 'contract', c.id,
    c.contract_no, jsonb_build_object('version', c.current_version + 1));
  return c.current_version + 1;
end $$;

-- Records the signing: pins the current version and the signed PDF, moves the unit to CONTRACTED.
create or replace function public.sign_contract(target_contract uuid, signed_on date, file_path text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  c sales_contracts;
  v sales_contract_versions;
  prefix text;
begin
  select * into c from sales_contracts where id = target_contract for update;
  if not found or not public.can_edit_sales(c.project_id) then raise exception 'Not authorized'; end if;
  if c.status <> 'DRAFT' then raise exception 'Signed contract cannot be changed'; end if;
  if signed_on is null or signed_on > current_date then raise exception 'Invalid date'; end if;
  prefix := c.organization_id || '/' || c.project_id || '/' || c.unit_id || '/' || c.id || '/';
  if file_path is null or left(file_path, length(prefix)) <> prefix
     or not exists(select 1 from storage.objects o where o.bucket_id = 'contract-files' and o.name = file_path) then
    raise exception 'Contract file not uploaded';
  end if;
  select * into v from sales_contract_versions where contract_id = c.id and version = c.current_version;
  update sales_contracts set status = 'SIGNED', signed_version = c.current_version, signed_on = signed_on,
    signed_file_path = file_path, signed_by = auth.uid(), updated_at = now()
   where id = c.id;
  update units set status = 'CONTRACTED', updated_at = now() where id = c.unit_id;
  update unit_sales set status = 'CONTRACTED', agreed_price = v.contract_price, contract_date = signed_on,
    transfer_date = coalesce(v.transfer_due, transfer_date), updated_at = now()
   where unit_id = c.unit_id;
  perform public.log_timeline(c.organization_id, c.project_id, c.unit_id, 'CONTRACT_SIGNED', 'contract', c.id,
    c.contract_no, jsonb_build_object('version', c.current_version, 'price', v.contract_price));
end $$;

-- Drafts can be dropped by sales; a signed contract needs SALES.APPROVE and returns the unit to RESERVED.
create or replace function public.cancel_contract(target_contract uuid, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare c sales_contracts;
begin
  select * into c from sales_contracts where id = target_contract for update;
  if not found then raise exception 'Not authorized'; end if;
  if c.status = 'CANCELLED' then raise exception 'Contract already cancelled'; end if;
  if not (case when c.status = 'SIGNED' then public.can_sell(c.project_id, 'APPROVE') else public.can_edit_sales(c.project_id) end) then
    raise exception 'Not authorized';
  end if;
  if coalesce(trim(reason), '') = '' then raise exception 'Reason required'; end if;
  update sales_contracts set status = 'CANCELLED', cancelled_by = auth.uid(), cancelled_at = now(),
    cancel_reason = trim(reason), updated_at = now()
   where id = c.id;
  if c.status = 'SIGNED' then
    update units set status = 'RESERVED', updated_at = now() where id = c.unit_id;
    update unit_sales set status = 'RESERVED', contract_date = null, updated_at = now() where unit_id = c.unit_id;
  end if;
  perform public.log_timeline(c.organization_id, c.project_id, c.unit_id, 'CONTRACT_CANCELLED', 'contract', c.id,
    c.contract_no, jsonb_build_object('reason', trim(reason)));
end $$;

-- A booking with a live contract cannot be cancelled or rejected; cancel the contract first.
create or replace function public.close_booking(target_booking uuid, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare bk bookings;
begin
  select * into bk from bookings where id = target_booking for update;
  if bk.status = 'CANCELLED' then raise exception 'Booking already cancelled'; end if;
  if exists(select 1 from payments pm where pm.unit_id = bk.unit_id and pm.status = 'VALID') then
    raise exception 'Booking has payments';
  end if;
  if exists(select 1 from sales_contracts sc where sc.booking_id = bk.id and sc.status <> 'CANCELLED') then
    raise exception 'Booking has contract';
  end if;
  update bookings set status = 'CANCELLED', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = trim(reason)
   where id = bk.id;
  update units set status = 'AVAILABLE', updated_at = now() where id = bk.unit_id;
  update unit_sales set status = 'AVAILABLE', customer_id = null, agreed_price = null, reservation_date = null, updated_at = now()
   where unit_id = bk.unit_id;
  update payment_schedules set status = 'CANCELLED', updated_at = now() where unit_id = bk.unit_id and status = 'ACTIVE';
  if bk.lead_id is not null then
    update leads set stage = 'NEGOTIATION', updated_at = now() where id = bk.lead_id and stage = 'BOOKED';
    perform public.lead_log(bk.lead_id, 'BOOKING', bk.booking_no || ' cancelled · ' || trim(reason));
  end if;
  perform public.log_timeline(bk.organization_id, bk.project_id, bk.unit_id, 'BOOKING_CANCELLED', 'booking', bk.id,
    bk.booking_no, jsonb_build_object('reason', trim(reason)));
end $$;
revoke all on function public.close_booking(uuid, text) from public, anon, authenticated;

-- Customer 360° contact edits (name, phone, email, nationality, notes) by sales staff.
create or replace function public.update_customer(target_customer uuid, data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare c customers;
begin
  select * into c from customers where id = target_customer for update;
  if not found or not (public.can_manage_access(c.organization_id) or exists(
      select 1 from (select u.project_id from unit_sales us join units u on u.id = us.unit_id where us.customer_id = c.id
                     union select b.project_id from bookings b where b.customer_id = c.id) x
       where public.can_edit_sales(x.project_id))) then
    raise exception 'Not authorized';
  end if;
  if coalesce(trim(data->>'full_name'), '') = '' then raise exception 'Name required'; end if;
  update customers set full_name = trim(data->>'full_name'), phone = nullif(trim(data->>'phone'), ''),
    email = nullif(trim(data->>'email'), ''), nationality = nullif(trim(data->>'nationality'), ''),
    notes = nullif(trim(data->>'notes'), ''), updated_at = now()
   where id = c.id;
end $$;

-- ---------------------------------------------------------------- grants

do $$
declare f text;
begin
  foreach f in array array[
    'can_see_customer(uuid)', 'can_upload_contract_file(text)', 'can_read_contract_file(text)',
    'create_contract(uuid, jsonb)', 'revise_contract(uuid, jsonb)', 'sign_contract(uuid, date, text)',
    'cancel_contract(uuid, text)', 'update_customer(uuid, jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
