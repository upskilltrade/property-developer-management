-- How a house is sold: outright (FREEHOLD), as a long land lease (LEASEHOLD), or split into a land
-- lease plus a separate building/construction contract (SPLIT), the structures used for foreign
-- buyers who cannot own land. A contract keeps one price and version history; its parts break that
-- price down and carry the lease details. Lease terms are capped at 30 years (Civil and Commercial
-- Code s.540). Part amounts and lease terms are fixed once the contract is signed; Land Office
-- registration details (number, date, lease start) can still be filled in afterwards.

alter table public.sales_contracts add column if not exists ownership_type text not null default 'FREEHOLD'
  check (ownership_type in ('FREEHOLD', 'LEASEHOLD', 'SPLIT'));

create table if not exists public.contract_parts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  contract_id uuid not null references public.sales_contracts(id) on delete cascade,
  kind text not null check (kind in ('LAND_LEASE', 'BUILDING_SALE', 'CONSTRUCTION', 'LAND_SALE', 'OTHER')),
  label text not null,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  lease_years int check (lease_years between 1 and 30),
  lease_start date,
  land_office_no text,
  registered_on date,
  notes text,
  sort_order int not null default 0,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'LAND_LEASE' or lease_years is not null)
);
create index if not exists contract_parts_contract_idx on public.contract_parts (contract_id) where removed_at is null;
create index if not exists contract_parts_org_idx on public.contract_parts (organization_id);
create index if not exists contract_parts_project_idx on public.contract_parts (project_id);

alter table public.contract_parts enable row level security;
create policy contract_parts_select on public.contract_parts for select to authenticated
  using (exists(select 1 from sales_contracts c where c.id = contract_id
    and (public.can_see_leads(c.project_id)
      or public.has_effective_permission(c.organization_id, c.project_id, 'FINANCE', 'VIEW')
      or (c.status = 'SIGNED' and public.is_unit_customer(c.unit_id)))));
revoke insert, update, delete on public.contract_parts from anon, authenticated;

-- Sets the structure on a draft; the first time, it lays out the usual parts for it (amounts 0).
create or replace function public.set_contract_ownership(target_contract uuid, new_type text)
returns void language plpgsql security definer set search_path = public as $$
declare c sales_contracts;
begin
  select * into c from sales_contracts where id = target_contract for update;
  if not found or not public.can_edit_sales(c.project_id) then raise exception 'Not authorized'; end if;
  if c.status <> 'DRAFT' then raise exception 'Signed contract cannot be changed'; end if;
  if new_type not in ('FREEHOLD', 'LEASEHOLD', 'SPLIT') then raise exception 'Invalid structure'; end if;
  update sales_contracts set ownership_type = new_type, updated_at = now() where id = c.id;
  if new_type <> 'FREEHOLD' and not exists(select 1 from contract_parts where contract_id = c.id and removed_at is null) then
    insert into contract_parts (organization_id, project_id, contract_id, kind, label, lease_years, sort_order)
    values (c.organization_id, c.project_id, c.id, 'LAND_LEASE', 'สัญญาเช่าที่ดิน', 30, 1);
    insert into contract_parts (organization_id, project_id, contract_id, kind, label, sort_order)
    values (c.organization_id, c.project_id, c.id,
      case when new_type = 'SPLIT' then 'CONSTRUCTION' else 'BUILDING_SALE' end,
      case when new_type = 'SPLIT' then 'สัญญาจ้างก่อสร้างบ้าน' else 'สัญญาซื้อขายสิ่งปลูกสร้าง' end, 2);
  end if;
  perform public.log_timeline(c.organization_id, c.project_id, c.unit_id, 'CONTRACT_STRUCTURE', 'contract', c.id,
    c.contract_no, jsonb_build_object('ownership_type', new_type));
end $$;

