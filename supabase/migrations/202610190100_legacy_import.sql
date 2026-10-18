-- Legacy data import (MVP roadmap §5): bring Project 001's existing units, sales, payment schedules
-- and payments received into the platform from CSV.
-- * Every imported record carries import_batch_id, so it is always identifiable as imported.
-- * Nothing pretends to be a platform approval: payments are flagged imported with the legacy
--   receipt number; no bookings, contract approvals or evidence reviews are invented.
-- * A batch is all-or-nothing. A dry run validates every row inside the database and rolls back.
-- * The uploaded CSV is kept in the private 'imports' bucket; the batch stores only its path.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imports', 'imports', false, 10485760, array['text/csv', 'text/plain', 'application/vnd.ms-excel'])
on conflict (id) do nothing;

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('UNITS','SALES','SCHEDULES','PAYMENTS')),
  file_name text,
  file_path text,
  row_count int not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.import_batches enable row level security;
create policy import_batches_select on public.import_batches for select to authenticated
  using (public.can_manage_access(organization_id));

alter table public.units add column if not exists import_batch_id uuid references public.import_batches(id);
alter table public.customers add column if not exists import_batch_id uuid references public.import_batches(id);
alter table public.unit_sales add column if not exists import_batch_id uuid references public.import_batches(id);
alter table public.unit_sales add column if not exists legacy_contract_no text;
alter table public.payment_schedules add column if not exists import_batch_id uuid references public.import_batches(id);
alter table public.payments add column if not exists import_batch_id uuid references public.import_batches(id);
alter table public.payments add column if not exists imported boolean not null default false;

create or replace function public.can_import_file(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_access(public.try_uuid((storage.foldername(object_name))[1]));
$$;
create policy imports_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'imports' and public.can_import_file(name));
create policy imports_read on storage.objects for select to authenticated
  using (bucket_id = 'imports' and public.can_import_file(name));

-- ---------------------------------------------------------------- value parsing

create or replace function public.imp_text(r jsonb, col text)
returns text language sql immutable as $$ select nullif(trim(r->>col), '') $$;

-- Numbers may carry thousands separators, spaces or a baht sign.
create or replace function public.imp_num(r jsonb, col text)
returns numeric language plpgsql immutable as $$
declare v text := public.imp_text(r, col);
begin
  if v is null then return null; end if;
  return regexp_replace(v, '[,\s฿]', '', 'g')::numeric;
exception when others then raise exception 'invalid_number:%', col;
end $$;

-- Dates as YYYY-MM-DD or D/M/YYYY; Buddhist-era years (> 2400) are converted.
create or replace function public.imp_date(r jsonb, col text)
returns date language plpgsql immutable as $$
declare v text := public.imp_text(r, col); p text[]; y int;
begin
  if v is null then return null; end if;
  if v ~ '^\d{4}-\d{1,2}-\d{1,2}$' then
    p := string_to_array(v, '-'); y := p[1]::int;
    return make_date(case when y > 2400 then y - 543 else y end, p[2]::int, p[3]::int);
  elsif v ~ '^\d{1,2}/\d{1,2}/\d{4}$' then
    p := string_to_array(v, '/'); y := p[3]::int;
    return make_date(case when y > 2400 then y - 543 else y end, p[2]::int, p[1]::int);
  end if;
  raise exception 'invalid_date:%', col;
exception when others then raise exception 'invalid_date:%', col;
end $$;

-- ---------------------------------------------------------------- import

