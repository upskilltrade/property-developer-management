-- QA/QC, handover and warranty (MVP-ROADMAP Release 7).
-- Inspection -> Defect -> Rectification -> Reinspection -> Customer inspection -> Acceptance
-- -> Transfer -> Handover -> Warranty.
--
-- Inspections gain checklist items (from templates). Defects gain a source (INTERNAL, CUSTOMER,
-- WARRANTY) and a customer-visible flag; HIGH severity is critical and blocks handover. Each unit
-- has one handover record whose status only moves through RPCs: the practical-completion gate
-- requires verified construction at 100% and no open critical defect; customer acceptance requires
-- no open customer-raised defect; completion requires the delivered handover checklist and a
-- signed acknowledgement file (kept in the private handover-files bucket, path only in the DB).
-- Completion records transfer, marks the unit TRANSFERRED and starts the unit warranties from the
-- organization's warranty types, which switches the customer portal to homeowner mode.
-- Service requests (SR-) are raised by the homeowner, assigned to a partner, resolved by the
-- partner or staff and closed by the homeowner (or reopened).

-- ---------------------------------------------------------------- checklists

create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  purpose text not null default 'QC' check (purpose in ('QC','PRE_HANDOVER','CUSTOMER','HANDOVER')),
  items jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  seq int not null,
  item text not null,
  result text not null check (result in ('PASS','FAIL','NA')),
  note text,
  customer_visible boolean not null default false,
  unique (inspection_id, seq)
);

alter table public.inspections add column if not exists purpose text not null default 'QC';
alter table public.inspections add column if not exists customer_visible boolean not null default false;
alter table public.defects add column if not exists source text not null default 'INTERNAL';
alter table public.defects add column if not exists customer_visible boolean not null default false;
alter table public.defects add column if not exists service_request_id uuid;

-- ---------------------------------------------------------------- handover

create table if not exists public.unit_handovers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid not null unique references public.units(id) on delete cascade,
  status text not null default 'NOT_READY' check (status in
    ('NOT_READY','READY','CUSTOMER_INSPECTION','ACCEPTED','HANDED_OVER')),
  ready_at timestamptz,
  ready_by uuid references public.profiles(id),
  inspection_scheduled_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id),
  accepted_by_customer boolean,
  transfer_date date,
  handover_date date,
  acknowledgement_path text,
  handed_over_by uuid references public.profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.handover_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  handover_id uuid not null references public.unit_handovers(id) on delete cascade,
  kind text not null check (kind in ('KEY','METER','MANUAL','EQUIPMENT','DOCUMENT','WARRANTY','OTHER')),
  description text not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  reference text,
  file_path text,
  delivered boolean not null default false,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

-- Handover evidence is retained: once handed over, the record and its items never change.
create or replace function public.guard_handover()
returns trigger language plpgsql as $$
begin
  if tg_table_name = 'unit_handovers' then
    if old.status = 'HANDED_OVER' then raise exception 'Handover is completed'; end if;
  else
    if exists(select 1 from unit_handovers h where h.id = coalesce(new.handover_id, old.handover_id) and h.status = 'HANDED_OVER') then
      raise exception 'Handover is completed';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create or replace trigger unit_handovers_guard before update on public.unit_handovers
  for each row execute function public.guard_handover();
create or replace trigger handover_items_guard before insert or update on public.handover_items
  for each row execute function public.guard_handover();

-- ---------------------------------------------------------------- warranty & service

create table if not exists public.warranty_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name_th text not null,
  name_en text,
  months int not null check (months between 1 and 360),
  default_partner_id uuid references public.partner_organizations(id),
  terms text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.unit_warranties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  warranty_type_id uuid not null references public.warranty_types(id),
  start_date date not null,
  end_date date not null,
  partner_id uuid references public.partner_organizations(id),
  created_at timestamptz not null default now(),
  unique (unit_id, warranty_type_id)
);

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  warranty_id uuid references public.unit_warranties(id),
  sr_no text not null,
  title text not null,
  description text not null,
  location text,
  status text not null default 'OPEN' check (status in ('OPEN','ASSIGNED','RESOLVED','CLOSED','REJECTED')),
  in_warranty boolean not null default false,
  partner_id uuid references public.partner_organizations(id),
  due_date date,
  resolution text,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  closed_at timestamptz,
  reopen_count int not null default 0,
  raised_by uuid references public.profiles(id),
  raised_by_customer boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, sr_no)
);