-- Adds or edits one part. On a signed contract only the registration fields change.
create or replace function public.save_contract_part(target_contract uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare c sales_contracts; pid uuid := public.try_uuid(nullif(data->>'id', '')); k text := data->>'kind';
  years int := nullif(data->>'lease_years', '')::int;
begin
  select * into c from sales_contracts where id = target_contract;
  if not found or not public.can_edit_sales(c.project_id) then raise exception 'Not authorized'; end if;
  if c.status = 'CANCELLED' then raise exception 'Cancelled contract cannot be changed'; end if;
  if c.status = 'SIGNED' then
    if pid is null then raise exception 'Signed contract cannot be changed'; end if;
    update contract_parts set lease_start = coalesce(nullif(data->>'lease_start', '')::date, lease_start),
      land_office_no = nullif(trim(data->>'land_office_no'), ''), registered_on = nullif(data->>'registered_on', '')::date,
      notes = nullif(trim(data->>'notes'), ''), updated_at = now()
     where id = pid and contract_id = c.id and removed_at is null;
    if not found then raise exception 'Not authorized'; end if;
    return pid;
  end if;
  if coalesce(trim(data->>'label'), '') = '' or k not in ('LAND_LEASE', 'BUILDING_SALE', 'CONSTRUCTION', 'LAND_SALE', 'OTHER') then
    raise exception 'Invalid part';
  end if;
  if k = 'LAND_LEASE' and (years is null or years not between 1 and 30) then raise exception 'Lease term 1-30 years'; end if;
  if pid is null then
    insert into contract_parts (organization_id, project_id, contract_id, kind, label, amount, lease_years, lease_start,
      land_office_no, registered_on, notes, sort_order)
    values (c.organization_id, c.project_id, c.id, k, trim(data->>'label'),
      coalesce(nullif(data->>'amount', '')::numeric, 0), case when k = 'LAND_LEASE' then years end,
      nullif(data->>'lease_start', '')::date, nullif(trim(data->>'land_office_no'), ''),
      nullif(data->>'registered_on', '')::date, nullif(trim(data->>'notes'), ''),
      coalesce((select max(sort_order) from contract_parts where contract_id = c.id), 0) + 1)
    returning id into pid;
  else
    update contract_parts set kind = k, label = trim(data->>'label'),
      amount = coalesce(nullif(data->>'amount', '')::numeric, 0), lease_years = case when k = 'LAND_LEASE' then years end,
      lease_start = nullif(data->>'lease_start', '')::date, land_office_no = nullif(trim(data->>'land_office_no'), ''),
      registered_on = nullif(data->>'registered_on', '')::date, notes = nullif(trim(data->>'notes'), ''), updated_at = now()
     where id = pid and contract_id = c.id and removed_at is null;
    if not found then raise exception 'Not authorized'; end if;
  end if;
  return pid;
end $$;

create or replace function public.remove_contract_part(target_part uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c sales_contracts;
begin
  select sc.* into c from contract_parts p join sales_contracts sc on sc.id = p.contract_id where p.id = target_part;
  if c.id is null or not public.can_edit_sales(c.project_id) then raise exception 'Not authorized'; end if;
  if c.status <> 'DRAFT' then raise exception 'Signed contract cannot be changed'; end if;
  update contract_parts set removed_at = now(), updated_at = now() where id = target_part;
end $$;

-- Signing a leasehold/split contract needs parts that add up to the contract price and a land lease.
create or replace function public.sign_contract(target_contract uuid, signed_on date, file_path text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  c sales_contracts;
  v sales_contract_versions;
  prefix text;
  parts_total numeric;
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
  if c.ownership_type <> 'FREEHOLD' then
    select coalesce(sum(amount), 0) into parts_total from contract_parts where contract_id = c.id and removed_at is null;
    if parts_total <> v.contract_price then raise exception 'Contract parts do not add up to the price'; end if;
    if not exists(select 1 from contract_parts where contract_id = c.id and removed_at is null and kind = 'LAND_LEASE') then
      raise exception 'Land lease part required';
    end if;
  end if;
  update sales_contracts set status = 'SIGNED', signed_version = c.current_version, signed_on = signed_on,
    signed_file_path = file_path, signed_by = auth.uid(), updated_at = now()
   where id = c.id;
  update units set status = 'CONTRACTED', updated_at = now() where id = c.unit_id;
  update unit_sales set status = 'CONTRACTED', agreed_price = v.contract_price, contract_date = signed_on,
    transfer_date = coalesce(v.transfer_due, transfer_date), updated_at = now()
   where unit_id = c.unit_id;
  perform public.log_timeline(c.organization_id, c.project_id, c.unit_id, 'CONTRACT_SIGNED', 'contract', c.id,
    c.contract_no, jsonb_build_object('version', c.current_version, 'price', v.contract_price, 'ownership_type', c.ownership_type));
end $$;

revoke all on function public.set_contract_ownership(uuid, text) from public, anon;
revoke all on function public.save_contract_part(uuid, jsonb) from public, anon;
revoke all on function public.remove_contract_part(uuid) from public, anon;
grant execute on function public.set_contract_ownership(uuid, text) to authenticated;
grant execute on function public.save_contract_part(uuid, jsonb) to authenticated;
grant execute on function public.remove_contract_part(uuid) to authenticated;
