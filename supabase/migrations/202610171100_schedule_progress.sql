-- Schedule & progress (docs/SCHEDULE-PROGRESS-SPEC.md, delivery step 1).
-- Activities per unit (or project-level works), append-only progress reports, verification by a
-- different user, publication to customers, photo evidence in a private storage bucket, and a
-- default Thai detached-house template. unit_construction becomes a cached summary.

-- ---------------------------------------------------------------- helpers

create or replace function public.try_uuid(value text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return value::uuid;
exception when others then
  return null;
end $$;

create or replace function public.try_timestamptz(value text)
returns timestamptz language plpgsql stable set search_path = '' as $$
begin
  return value::timestamptz;
exception when others then
  return null;
end $$;

-- CONSTRUCTION permission on a project: report = EDIT or SUBMIT, verify / plan / publish = APPROVE.
-- Organization owners can always act.
create or replace function public.can_schedule(target_project uuid, target_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from projects p
    where p.id = target_project
      and (public.can_manage_access(p.organization_id)
        or public.has_effective_permission(p.organization_id, p.id, 'CONSTRUCTION', target_action))
  );
$$;
revoke all on function public.can_schedule(uuid, text) from public, anon;
grant execute on function public.can_schedule(uuid, text) to authenticated;

create or replace function public.can_report_progress(target_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_schedule(target_project, 'EDIT') or public.can_schedule(target_project, 'SUBMIT');
$$;
revoke all on function public.can_report_progress(uuid) from public, anon;
grant execute on function public.can_report_progress(uuid) to authenticated;

-- ---------------------------------------------------------------- templates

create table if not exists public.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  house_type_id uuid references public.house_types(id) on delete set null,
  code text not null,
  name_th text not null,
  name_en text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.schedule_template_activities (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.schedule_templates(id) on delete cascade,
  code text not null,
  name_th text not null,
  name_en text not null,
  stage text not null,
  sequence int not null,
  duration_days int not null default 1 check (duration_days >= 0),
  weight numeric(6,2) not null default 0 check (weight >= 0),
  predecessor_codes text[] not null default '{}',
  is_milestone boolean not null default false,
  photos_required int not null default 1 check (photos_required >= 0),
  unique (template_id, code)
);

-- ---------------------------------------------------------------- activities

create table if not exists public.schedule_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid references public.units(id) on delete cascade, -- null = project-level works
  parent_id uuid references public.schedule_activities(id) on delete cascade,
  template_activity_id uuid references public.schedule_template_activities(id) on delete set null,
  code text not null,
  name_th text not null,
  name_en text not null,
  stage text not null,
  sequence int not null default 0,
  weight numeric(6,2) not null default 0 check (weight >= 0),
  baseline_start date,
  baseline_finish date,
  forecast_start date,
  forecast_finish date,
  actual_start date,
  actual_finish date,
  status text not null default 'NOT_STARTED'
    check (status in ('NOT_STARTED','READY','IN_PROGRESS','INSPECTION','COMPLETED','BLOCKED','REWORK')),
  is_milestone boolean not null default false,
  photos_required int not null default 1 check (photos_required >= 0),
  reported_percent numeric(5,2) check (reported_percent between 0 and 100),
  verified_percent numeric(5,2) not null default 0 check (verified_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (project_id, unit_id, code)
);
create index if not exists schedule_activities_project_idx on public.schedule_activities(project_id, unit_id, sequence);

create table if not exists public.activity_dependencies (
  id uuid primary key default gen_random_uuid(),
  predecessor_id uuid not null references public.schedule_activities(id) on delete cascade,
  successor_id uuid not null references public.schedule_activities(id) on delete cascade,
  type text not null default 'FS' check (type = 'FS'),
  lag_days int not null default 0,
  unique (predecessor_id, successor_id),
  check (predecessor_id <> successor_id)
);
create index if not exists activity_dependencies_successor_idx on public.activity_dependencies(successor_id);

-- Append-only: clients never update or delete; verification and publication go through RPCs.
create table if not exists public.progress_updates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid references public.units(id) on delete cascade,
  activity_id uuid not null references public.schedule_activities(id) on delete cascade,
  report_date date not null default current_date,
  reported_percent numeric(5,2) not null check (reported_percent between 0 and 100),
  reported_by uuid references public.profiles(id),
  note text,
  verified_percent numeric(5,2) check (verified_percent between 0 and 100),
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  verification_note text,
  publication_status text not null default 'INTERNAL' check (publication_status in ('INTERNAL','PUBLISHED')),
  published_by uuid references public.profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists progress_updates_activity_idx on public.progress_updates(activity_id, created_at desc);
create index if not exists progress_updates_project_idx on public.progress_updates(project_id, created_at desc);

create table if not exists public.activity_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid references public.units(id) on delete cascade,
  activity_id uuid not null references public.schedule_activities(id) on delete cascade,
  progress_update_id uuid references public.progress_updates(id) on delete set null,
  storage_path text not null unique,
  thumbnail_path text,
  caption text,
  taken_at timestamptz,
  uploaded_by uuid references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  publication_status text not null default 'INTERNAL' check (publication_status in ('INTERNAL','PUBLISHED')),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  void_reason text
);
create index if not exists activity_photos_activity_idx on public.activity_photos(activity_id, uploaded_at desc);
create index if not exists activity_photos_project_idx on public.activity_photos(project_id, uploaded_at desc);

-- ---------------------------------------------------------------- RLS (read only; writes via RPCs)

alter table public.schedule_templates enable row level security;
alter table public.schedule_template_activities enable row level security;
alter table public.schedule_activities enable row level security;
alter table public.activity_dependencies enable row level security;
alter table public.progress_updates enable row level security;
alter table public.activity_photos enable row level security;

create policy schedule_templates_member_select on public.schedule_templates
  for select to authenticated using (public.is_org_member(organization_id));
create policy schedule_template_activities_member_select on public.schedule_template_activities
  for select to authenticated using (exists(
    select 1 from public.schedule_templates t
    where t.id = template_id and public.is_org_member(t.organization_id)));
create policy schedule_activities_project_select on public.schedule_activities
  for select to authenticated using (public.can_access_project(project_id));
create policy activity_dependencies_project_select on public.activity_dependencies
  for select to authenticated using (exists(
    select 1 from public.schedule_activities a
    where a.id = successor_id and public.can_access_project(a.project_id)));
create policy progress_updates_project_select on public.progress_updates
  for select to authenticated using (public.can_access_project(project_id));
create policy activity_photos_project_select on public.activity_photos
  for select to authenticated using (public.can_access_project(project_id));

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-photos', 'site-photos', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Path: <org>/<project>/<unit|project>/<activity>/<file>. The path is not authorization; the
-- project segment is checked against project access.
create policy site_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'site-photos'
    and public.can_access_project(public.try_uuid((storage.foldername(name))[2])));