-- ---------------------------------------------------------------- RLS

alter table public.checklist_templates enable row level security;
alter table public.inspection_items enable row level security;
alter table public.unit_handovers enable row level security;
alter table public.handover_items enable row level security;
alter table public.warranty_types enable row level security;
alter table public.unit_warranties enable row level security;
alter table public.service_requests enable row level security;

create policy checklist_templates_select on public.checklist_templates for select to authenticated
  using (public.is_internal_member(organization_id));
create policy inspection_items_select on public.inspection_items for select to authenticated
  using (exists(select 1 from inspections i where i.id = inspection_id
    and (public.can_access_project(i.project_id)
      or (customer_visible and i.customer_visible and i.unit_id is not null and public.is_unit_customer(i.unit_id)))));
create policy unit_handovers_select on public.unit_handovers for select to authenticated
  using (public.can_access_project(project_id) or public.is_unit_customer(unit_id));
create policy handover_items_select on public.handover_items for select to authenticated
  using (exists(select 1 from unit_handovers h where h.id = handover_id
    and (public.can_access_project(h.project_id) or public.is_unit_customer(h.unit_id))));
create policy warranty_types_select on public.warranty_types for select to authenticated
  using (public.is_internal_member(organization_id)
    or exists(select 1 from unit_warranties w where w.warranty_type_id = warranty_types.id and public.is_unit_customer(w.unit_id)));
create policy unit_warranties_select on public.unit_warranties for select to authenticated
  using (public.can_access_project(project_id) or public.is_unit_customer(unit_id));
create policy service_requests_select on public.service_requests for select to authenticated
  using (public.can_access_project(project_id) or public.is_unit_customer(unit_id)
    or coalesce(partner_id in (select public.my_partner_ids()), false));

-- Customers see inspections marked customer-visible on their unit, and defects shared with them.
alter policy inspections_select on public.inspections
  using (public.can_access_project(project_id)
    or (customer_visible and unit_id is not null and public.is_unit_customer(unit_id)));
alter policy defects_select on public.defects
  using (public.can_access_project(project_id) or assigned_partner_id in (select public.my_partner_ids())
    or (customer_visible and unit_id is not null and public.is_unit_customer(unit_id)));

grant select on public.checklist_templates, public.inspection_items, public.unit_handovers, public.handover_items,
  public.warranty_types, public.unit_warranties, public.service_requests to authenticated;

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('handover-files', 'handover-files', false, 20971520,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- <org>/<project>/<unit>/<file>
create or replace function public.can_upload_handover_file(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from unit_handovers h
     where h.unit_id = public.try_uuid((storage.foldername(object_name))[3])
       and h.project_id = public.try_uuid((storage.foldername(object_name))[2])
       and h.organization_id = public.try_uuid((storage.foldername(object_name))[1])
       and h.status <> 'HANDED_OVER'
       and (public.can_schedule(h.project_id, 'APPROVE') or public.can_sell(h.project_id, 'EDIT')));
$$;

create or replace function public.can_read_handover_file(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from unit_handovers h
     where h.unit_id = public.try_uuid((storage.foldername(object_name))[3])
       and h.project_id = public.try_uuid((storage.foldername(object_name))[2])
       and (public.can_access_project(h.project_id) or public.is_unit_customer(h.unit_id)));
$$;

create policy handover_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'handover-files' and public.can_upload_handover_file(name));
create policy handover_files_read on storage.objects for select to authenticated
  using (bucket_id = 'handover-files' and public.can_read_handover_file(name));

-- ---------------------------------------------------------------- helpers