-- rows: array of objects keyed by the template's column names.
-- Returns {ok, dry_run, batch_id, results:[{row, ok, error, ref}]}; row is 1-based in the file's data rows.
create or replace function public.import_project_data(target_project uuid, kind text, rows jsonb,
  file_name text default null, file_path text default null, dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  org uuid;
  batch uuid;
  r jsonb;
  i int := 0;
  results jsonb := '[]'::jsonb;
  failed int := 0;
  u units;
  sale unit_sales;
  sched payment_schedules;
  cust uuid;
  ref text;
  st text;
  amt numeric;
  d date;
  seen text[] := '{}';
  key text;
  phone_digits text;
begin
  select organization_id into org from projects where id = target_project;
  if org is null or not public.can_manage_access(org) then raise exception 'Not authorized'; end if;
  if kind not in ('UNITS','SALES','SCHEDULES','PAYMENTS') then raise exception 'Invalid kind'; end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) = 0 then raise exception 'No rows'; end if;
  if jsonb_array_length(rows) > 2000 then raise exception 'Too many rows'; end if;
  if file_path is not null and ((storage.foldername(file_path))[1] <> org::text
     or not exists(select 1 from storage.objects o where o.bucket_id = 'imports' and o.name = file_path)) then
    raise exception 'Invalid file';
  end if;

  begin
    insert into import_batches (organization_id, project_id, kind, file_name, file_path, row_count, created_by)
    values (org, target_project, kind, nullif(trim(file_name), ''), file_path, jsonb_array_length(rows), auth.uid())
    returning id into batch;

    for r in select * from jsonb_array_elements(rows) loop
      i := i + 1;
      ref := null;
      begin
        if kind = 'UNITS' then
          key := upper(public.imp_text(r, 'unit_code'));
          if key is null then raise exception 'required:unit_code'; end if;
          if key = any(seen) then raise exception 'duplicate_in_file:unit_code'; end if;
          seen := seen || key;
          if exists(select 1 from units where project_id = target_project and code = key) then
            raise exception 'unit_exists';
          end if;
          amt := public.imp_num(r, 'list_price');
          if amt is not null and amt < 0 then raise exception 'invalid_number:list_price'; end if;
          insert into units (project_id, code, name, status, list_price, currency_code, target_completion_date,
            phase_id, plot_id, house_type_id, import_batch_id)
          values (target_project, key, public.imp_text(r, 'name'), 'AVAILABLE', amt, 'THB',
            public.imp_date(r, 'target_completion_date'),
            case when public.imp_text(r, 'phase_code') is null then null else coalesce(
              (select id from phases where project_id = target_project and upper(code) = upper(public.imp_text(r, 'phase_code'))),
              public.import_fail('not_found:phase_code')) end,
            case when public.imp_text(r, 'plot_code') is null then null else coalesce(
              (select id from plots where project_id = target_project and upper(code) = upper(public.imp_text(r, 'plot_code'))),
              public.import_fail('not_found:plot_code')) end,
            case when public.imp_text(r, 'house_type_code') is null then null else coalesce(
              (select id from house_types where organization_id = org and upper(code) = upper(public.imp_text(r, 'house_type_code'))),
              public.import_fail('not_found:house_type_code')) end,
            batch);
          ref := key;

        elsif kind = 'SALES' then
          key := upper(public.imp_text(r, 'unit_code'));
          if key is null then raise exception 'required:unit_code'; end if;
          if key = any(seen) then raise exception 'duplicate_in_file:unit_code'; end if;
          seen := seen || key;
          select * into u from units where project_id = target_project and code = key;
          if u.id is null then raise exception 'not_found:unit_code'; end if;
          if exists(select 1 from unit_sales where unit_id = u.id and customer_id is not null) then
            raise exception 'unit_has_sale';
          end if;
          if public.imp_text(r, 'customer_name') is null then raise exception 'required:customer_name'; end if;
          st := upper(coalesce(public.imp_text(r, 'status'), ''));
          if st not in ('RESERVED','CONTRACTED','SOLD','TRANSFERRED') then raise exception 'invalid_value:status'; end if;
          amt := public.imp_num(r, 'agreed_price');
          if amt is null or amt <= 0 then raise exception 'invalid_number:agreed_price'; end if;
          -- Reuse a customer already on file with the same phone or email.
          phone_digits := nullif(regexp_replace(coalesce(public.imp_text(r, 'phone'), ''), '\D', '', 'g'), '');
          select id into cust from customers
           where organization_id = org
             and ((phone_digits is not null and regexp_replace(coalesce(phone, ''), '\D', '', 'g') = phone_digits)
               or (public.imp_text(r, 'email') is not null and lower(email) = lower(public.imp_text(r, 'email'))))
           order by created_at limit 1;
          if cust is null then
            insert into customers (organization_id, full_name, phone, email, nationality, import_batch_id)
            values (org, public.imp_text(r, 'customer_name'), public.imp_text(r, 'phone'),
              lower(public.imp_text(r, 'email')), public.imp_text(r, 'nationality'), batch)
            returning id into cust;
          end if;
          insert into unit_sales (unit_id, customer_id, status, agreed_price, reservation_date, contract_date,
            transfer_date, notes, legacy_contract_no, import_batch_id)
          values (u.id, cust, st, amt, public.imp_date(r, 'reservation_date'), public.imp_date(r, 'contract_date'),
            public.imp_date(r, 'transfer_date'), public.imp_text(r, 'notes'), public.imp_text(r, 'legacy_contract_no'), batch)
          on conflict (unit_id) do update set customer_id = excluded.customer_id, status = excluded.status,
            agreed_price = excluded.agreed_price, reservation_date = excluded.reservation_date,
            contract_date = excluded.contract_date, transfer_date = excluded.transfer_date, notes = excluded.notes,
            legacy_contract_no = excluded.legacy_contract_no, import_batch_id = batch, updated_at = now();
          update units set status = st::unit_status, updated_at = now() where id = u.id;
          ref := key;

        elsif kind = 'SCHEDULES' then
          key := upper(public.imp_text(r, 'unit_code'));
          if key is null then raise exception 'required:unit_code'; end if;
          select * into u from units where project_id = target_project and code = key;
          if u.id is null then raise exception 'not_found:unit_code'; end if;
          select * into sale from unit_sales where unit_id = u.id;
          if sale.customer_id is null then raise exception 'no_customer'; end if;
          if exists(select 1 from payment_schedules where unit_id = u.id and status = 'ACTIVE'
                      and (import_batch_id is distinct from batch)) then
            raise exception 'unit_has_schedule';
          end if;
          if public.imp_num(r, 'sequence') is null or public.imp_num(r, 'sequence') < 1
             or public.imp_num(r, 'sequence') <> trunc(public.imp_num(r, 'sequence')) then
            raise exception 'invalid_number:sequence';
          end if;
          if (key || '#' || public.imp_num(r, 'sequence')::int) = any(seen) then raise exception 'duplicate_in_file:sequence'; end if;
          seen := seen || (key || '#' || public.imp_num(r, 'sequence')::int);
          st := upper(coalesce(public.imp_text(r, 'kind'), 'INSTALLMENT'));
          if st not in ('BOOKING','CONTRACT','INSTALLMENT','TRANSFER','OTHER') then raise exception 'invalid_value:kind'; end if;
          amt := public.imp_num(r, 'amount');
          if amt is null or amt <= 0 then raise exception 'invalid_number:amount'; end if;
          d := public.imp_date(r, 'due_date');
          if d is null then raise exception 'required:due_date'; end if;
          insert into payment_schedules (organization_id, project_id, unit_id, customer_id, sequence, kind,
            label_th, label_en, amount, due_date, created_by, import_batch_id)
          values (org, target_project, u.id, sale.customer_id, public.imp_num(r, 'sequence')::int, st,
            coalesce(public.imp_text(r, 'label_th'), 'งวดที่ ' || public.imp_num(r, 'sequence')::int),
            coalesce(public.imp_text(r, 'label_en'), public.imp_text(r, 'label_th'), 'Installment ' || public.imp_num(r, 'sequence')::int),
            amt, d, auth.uid(), batch);
          ref := key || ' #' || public.imp_num(r, 'sequence')::int;

        else -- PAYMENTS
          key := upper(public.imp_text(r, 'unit_code'));
          if key is null then raise exception 'required:unit_code'; end if;
          select * into u from units where project_id = target_project and code = key;
          if u.id is null then raise exception 'not_found:unit_code'; end if;
          if public.imp_num(r, 'sequence') is null then raise exception 'required:sequence'; end if;
          select * into sched from payment_schedules
           where unit_id = u.id and status = 'ACTIVE' and sequence = public.imp_num(r, 'sequence')::int;
          if sched.id is null then raise exception 'not_found:sequence'; end if;
          amt := public.imp_num(r, 'amount');
          if amt is null or amt <= 0 then raise exception 'invalid_number:amount'; end if;
          d := public.imp_date(r, 'paid_on');
          if d is null then raise exception 'required:paid_on'; end if;
          if d > current_date then raise exception 'future_date:paid_on'; end if;
          st := upper(coalesce(public.imp_text(r, 'method'), 'TRANSFER'));
          if st not in ('TRANSFER','CASH','CHEQUE','CARD','OTHER') then raise exception 'invalid_value:method'; end if;
          if amt + coalesce((select sum(p.amount) from payments p where p.schedule_id = sched.id and p.status = 'VALID'), 0)
             > sched.amount then
            raise exception 'exceeds_installment';
          end if;
          ref := coalesce(public.imp_text(r, 'legacy_receipt_no'), public.next_document_no(org, 'IMP'));
          if exists(select 1 from payments where organization_id = org and receipt_no = ref) then
            raise exception 'receipt_exists';
          end if;
          insert into payments (organization_id, project_id, unit_id, schedule_id, amount, paid_on, method, reference,
            receipt_no, verified_by, imported, import_batch_id)
          values (org, target_project, u.id, sched.id, amt, d, st, public.imp_text(r, 'reference'),
            ref, auth.uid(), true, batch);
        end if;
        results := results || jsonb_build_object('row', i, 'ok', true, 'ref', ref);
      exception when others then
        failed := failed + 1;
        results := results || jsonb_build_object('row', i, 'ok', false,
          'error', case when sqlerrm ~ '^[a-z_]+(:[a-z_]+)?$' then sqlerrm else 'db:' || sqlerrm end);
      end;
    end loop;

    if failed > 0 or dry_run then raise exception 'IMPORT_ROLLBACK'; end if;
    perform public.log_timeline(org, target_project, null, 'DATA_IMPORTED', 'import_batch', batch,
      kind || ' · ' || i || ' rows', jsonb_build_object('file', file_name));
  exception when raise_exception then
    if sqlerrm <> 'IMPORT_ROLLBACK' then raise; end if;
    batch := null;
  end;

  return jsonb_build_object('ok', failed = 0, 'dry_run', dry_run, 'batch_id', batch,
    'failed', failed, 'total', i, 'results', results);