create policy site_photos_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-photos'
    and public.can_report_progress(public.try_uuid((storage.foldername(name))[2])));

-- ---------------------------------------------------------------- summary refresh

-- Unit progress = Σ(weight × verified %) / Σ weight; stage = stage of the first unfinished activity.
create or replace function public.refresh_unit_progress(target_unit uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  pct numeric;
  current_stage text;
  first_start date;
  last_finish date;
begin
  if not exists(select 1 from schedule_activities where unit_id = target_unit) then return; end if;
  select case when sum(weight) > 0 then round(sum(weight * verified_percent) / sum(weight), 2) else 0 end,
         min(coalesce(actual_start, forecast_start)), max(forecast_finish)
    into pct, first_start, last_finish
    from schedule_activities where unit_id = target_unit;

  select stage into current_stage from schedule_activities
   where unit_id = target_unit and status <> 'COMPLETED' and not is_milestone
   order by sequence limit 1;
  if current_stage is null then
    current_stage := case when pct >= 100 then 'COMPLETED' else 'INSPECTION' end;
  elsif pct = 0 then
    current_stage := 'NOT_STARTED';
  end if;

  insert into unit_construction (unit_id, progress_percent, stage, start_date, target_completion_date, updated_at)
  values (target_unit, pct, current_stage, first_start, last_finish, now())
  on conflict (unit_id) do update
    set progress_percent = excluded.progress_percent, stage = excluded.stage,
        start_date = excluded.start_date, target_completion_date = excluded.target_completion_date,
        updated_at = now();
end $$;
revoke all on function public.refresh_unit_progress(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- RPCs

-- Clone a template into a unit, scheduling each activity after its predecessors (FS).
create or replace function public.apply_schedule_template(target_unit uuid, target_template uuid, start_date date)
returns int language plpgsql security definer set search_path = public as $$
declare
  u record;
  ta record;
  pred_finish date;
  s date;
  f date;
  created int := 0;
begin
  select un.id, un.project_id, p.organization_id into u
    from units un join projects p on p.id = un.project_id where un.id = target_unit;
  if not found then raise exception 'Unit not found'; end if;
  if not public.can_schedule(u.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if start_date is null then raise exception 'Start date required'; end if;
  if exists(select 1 from schedule_activities where unit_id = target_unit) then
    raise exception 'Unit already has a schedule';
  end if;
  if not exists(select 1 from schedule_templates t where t.id = target_template and t.organization_id = u.organization_id and t.active) then
    raise exception 'Template not found';
  end if;

  for ta in select * from schedule_template_activities where template_id = target_template order by sequence loop
    select max(a.baseline_finish) into pred_finish from schedule_activities a
     where a.unit_id = target_unit and a.code = any(ta.predecessor_codes);
    s := coalesce(pred_finish + 1, start_date);
    f := s + greatest(ta.duration_days - 1, 0);
    if ta.is_milestone then f := s; end if;
    insert into schedule_activities (organization_id, project_id, unit_id, template_activity_id, code, name_th, name_en,
      stage, sequence, weight, baseline_start, baseline_finish, forecast_start, forecast_finish, is_milestone, photos_required)
    values (u.organization_id, u.project_id, target_unit, ta.id, ta.code, ta.name_th, ta.name_en,
      ta.stage, ta.sequence, ta.weight, s, f, s, f, ta.is_milestone, case when ta.is_milestone then 0 else ta.photos_required end);
    created := created + 1;
  end loop;

  insert into activity_dependencies (predecessor_id, successor_id)
  select p.id, a.id
    from schedule_activities a
    join schedule_template_activities tpl on tpl.id = a.template_activity_id
    join schedule_activities p on p.unit_id = a.unit_id and p.code = any(tpl.predecessor_codes)
   where a.unit_id = target_unit
  on conflict do nothing;

  perform refresh_unit_progress(target_unit);
  return created;
end $$;

-- Report progress with photo evidence already uploaded to storage.
-- photos: [{"path": "...", "thumb": "...", "caption": "...", "taken_at": "..."}]
create or replace function public.report_progress(target_activity uuid, percent numeric, note text, report_date date, photos jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  a schedule_activities;
  update_id uuid;
  ph jsonb;
  prefix text;
begin
  select * into a from schedule_activities where id = target_activity;
  if not found then raise exception 'Activity not found'; end if;
  if not public.can_report_progress(a.project_id) then raise exception 'Not authorized'; end if;
  if percent is null or percent < 0 or percent > 100 then raise exception 'Percent must be 0-100'; end if;
  if coalesce(jsonb_array_length(photos), 0) < a.photos_required then
    raise exception 'At least % photo(s) required', a.photos_required;
  end if;

  prefix := a.organization_id || '/' || a.project_id || '/' || coalesce(a.unit_id::text, 'project') || '/' || a.id || '/';
  for ph in select * from jsonb_array_elements(coalesce(photos, '[]'::jsonb)) loop
    if left(ph->>'path', length(prefix)) <> prefix
       or (ph->>'thumb' is not null and left(ph->>'thumb', length(prefix)) <> prefix) then
      raise exception 'Photo path does not belong to this activity';
    end if;
    if not exists(select 1 from storage.objects o where o.bucket_id = 'site-photos' and o.name = ph->>'path') then
      raise exception 'Photo not uploaded: %', ph->>'path';
    end if;
  end loop;

  insert into progress_updates (organization_id, project_id, unit_id, activity_id, report_date, reported_percent, reported_by, note)
  values (a.organization_id, a.project_id, a.unit_id, a.id, coalesce(report_date, current_date), percent, auth.uid(), nullif(trim(note), ''))
  returning id into update_id;

  insert into activity_photos (organization_id, project_id, unit_id, activity_id, progress_update_id,
    storage_path, thumbnail_path, caption, taken_at, uploaded_by)
  select a.organization_id, a.project_id, a.unit_id, a.id, update_id,
         p->>'path', p->>'thumb', nullif(trim(p->>'caption'), ''),
         coalesce(public.try_timestamptz(p->>'taken_at'), now()), auth.uid()
    from jsonb_array_elements(coalesce(photos, '[]'::jsonb)) p;

  update schedule_activities set reported_percent = percent, updated_at = now() where id = a.id;
  return update_id;
end $$;

-- Verify a report. Only a different user with APPROVE may verify; official progress changes here.
create or replace function public.verify_progress(target_update uuid, percent numeric, note text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  pu progress_updates;
  a schedule_activities;
  first_progress date;
begin
  select * into pu from progress_updates where id = target_update for update;
  if not found then raise exception 'Progress update not found'; end if;
  if not public.can_schedule(pu.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if pu.verified_at is not null then raise exception 'Already verified'; end if;
  if pu.reported_by = auth.uid() then raise exception 'Reporter cannot verify their own report'; end if;
  if percent is null or percent < 0 or percent > 100 then raise exception 'Percent must be 0-100'; end if;

  update progress_updates
     set verified_percent = percent, verified_by = auth.uid(), verified_at = now(), verification_note = nullif(trim(note), '')
   where id = target_update;

  select * into a from schedule_activities where id = pu.activity_id for update;
  select min(report_date) into first_progress from progress_updates
   where activity_id = a.id and verified_percent > 0;

  update schedule_activities
     set verified_percent = percent,
         status = case when percent >= 100 then 'COMPLETED' when percent > 0 then 'IN_PROGRESS' else status end,
         actual_start = case when percent > 0 then coalesce(actual_start, first_progress, pu.report_date) else actual_start end,
         actual_finish = case when percent >= 100 then pu.report_date else null end,
         forecast_finish = case when percent >= 100 then pu.report_date else forecast_finish end,
         updated_at = now()
   where id = a.id;

  if a.unit_id is not null then perform refresh_unit_progress(a.unit_id); end if;
end $$;

-- Publish a verified report and the chosen photos to the customer.
create or replace function public.publish_progress(target_update uuid, photo_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  pu progress_updates;
begin
  select * into pu from progress_updates where id = target_update for update;
  if not found then raise exception 'Progress update not found'; end if;
  if not public.can_schedule(pu.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if pu.verified_at is null then raise exception 'Only verified progress can be published'; end if;

  update progress_updates set publication_status = 'PUBLISHED', published_by = auth.uid(), published_at = now()
   where id = target_update;
  update activity_photos set publication_status = 'PUBLISHED'
   where progress_update_id = target_update and id = any(coalesce(photo_ids, '{}')) and voided_at is null;
end $$;

-- Move the forecast (the baseline never changes here, so delay shows against it).
create or replace function public.update_activity_forecast(target_activity uuid, new_start date, new_finish date)
returns void language plpgsql security definer set search_path = public as $$
declare
  a schedule_activities;
begin
  select * into a from schedule_activities where id = target_activity;
  if not found then raise exception 'Activity not found'; end if;
  if not public.can_schedule(a.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if new_start is null or new_finish is null or new_finish < new_start then raise exception 'Invalid dates'; end if;
  update schedule_activities set forecast_start = new_start, forecast_finish = new_finish, updated_at = now()
   where id = target_activity;
  if a.unit_id is not null then perform refresh_unit_progress(a.unit_id); end if;
end $$;

-- Photos are evidence: voided, never deleted.
create or replace function public.void_activity_photo(target_photo uuid, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  ph activity_photos;
begin
  select * into ph from activity_photos where id = target_photo;
  if not found then raise exception 'Photo not found'; end if;
  if not public.can_schedule(ph.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if coalesce(trim(reason), '') = '' then raise exception 'Reason required'; end if;
  update activity_photos set voided_at = now(), voided_by = auth.uid(), void_reason = trim(reason),
         publication_status = 'INTERNAL'
   where id = target_photo and voided_at is null;
end $$;

revoke all on function public.apply_schedule_template(uuid, uuid, date) from public, anon;
revoke all on function public.report_progress(uuid, numeric, text, date, jsonb) from public, anon;
revoke all on function public.verify_progress(uuid, numeric, text) from public, anon;
revoke all on function public.publish_progress(uuid, uuid[]) from public, anon;
revoke all on function public.update_activity_forecast(uuid, date, date) from public, anon;
revoke all on function public.void_activity_photo(uuid, text) from public, anon;
grant execute on function public.apply_schedule_template(uuid, uuid, date) to authenticated;
grant execute on function public.report_progress(uuid, numeric, text, date, jsonb) to authenticated;
grant execute on function public.verify_progress(uuid, numeric, text) to authenticated;
grant execute on function public.publish_progress(uuid, uuid[]) to authenticated;
grant execute on function public.update_activity_forecast(uuid, date, date) to authenticated;
grant execute on function public.void_activity_photo(uuid, text) to authenticated;

-- ---------------------------------------------------------------- default template

insert into public.schedule_templates (organization_id, code, name_th, name_en)
select o.id, 'TH-DETACHED', 'บ้านเดี่ยวมาตรฐาน', 'Standard detached house' from public.organizations o
on conflict (organization_id, code) do nothing;

insert into public.schedule_template_activities
  (template_id, code, name_th, name_en, stage, sequence, duration_days, weight, predecessor_codes, is_milestone)
select t.id, v.code, v.th, v.en, v.stage, v.seq, v.days, v.weight, v.preds, v.milestone
from public.schedule_templates t
cross join (values
  ('A01','เตรียมพื้นที่ / วางผัง','Site preparation / setting out','FOUNDATION',10,5,3,'{}'::text[],false),
  ('A02','เสาเข็ม / ฐานราก','Piling & footing','FOUNDATION',20,14,10,'{A01}',false),
  ('A03','คานคอดิน / พื้นชั้นล่าง','Ground beams & slab','STRUCTURE',30,10,8,'{A02}',false),
  ('A04','เสา คาน พื้นชั้นบน','Columns, beams, upper slab','STRUCTURE',40,21,14,'{A03}',false),
  ('A05','โครงหลังคา / มุงหลังคา','Roof structure & roofing','ROOF',50,14,9,'{A04}',false),
  ('A06','ก่ออิฐ','Masonry walls','STRUCTURE',60,14,8,'{A04}',false),
  ('A07','ท่อ / สายไฟ / งานระบบ','MEP rough-in','MEP',70,10,9,'{A06}',false),
  ('A08','ฉาบปูน','Plastering','FINISHING',80,12,7,'{A07}',false),
  ('A09','ประตู หน้าต่าง','Doors & windows','FINISHING',90,7,6,'{A08}',false),
  ('A10','กระเบื้อง / ฝ้า','Floor & wall tiles, ceiling','FINISHING',100,14,9,'{A08,A05}',false),
  ('A11','ทาสี','Painting','FINISHING',110,7,5,'{A10}',false),
  ('A12','สุขภัณฑ์ / ดวงโคม','Sanitary & electrical fixtures','FINISHING',120,5,5,'{A11}',false),
  ('A13','งานภายนอก / จัดสวน','External works / landscape','FINISHING',130,10,4,'{A05}',false),
  ('A14','ตรวจ QC / แก้ไข','QC inspection & defects','INSPECTION',140,5,3,'{A09,A12,A13}',false),
  ('HO','พร้อมส่งมอบ','Ready for handover','COMPLETED',150,0,0,'{A14}',true)
) v(code, th, en, stage, seq, days, weight, preds, milestone)
where t.code = 'TH-DETACHED'
on conflict (template_id, code) do nothing;
