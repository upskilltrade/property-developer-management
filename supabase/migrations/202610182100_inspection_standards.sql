-- Inspection standards library: every QC checklist item must cite a verified standard.
-- A standard (e.g. a DPT มยผ. document, a TIS มอก. spec, a manufacturer's installation guide or the
-- company's own written spec) is recorded with its official document. It can be cited only after a
-- manager marks it VERIFIED, which requires the document or its official URL to be attached.
-- Checklist items carry the clause and the acceptance criterion copied from that document; the
-- inspection record keeps a snapshot, so later edits never change what an inspection was judged against.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('standard-docs', 'standard-docs', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

create table if not exists public.inspection_standards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  title text not null,
  issuer text not null check (issuer in ('DPT','TISI','EIT','LAW','MANUFACTURER','COMPANY','OTHER')),
  edition text,
  source_url text,
  file_path text,
  status text not null default 'UNVERIFIED' check (status in ('UNVERIFIED','VERIFIED','SUPERSEDED')),
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
alter table public.inspection_standards enable row level security;
create policy inspection_standards_select on public.inspection_standards for select to authenticated
  using (public.is_internal_member(organization_id));

-- Snapshot of the reference each inspected item was judged against.
alter table public.inspection_items add column if not exists standard_id uuid references public.inspection_standards(id);
alter table public.inspection_items add column if not exists standard_code text;
alter table public.inspection_items add column if not exists clause text;
alter table public.inspection_items add column if not exists criterion text;

create or replace function public.can_manage_standards(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_access(target_org)
      or exists(select 1 from projects p where p.organization_id = target_org and public.can_schedule(p.id, 'APPROVE'));
$$;

create or replace function public.can_upload_standard_doc(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_standards(public.try_uuid((storage.foldername(object_name))[1]));
$$;
create or replace function public.can_read_standard_doc(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_internal_member(public.try_uuid((storage.foldername(object_name))[1]));
$$;
create policy standard_docs_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'standard-docs' and public.can_upload_standard_doc(name));
create policy standard_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'standard-docs' and public.can_read_standard_doc(name));

-- Create or update a standard. Changing what the record points at (code, edition, document, URL)
-- sends it back to UNVERIFIED so someone checks it again.
create or replace function public.save_inspection_standard(target_org uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s inspection_standards;
  sid uuid := public.try_uuid(nullif(data->>'id', ''));
  fpath text := nullif(trim(data->>'file_path'), '');
begin
  if not public.can_manage_standards(target_org) then raise exception 'Not authorized'; end if;
  if coalesce(trim(data->>'code'), '') = '' or coalesce(trim(data->>'title'), '') = ''
     or coalesce(data->>'issuer', '') not in ('DPT','TISI','EIT','LAW','MANUFACTURER','COMPANY','OTHER') then
    raise exception 'Invalid standard';
  end if;
  if fpath is not null and ((storage.foldername(fpath))[1] <> target_org::text
     or not exists(select 1 from storage.objects o where o.bucket_id = 'standard-docs' and o.name = fpath)) then
    raise exception 'Invalid standard';
  end if;
  if sid is null then
    insert into inspection_standards (organization_id, code, title, issuer, edition, source_url, file_path, notes, created_by)
    values (target_org, trim(data->>'code'), trim(data->>'title'), data->>'issuer', nullif(trim(data->>'edition'), ''),
            nullif(trim(data->>'source_url'), ''), fpath, nullif(trim(data->>'notes'), ''), auth.uid())
    returning * into s;
  else
    select * into s from inspection_standards where id = sid and organization_id = target_org for update;
    if not found then raise exception 'Invalid standard'; end if;
    update inspection_standards set
      code = trim(data->>'code'), title = trim(data->>'title'), issuer = data->>'issuer',
      edition = nullif(trim(data->>'edition'), ''), source_url = nullif(trim(data->>'source_url'), ''),
      file_path = coalesce(fpath, file_path), notes = nullif(trim(data->>'notes'), ''), updated_at = now(),
      status = case when status = 'VERIFIED' and (s.code is distinct from trim(data->>'code')
                      or s.edition is distinct from nullif(trim(data->>'edition'), '')
                      or s.source_url is distinct from nullif(trim(data->>'source_url'), '')
                      or (fpath is not null and fpath is distinct from s.file_path))
                    then 'UNVERIFIED' else status end
     where id = s.id
    returning * into s;
  end if;
  return s.id;
end $$;

create or replace function public.set_standard_status(target_standard uuid, new_status text)
returns void language plpgsql security definer set search_path = public as $$
declare s inspection_standards;
begin
  select * into s from inspection_standards where id = target_standard for update;
  if not found or not public.can_manage_standards(s.organization_id) then raise exception 'Not authorized'; end if;
  if new_status not in ('VERIFIED','SUPERSEDED','UNVERIFIED') then raise exception 'Invalid standard'; end if;
  if new_status = 'VERIFIED' and s.file_path is null and s.source_url is null then
    raise exception 'Standard document required';
  end if;
  update inspection_standards set status = new_status, updated_at = now(),
    verified_by = case when new_status = 'VERIFIED' then auth.uid() else verified_by end,
    verified_at = case when new_status = 'VERIFIED' then now() else verified_at end
   where id = s.id;
end $$;

-- Checklist items: { item, standard_id, clause, criterion, method? }. Each must cite a VERIFIED
-- standard of the same organization with the clause and acceptance criterion filled in.
create or replace function public.save_checklist_template(target_org uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  it jsonb;
  clean jsonb := '[]'::jsonb;
  std inspection_standards;
begin
  if not public.can_manage_standards(target_org) then raise exception 'Not authorized'; end if;
  if coalesce(trim(data->>'code'), '') = '' or coalesce(trim(data->>'name'), '') = ''
     or jsonb_typeof(data->'items') <> 'array' or jsonb_array_length(data->'items') = 0
     or jsonb_array_length(data->'items') > 200 then
    raise exception 'Invalid checklist';
  end if;
  for it in select * from jsonb_array_elements(data->'items') loop
    select * into std from inspection_standards
     where id = public.try_uuid(it->>'standard_id') and organization_id = target_org;
    if coalesce(trim(it->>'item'), '') = '' or coalesce(trim(it->>'clause'), '') = ''
       or coalesce(trim(it->>'criterion'), '') = '' or std.id is null then
      raise exception 'Item reference required';
    end if;
    if std.status <> 'VERIFIED' then raise exception 'Standard not verified'; end if;
    clean := clean || jsonb_build_array(jsonb_build_object(
      'item', trim(it->>'item'), 'standard_id', std.id, 'standard_code', std.code,
      'clause', trim(it->>'clause'), 'criterion', trim(it->>'criterion'),
      'method', nullif(trim(it->>'method'), '')));
  end loop;
  insert into checklist_templates (organization_id, code, name, purpose, items)
  values (target_org, upper(trim(data->>'code')), trim(data->>'name'), upper(coalesce(nullif(data->>'purpose', ''), 'QC')), clean)
  on conflict (organization_id, code) do update set name = excluded.name, purpose = excluded.purpose, items = excluded.items
  returning checklist_templates.id into new_id;
  return new_id;
end $$;

-- Recording an inspection: QC / pre-handover / handover items must carry their reference; the
-- reference is snapshotted on the item and copied into any defect raised from it.
create or replace function public.record_checklist_inspection(target_project uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pr projects;
  un uuid := nullif(data->>'unit_id', '')::uuid;
  it jsonb;
  n int := 0;
  failed int := 0;
  visible boolean := coalesce((data->>'customer_visible')::boolean, false);
  kind text := upper(coalesce(nullif(data->>'purpose', ''), 'QC'));
  doc_no text;
  insp uuid;
  partner uuid := nullif(data->>'assigned_partner_id', '')::uuid;
  std inspection_standards;
  ref text;
begin
  select * into pr from projects where projects.id = target_project;
  if not found or not public.can_schedule(pr.id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if coalesce(trim(data->>'title'), '') = '' or jsonb_typeof(data->'items') <> 'array' then raise exception 'Invalid inspection'; end if;
  select count(*) into failed from jsonb_array_elements(data->'items') x where upper(x->>'result') = 'FAIL';
  doc_no := public.next_document_no(pr.organization_id, 'INS');
  insert into inspections (organization_id, project_id, unit_id, inspection_no, title, inspected_on, result, notes, inspector_id,
    purpose, customer_visible)
  values (pr.organization_id, pr.id, un, doc_no, trim(data->>'title'), coalesce(nullif(data->>'inspected_on', '')::date, current_date),
    case when failed > 0 then 'FAIL' else 'PASS' end, nullif(trim(data->>'notes'), ''), auth.uid(), kind, visible)
  returning inspections.id into insp;
  for it in select * from jsonb_array_elements(data->'items') loop
    n := n + 1;
    std := null;
    select * into std from inspection_standards
     where id = public.try_uuid(it->>'standard_id') and organization_id = pr.organization_id;
    if kind in ('QC','PRE_HANDOVER','HANDOVER')
       and (std.id is null or coalesce(trim(it->>'clause'), '') = '' or coalesce(trim(it->>'criterion'), '') = '') then
      raise exception 'Item reference required';
    end if;
    insert into inspection_items (organization_id, inspection_id, seq, item, result, note, customer_visible,
      standard_id, standard_code, clause, criterion)
    values (pr.organization_id, insp, n, trim(it->>'item'), upper(coalesce(nullif(it->>'result', ''), 'PASS')),
      nullif(trim(it->>'note'), ''), visible, std.id, std.code, nullif(trim(it->>'clause'), ''), nullif(trim(it->>'criterion'), ''));
    if upper(it->>'result') = 'FAIL' then
      ref := case when std.id is not null
        then 'อ้างอิง: ' || std.code || ' ข้อ ' || trim(it->>'clause') || ' — ' || trim(it->>'criterion') end;
      insert into defects (organization_id, project_id, unit_id, inspection_id, defect_no, title, description, severity,
        assigned_partner_id, created_by, source, customer_visible)
      values (pr.organization_id, pr.id, un, insp, public.next_document_no(pr.organization_id, 'DF'), trim(it->>'item'),
        nullif(concat_ws(E'\n', nullif(trim(it->>'note'), ''), ref), ''),
        upper(coalesce(nullif(it->>'severity', ''), 'MEDIUM')), partner, auth.uid(), 'INTERNAL', visible);
    end if;
  end loop;
  perform public.log_timeline(pr.organization_id, pr.id, un, 'INSPECTION_' || case when failed > 0 then 'FAIL' else 'PASS' end,
    'inspection', insp, doc_no || ' ' || trim(data->>'title'), jsonb_build_object('failed', failed));
  return insp;
end $$;

do $$
declare f text;
begin
  foreach f in array array['can_manage_standards(uuid)', 'can_upload_standard_doc(text)', 'can_read_standard_doc(text)',
    'save_inspection_standard(uuid, jsonb)', 'set_standard_status(uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Catalogue entries whose code and title were confirmed from published sources. They start
-- UNVERIFIED: someone must attach the official document and verify before items can cite them.
insert into public.inspection_standards (organization_id, code, title, issuer, edition, source_url, notes)
select o.id, v.code, v.title, 'DPT', '2564', 'https://www.dpt.go.th/th/dpt-standard/827',
       'ชุด มยผ. 1101-64 ถึง 1106-64 มาตรฐานกำหนดคุณลักษณะเฉพาะของวัสดุใช้ในงานโครงสร้างอาคาร — แนบไฟล์ฉบับทางการก่อนยืนยัน'
  from public.organizations o
 cross join (values ('มยผ. 1101-64', 'มาตรฐานงานคอนกรีตและคอนกรีตเสริมเหล็ก'),
                    ('มยผ. 1103-64', 'มาตรฐานงานเหล็กเส้นเสริมคอนกรีต')) v(code, title)
on conflict (organization_id, code) do nothing;