create or replace function public.can_handover(target_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_schedule(target_project, 'APPROVE') or public.can_sell(target_project, 'EDIT');
$$;

-- The handover row for a unit, created on first use.
create or replace function public.ensure_handover(target_unit uuid)
returns unit_handovers language plpgsql security definer set search_path = public as $$
declare
  h unit_handovers;
  u units;
  org uuid;
begin
  select * into h from unit_handovers where unit_id = target_unit for update;
  if found then return h; end if;
  select * into u from units where id = target_unit;
  select organization_id into org from projects where id = u.project_id;
  insert into unit_handovers (organization_id, project_id, unit_id) values (org, u.project_id, u.id) returning * into h;
  return h;
end $$;
revoke all on function public.ensure_handover(uuid) from public, anon, authenticated;

-- Readiness snapshot used by the gate and shown in the UI.
create or replace function public.handover_readiness(target_unit uuid)
returns table(progress numeric, open_critical int, open_defects int, open_customer_defects int,
  outstanding numeric, items_total int, items_delivered int)
language sql stable security definer set search_path = public as $$
  select
    coalesce((select uc.progress_percent from unit_construction uc where uc.unit_id = target_unit), 0),
    (select count(*)::int from defects d where d.unit_id = target_unit and d.status <> 'VERIFIED' and d.severity = 'HIGH'),
    (select count(*)::int from defects d where d.unit_id = target_unit and d.status <> 'VERIFIED'),
    (select count(*)::int from defects d where d.unit_id = target_unit and d.status <> 'VERIFIED' and d.source = 'CUSTOMER'),
    coalesce((select sum(s.outstanding) from payment_schedule_status s where s.unit_id = target_unit and s.status = 'ACTIVE'), 0),
    (select count(*)::int from handover_items i join unit_handovers h on h.id = i.handover_id where h.unit_id = target_unit),
    (select count(*)::int from handover_items i join unit_handovers h on h.id = i.handover_id where h.unit_id = target_unit and i.delivered)
   where exists(select 1 from units u where u.id = target_unit
     and (public.can_access_project(u.project_id) or public.is_unit_customer(u.id)));
$$;

-- ---------------------------------------------------------------- RPCs: checklists & inspections

create or replace function public.save_checklist_template(target_org uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare id uuid;
begin
  if not (public.can_manage_access(target_org)
          or exists(select 1 from projects p where p.organization_id = target_org and public.can_schedule(p.id, 'APPROVE'))) then
    raise exception 'Not authorized';
  end if;
  if coalesce(trim(data->>'code'), '') = '' or coalesce(trim(data->>'name'), '') = ''
     or jsonb_typeof(data->'items') <> 'array' or jsonb_array_length(data->'items') = 0 then
    raise exception 'Invalid checklist';
  end if;
  insert into checklist_templates (organization_id, code, name, purpose, items)
  values (target_org, upper(trim(data->>'code')), trim(data->>'name'), upper(coalesce(nullif(data->>'purpose', ''), 'QC')), data->'items')
  on conflict (organization_id, code) do update set name = excluded.name, purpose = excluded.purpose, items = excluded.items
  returning checklist_templates.id into id;
  return id;
end $$;

-- Inspection with checklist results; failed items become defects (customer-visible inspections
-- share their failed items with the customer). Result: FAIL if any item failed.
create or replace function public.record_checklist_inspection(target_project uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pr projects;
  un uuid := nullif(data->>'unit_id', '')::uuid;
  it jsonb;
  n int := 0;
  failed int := 0;
  visible boolean := coalesce((data->>'customer_visible')::boolean, false);
  doc_no text;
  insp uuid;
  partner uuid := nullif(data->>'assigned_partner_id', '')::uuid;
begin
  select * into pr from projects where projects.id = target_project;
  if not found or not public.can_schedule(pr.id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if coalesce(trim(data->>'title'), '') = '' or jsonb_typeof(data->'items') <> 'array' then raise exception 'Invalid inspection'; end if;
  select count(*) into failed from jsonb_array_elements(data->'items') x where upper(x->>'result') = 'FAIL';
  doc_no := public.next_document_no(pr.organization_id, 'INS');
  insert into inspections (organization_id, project_id, unit_id, inspection_no, title, inspected_on, result, notes, inspector_id,
    purpose, customer_visible)
  values (pr.organization_id, pr.id, un, doc_no, trim(data->>'title'), coalesce(nullif(data->>'inspected_on', '')::date, current_date),
    case when failed > 0 then 'FAIL' else 'PASS' end, nullif(trim(data->>'notes'), ''), auth.uid(),
    upper(coalesce(nullif(data->>'purpose', ''), 'QC')), visible)
  returning inspections.id into insp;
  for it in select * from jsonb_array_elements(data->'items') loop
    n := n + 1;
    insert into inspection_items (organization_id, inspection_id, seq, item, result, note, customer_visible)
    values (pr.organization_id, insp, n, trim(it->>'item'), upper(coalesce(nullif(it->>'result', ''), 'PASS')),
      nullif(trim(it->>'note'), ''), visible);
    if upper(it->>'result') = 'FAIL' then
      insert into defects (organization_id, project_id, unit_id, inspection_id, defect_no, title, description, severity,
        assigned_partner_id, created_by, source, customer_visible)
      values (pr.organization_id, pr.id, un, insp, public.next_document_no(pr.organization_id, 'DF'), trim(it->>'item'),
        nullif(trim(it->>'note'), ''), upper(coalesce(nullif(it->>'severity', ''), 'MEDIUM')), partner, auth.uid(), 'INTERNAL', visible);
    end if;
  end loop;
  perform public.log_timeline(pr.organization_id, pr.id, un, 'INSPECTION_' || case when failed > 0 then 'FAIL' else 'PASS' end,
    'inspection', insp, doc_no || ' ' || trim(data->>'title'), jsonb_build_object('failed', failed));
  return insp;
end $$;

-- ---------------------------------------------------------------- RPCs: handover workflow

-- Practical completion gate.
create or replace function public.mark_handover_ready(target_unit uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  h unit_handovers;
  r record;
begin
  select * into h from public.ensure_handover(target_unit);
  if not public.can_schedule(h.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if h.status <> 'NOT_READY' then raise exception 'Handover is not at this step'; end if;
  select * into r from public.handover_readiness(target_unit);
  if r.progress < 100 then raise exception 'Construction not complete'; end if;
  if r.open_critical > 0 then raise exception 'Critical defects open'; end if;
  update unit_handovers set status = 'READY', ready_at = now(), ready_by = auth.uid(), updated_at = now() where id = h.id;
  perform public.log_timeline(h.organization_id, h.project_id, h.unit_id, 'HANDOVER_READY', 'handover', h.id, 'Ready for customer inspection', '{}'::jsonb);
end $$;

create or replace function public.schedule_customer_inspection(target_unit uuid, scheduled_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare h unit_handovers;
begin
  select * into h from public.ensure_handover(target_unit);
  if not public.can_handover(h.project_id) then raise exception 'Not authorized'; end if;
  if h.status not in ('READY','CUSTOMER_INSPECTION') then raise exception 'Handover is not at this step'; end if;
  update unit_handovers set status = 'CUSTOMER_INSPECTION', inspection_scheduled_at = scheduled_at, updated_at = now() where id = h.id;
  perform public.log_timeline(h.organization_id, h.project_id, h.unit_id, 'CUSTOMER_INSPECTION_SCHEDULED', 'handover', h.id,
    to_char(scheduled_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI'), '{}'::jsonb);
end $$;

-- Customer observation during their inspection (also usable by staff on the customer's behalf).
create or replace function public.log_customer_defect(target_unit uuid, title text, description text, location text)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  h unit_handovers;
  id uuid;
begin
  select * into h from unit_handovers where unit_id = target_unit;
  if not found or not (public.is_unit_customer(target_unit) or public.can_handover(h.project_id)) then raise exception 'Not authorized'; end if;
  if h.status <> 'CUSTOMER_INSPECTION' then raise exception 'Handover is not at this step'; end if;
  if coalesce(trim(title), '') = '' then raise exception 'Invalid defect'; end if;
  insert into defects (organization_id, project_id, unit_id, defect_no, title, description, location, severity, created_by, source, customer_visible)
  values (h.organization_id, h.project_id, h.unit_id, public.next_document_no(h.organization_id, 'DF'), trim(title),
    nullif(trim(description), ''), nullif(trim(location), ''), 'MEDIUM', auth.uid(), 'CUSTOMER', true)
  returning defects.id into id;
  return id;
end $$;

-- Customer acceptance: by the customer in the portal, or by staff (recorded as such).
create or replace function public.accept_handover(target_unit uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  h unit_handovers;
  r record;
  as_customer boolean;
begin
  select * into h from unit_handovers where unit_id = target_unit for update;
  if not found then raise exception 'Not authorized'; end if;
  as_customer := public.is_unit_customer(target_unit);
  if not as_customer and not public.can_handover(h.project_id) then raise exception 'Not authorized'; end if;
  if h.status <> 'CUSTOMER_INSPECTION' then raise exception 'Handover is not at this step'; end if;
  select * into r from public.handover_readiness(target_unit);
  if r.open_critical > 0 then raise exception 'Critical defects open'; end if;
  if r.open_customer_defects > 0 then raise exception 'Customer defects open'; end if;
  update unit_handovers set status = 'ACCEPTED', accepted_at = now(), accepted_by = auth.uid(), accepted_by_customer = as_customer,
    updated_at = now() where id = h.id;
  perform public.log_timeline(h.organization_id, h.project_id, h.unit_id, 'HANDOVER_ACCEPTED', 'handover', h.id,
    case when as_customer then 'Accepted by customer' else 'Accepted (recorded by staff)' end, '{}'::jsonb);
end $$;

create or replace function public.add_handover_item(target_unit uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  h unit_handovers;
  id uuid;
begin
  select * into h from public.ensure_handover(target_unit);
  if not public.can_handover(h.project_id) then raise exception 'Not authorized'; end if;
  if coalesce(trim(data->>'description'), '') = '' then raise exception 'Invalid item'; end if;
  if nullif(data->>'file_path', '') is not null and (
       left(data->>'file_path', length(h.organization_id || '/' || h.project_id || '/' || h.unit_id || '/'))
         <> h.organization_id || '/' || h.project_id || '/' || h.unit_id || '/'
       or not exists(select 1 from storage.objects o where o.bucket_id = 'handover-files' and o.name = data->>'file_path')) then
    raise exception 'Handover file not uploaded';
  end if;
  insert into handover_items (organization_id, handover_id, kind, description, quantity, reference, file_path)
  values (h.organization_id, h.id, upper(coalesce(nullif(data->>'kind', ''), 'OTHER')), trim(data->>'description'),
    coalesce(nullif(data->>'quantity', '')::numeric, 1), nullif(trim(data->>'reference'), ''), nullif(data->>'file_path', ''))
  returning handover_items.id into id;
  return id;
end $$;

create or replace function public.set_handover_item_delivered(target_item uuid, delivered boolean)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare h unit_handovers;
begin
  select u.* into h from handover_items i join unit_handovers u on u.id = i.handover_id where i.id = target_item;
  if not found or not public.can_handover(h.project_id) then raise exception 'Not authorized'; end if;
  update handover_items set delivered = coalesce(delivered, false),
    delivered_at = case when coalesce(delivered, false) then now() else null end
   where id = target_item;
end $$;

-- Completion: accepted, every checklist item delivered, signed acknowledgement uploaded.
-- Records transfer, moves the unit to TRANSFERRED and starts warranties.
create or replace function public.complete_handover(target_unit uuid, handover_date date, transfer_date date, acknowledgement_path text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  h unit_handovers;
  r record;
  prefix text;
begin
  select * into h from unit_handovers where unit_id = target_unit for update;
  if not found or not public.can_handover(h.project_id) then raise exception 'Not authorized'; end if;
  if h.status <> 'ACCEPTED' then raise exception 'Handover is not at this step'; end if;
  select * into r from public.handover_readiness(target_unit);
  if r.items_total = 0 or r.items_delivered < r.items_total then raise exception 'Handover items not delivered'; end if;
  prefix := h.organization_id || '/' || h.project_id || '/' || h.unit_id || '/';
  if acknowledgement_path is null or left(acknowledgement_path, length(prefix)) <> prefix
     or not exists(select 1 from storage.objects o where o.bucket_id = 'handover-files' and o.name = acknowledgement_path) then
    raise exception 'Handover file not uploaded';
  end if;
  if handover_date is null or handover_date > current_date then raise exception 'Invalid date'; end if;
  update unit_handovers set status = 'HANDED_OVER', handover_date = handover_date,
    transfer_date = coalesce(transfer_date, handover_date), acknowledgement_path = acknowledgement_path,
    handed_over_by = auth.uid(), updated_at = now()
   where id = h.id;
  update units set status = 'TRANSFERRED', updated_at = now() where id = h.unit_id;
  update unit_sales set status = 'TRANSFERRED', transfer_date = coalesce(transfer_date, handover_date), updated_at = now()
   where unit_id = h.unit_id;
  insert into unit_warranties (organization_id, project_id, unit_id, warranty_type_id, start_date, end_date, partner_id)
  select h.organization_id, h.project_id, h.unit_id, w.id, handover_date, (handover_date + make_interval(months => w.months))::date,
         w.default_partner_id
    from warranty_types w where w.organization_id = h.organization_id and w.active
  on conflict (unit_id, warranty_type_id) do nothing;
  perform public.log_timeline(h.organization_id, h.project_id, h.unit_id, 'HANDED_OVER', 'handover', h.id, 'Handed over', '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------- RPCs: warranty & service

create or replace function public.save_warranty_type(target_org uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare id uuid;
begin
  if not (public.can_manage_access(target_org)
          or exists(select 1 from projects p where p.organization_id = target_org and public.can_handover(p.id))) then
    raise exception 'Not authorized';
  end if;
  if coalesce(trim(data->>'code'), '') = '' or coalesce(trim(data->>'name_th'), '') = '' or nullif(data->>'months', '') is null then
    raise exception 'Invalid warranty';
  end if;
  insert into warranty_types (organization_id, code, name_th, name_en, months, default_partner_id, terms)
  values (target_org, upper(trim(data->>'code')), trim(data->>'name_th'), nullif(trim(data->>'name_en'), ''),
    (data->>'months')::int, nullif(data->>'default_partner_id', '')::uuid, nullif(trim(data->>'terms'), ''))
  on conflict (organization_id, code) do update set name_th = excluded.name_th, name_en = excluded.name_en,
    months = excluded.months, default_partner_id = excluded.default_partner_id, terms = excluded.terms
  returning warranty_types.id into id;
  return id;
end $$;

create or replace function public.raise_service_request(target_unit uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  u units;
  org uuid;
  as_customer boolean;
  w unit_warranties;
  doc_no text;
  id uuid;
begin
  select * into u from units where units.id = target_unit;
  if not found then raise exception 'Not authorized'; end if;
  as_customer := public.is_unit_customer(u.id);
  if not as_customer and not public.can_access_project(u.project_id) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from unit_handovers h where h.unit_id = u.id and h.status = 'HANDED_OVER') then
    raise exception 'Unit is not handed over';
  end if;
  if coalesce(trim(data->>'title'), '') = '' or coalesce(trim(data->>'description'), '') = '' then raise exception 'Invalid request'; end if;
  select organization_id into org from projects where projects.id = u.project_id;
  if nullif(data->>'warranty_id', '') is not null then
    select * into w from unit_warranties x where x.id = (data->>'warranty_id')::uuid and x.unit_id = u.id;
  end if;
  doc_no := public.next_document_no(org, 'SR');
  insert into service_requests (organization_id, project_id, unit_id, warranty_id, sr_no, title, description, location,
    in_warranty, partner_id, raised_by, raised_by_customer)
  values (org, u.project_id, u.id, w.id, doc_no, trim(data->>'title'), trim(data->>'description'), nullif(trim(data->>'location'), ''),
    w.id is not null and current_date between w.start_date and w.end_date, null, auth.uid(), as_customer)
  returning service_requests.id into id;
  perform public.log_timeline(org, u.project_id, u.id, 'SERVICE_REQUESTED', 'service_request', id, doc_no || ' ' || trim(data->>'title'), '{}'::jsonb);
  return id;
end $$;

create or replace function public.assign_service_request(target_sr uuid, target_partner uuid, due_date date)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare s service_requests;
begin
  select * into s from service_requests where id = target_sr for update;
  if not found or not public.can_handover(s.project_id) then raise exception 'Not authorized'; end if;
  if s.status not in ('OPEN','ASSIGNED') then raise exception 'Request is not open'; end if;
  if target_partner is not null and not exists(select 1 from partner_organizations p where p.id = target_partner
       and p.organization_id = s.organization_id and p.status = 'ACTIVE') then
    raise exception 'Invalid partner';
  end if;
  update service_requests set partner_id = coalesce(target_partner, (select w.partner_id from unit_warranties w where w.id = s.warranty_id)),
    due_date = due_date, status = 'ASSIGNED' where id = s.id;
end $$;

-- Resolution by the assigned partner or staff; the homeowner closes or reopens it.
create or replace function public.update_service_request(target_sr uuid, action text, note text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare s service_requests;
begin
  select * into s from service_requests where id = target_sr for update;
  if not found then raise exception 'Not authorized'; end if;
  if action = 'RESOLVE' then
    if not (coalesce(s.partner_id in (select public.my_partner_ids()), false) or public.can_handover(s.project_id)) then
      raise exception 'Not authorized';
    end if;
    if s.status not in ('OPEN','ASSIGNED') then raise exception 'Request is not open'; end if;
    if coalesce(trim(note), '') = '' then raise exception 'Resolution required'; end if;
    update service_requests set status = 'RESOLVED', resolution = trim(note), resolved_by = auth.uid(), resolved_at = now() where id = s.id;
  elsif action in ('CLOSE','REOPEN') then
    if not (public.is_unit_customer(s.unit_id) or public.can_handover(s.project_id)) then raise exception 'Not authorized'; end if;
    if s.status <> 'RESOLVED' then raise exception 'Request is not resolved'; end if;
    if action = 'CLOSE' then
      update service_requests set status = 'CLOSED', closed_at = now() where id = s.id;
      perform public.log_timeline(s.organization_id, s.project_id, s.unit_id, 'SERVICE_CLOSED', 'service_request', s.id, s.sr_no, '{}'::jsonb);
    else
      if coalesce(trim(note), '') = '' then raise exception 'Reason required'; end if;
      update service_requests set status = case when partner_id is null then 'OPEN' else 'ASSIGNED' end,
        reopen_count = reopen_count + 1, resolution = resolution || E'\n[reopened] ' || trim(note) where id = s.id;
    end if;
  elsif action = 'REJECT' then
    if not public.can_handover(s.project_id) then raise exception 'Not authorized'; end if;
    if s.status not in ('OPEN','ASSIGNED') then raise exception 'Request is not open'; end if;
    if coalesce(trim(note), '') = '' then raise exception 'Reason required'; end if;
    update service_requests set status = 'REJECTED', resolution = trim(note), closed_at = now() where id = s.id;
  else
    raise exception 'Invalid action';
  end if;
end $$;

-- ---------------------------------------------------------------- grants

do $$
declare f text;
begin
  foreach f in array array[
    'can_upload_handover_file(text)', 'can_read_handover_file(text)', 'can_handover(uuid)', 'handover_readiness(uuid)',
    'save_checklist_template(uuid, jsonb)', 'record_checklist_inspection(uuid, jsonb)',
    'mark_handover_ready(uuid)', 'schedule_customer_inspection(uuid, timestamptz)',
    'log_customer_defect(uuid, text, text, text)', 'accept_handover(uuid)', 'add_handover_item(uuid, jsonb)',
    'set_handover_item_delivered(uuid, boolean)', 'complete_handover(uuid, date, date, text)',
    'save_warranty_type(uuid, jsonb)', 'raise_service_request(uuid, jsonb)',
    'assign_service_request(uuid, uuid, date)', 'update_service_request(uuid, text, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