end $$;

-- Lets a lookup inside an expression fail with an import error code.
create or replace function public.import_fail(code text)
returns uuid language plpgsql volatile as $$ begin raise exception '%', code; end $$;

-- Receipts for imported payments say so.
create or replace function public.get_receipt(target_payment uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'receipt_no', pm.receipt_no, 'amount', pm.amount, 'currency', pm.currency_code, 'paid_on', pm.paid_on,
    'method', pm.method, 'reference', pm.reference, 'status', pm.status, 'verified_at', pm.verified_at,
    'installment_th', s.label_th, 'installment_en', s.label_en,
    'unit_code', u.code, 'project_name', pr.name, 'organization_name', o.name,
    'customer_name', c.full_name, 'imported', pm.imported)
  from payments pm
  join payment_schedules s on s.id = pm.schedule_id
  join units u on u.id = pm.unit_id
  join projects pr on pr.id = pm.project_id
  join organizations o on o.id = pm.organization_id
  left join customers c on c.id = s.customer_id
  where pm.id = target_payment
    and (public.can_access_project(pm.project_id) or public.is_unit_customer(pm.unit_id));
$$;

revoke all on function public.can_import_file(text) from public, anon;
revoke all on function public.imp_text(jsonb, text) from public, anon, authenticated;
revoke all on function public.imp_num(jsonb, text) from public, anon, authenticated;
revoke all on function public.imp_date(jsonb, text) from public, anon, authenticated;
revoke all on function public.import_fail(text) from public, anon, authenticated;
revoke all on function public.import_project_data(uuid, text, jsonb, text, text, boolean) from public, anon;
grant execute on function public.can_import_file(text) to authenticated;
grant execute on function public.import_project_data(uuid, text, jsonb, text, text, boolean) to authenticated;
