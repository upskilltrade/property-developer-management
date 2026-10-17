-- Construction operations and partner portal (MVP-ROADMAP Release 4).
-- Schedule -> Assigned work -> Site execution -> Reported progress -> Verification -> Published.
--
-- Partners (contractors, consultants...) are organization records; their portal users are linked
-- as partner contacts. Everything a contractor sees derives from an ACTIVE partner assignment:
-- only activities assigned to their partner, only RELEASED drawings of their assigned units, and
-- only their own RFIs, site instructions, defects and site reports. Contractor-reported progress
-- keeps going through the existing report -> verify (different person) -> publish flow, and the
-- reporting partner is recorded so reported and verified figures stay distinguishable.
-- RFIs keep an append-only response thread; site instructions, inspections and defects are
-- numbered (RFI-, SI-, INS-, DF-) and every step is written to the timeline.

-- ---------------------------------------------------------------- partners

create table if not exists public.partner_organizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  partner_type text not null check (partner_type in
    ('CONTRACTOR','SUBCONTRACTOR','SUPPLIER','CONSULTANT','ARCHITECT','ENGINEER','INSPECTOR','OTHER')),
  name text not null,
  tax_ref text,
  phone text,
  email text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.partner_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  partner_id uuid not null references public.partner_organizations(id) on delete cascade,
  profile_id uuid references public.profiles(id),
  full_name text not null,
  phone text,
  email text,
  role text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists partner_contacts_profile_idx on public.partner_contacts(partner_id, profile_id)
  where profile_id is not null;

create table if not exists public.partner_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  partner_id uuid not null references public.partner_organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete cascade,
  scope_description text,
  start_date date,
  end_date date,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ENDED')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists partner_assignments_project_idx on public.partner_assignments(project_id, partner_id);

alter table public.schedule_activities add column if not exists assigned_partner_id uuid
  references public.partner_organizations(id) on delete set null;
alter table public.progress_updates add column if not exists reporter_partner_id uuid
  references public.partner_organizations(id);

-- ---------------------------------------------------------------- partner scope helpers

-- Partners the signed-in user acts for.
create or replace function public.my_partner_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select c.partner_id from partner_contacts c join partner_organizations p on p.id = c.partner_id
   where c.profile_id = auth.uid() and c.active and p.status = 'ACTIVE';
$$;

-- An ACTIVE assignment of one of my partners covers this project (and unit, when given).
create or replace function public.partner_assigned(target_project uuid, target_unit uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from partner_assignments a
     where a.project_id = target_project and a.status = 'ACTIVE'
       and a.partner_id in (select public.my_partner_ids())
       and (a.unit_id is null or target_unit is null or a.unit_id = target_unit));
$$;

-- Assigned work: the activity is assigned to my partner and my partner is assigned to its project/unit.
create or replace function public.partner_can_see_activity(target_activity uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from schedule_activities s
     where s.id = target_activity
       and s.assigned_partner_id in (select public.my_partner_ids())
       and public.partner_assigned(s.project_id, s.unit_id));
$$;

-- Released drawings for my assigned units (a project-wide assignment covers the whole project).
create or replace function public.partner_can_see_drawing(target_drawing uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from drawings d join design_packages p on p.id = d.package_id
     where d.id = target_drawing
       and exists(
         select 1 from partner_assignments a
          where a.project_id = d.project_id and a.status = 'ACTIVE'
            and a.partner_id in (select public.my_partner_ids())
            and (a.unit_id is null
              or (p.scope = 'UNIT' and p.unit_id = a.unit_id)
              or (p.scope = 'MASTER' and exists(select 1 from units u where u.id = a.unit_id
                    and u.house_type_id is not distinct from p.house_type_id)))));
$$;

-- ---------------------------------------------------------------- RFI / SI / site report / QA

create table if not exists public.rfis (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  drawing_id uuid references public.drawings(id) on delete set null,
  rfi_no text not null,
  subject text not null,
  question text not null,
  partner_id uuid references public.partner_organizations(id),
  raised_by uuid references public.profiles(id),
  status text not null default 'OPEN' check (status in ('OPEN','ANSWERED','CLOSED')),
  due_date date,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references public.profiles(id),
  unique (organization_id, rfi_no)
);

create table if not exists public.rfi_responses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rfi_id uuid not null references public.rfis(id) on delete cascade,
  body text not null,
  is_answer boolean not null default false,
  responded_by uuid references public.profiles(id),
  responder_partner_id uuid references public.partner_organizations(id),
  created_at timestamptz not null default now()
);

create table if not exists public.site_instructions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  partner_id uuid not null references public.partner_organizations(id),
  rfi_id uuid references public.rfis(id) on delete set null,
  si_no text not null,
  title text not null,
  instruction text not null,
  status text not null default 'ISSUED' check (status in ('ISSUED','ACKNOWLEDGED','DONE','CANCELLED')),
  issued_by uuid references public.profiles(id),
  issued_at timestamptz not null default now(),
  acknowledged_by uuid references public.profiles(id),
  acknowledged_at timestamptz,
  completed_at timestamptz,
  completion_note text,
  unique (organization_id, si_no)
);

create table if not exists public.site_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  partner_id uuid references public.partner_organizations(id),
  report_date date not null,
  weather text check (weather in ('SUNNY','CLOUDY','RAIN','STORM')),
  manpower int not null default 0 check (manpower >= 0),
  work_summary text not null,
  issues text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  verified_by uuid references public.profiles(id),
  verified_at timestamptz
);
create unique index if not exists site_reports_one_per_day on public.site_reports(project_id, report_date,
  coalesce(partner_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  activity_id uuid references public.schedule_activities(id) on delete set null,
  inspection_no text not null,
  title text not null,
  inspected_on date not null default current_date,
  result text not null check (result in ('PASS','CONDITIONAL','FAIL')),
  notes text,
  inspector_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (organization_id, inspection_no)
);

create table if not exists public.defects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  inspection_id uuid references public.inspections(id) on delete set null,
  defect_no text not null,
  title text not null,
  description text,
  location text,
  severity text not null default 'MEDIUM' check (severity in ('LOW','MEDIUM','HIGH')),
  assigned_partner_id uuid references public.partner_organizations(id),
  status text not null default 'OPEN' check (status in ('OPEN','FIXED','VERIFIED')),
  due_date date,
  fix_note text,
  fixed_by uuid references public.profiles(id),
  fixed_at timestamptz,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  reopen_count int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (organization_id, defect_no)
);

-- RFI responses are the record of what was asked and answered.
create or replace function public.reject_rfi_response_change()
returns trigger language plpgsql as $$
begin
  raise exception 'RFI responses are immutable';
end $$;
create or replace trigger rfi_responses_immutable before update or delete on public.rfi_responses
  for each row execute function public.reject_rfi_response_change();

-- ---------------------------------------------------------------- RLS

alter table public.partner_organizations enable row level security;
alter table public.partner_contacts enable row level security;
alter table public.partner_assignments enable row level security;
alter table public.rfis enable row level security;
alter table public.rfi_responses enable row level security;
alter table public.site_instructions enable row level security;
alter table public.site_reports enable row level security;
alter table public.inspections enable row level security;
alter table public.defects enable row level security;

create policy partner_organizations_select on public.partner_organizations for select to authenticated
  using (public.is_internal_member(organization_id) or id in (select public.my_partner_ids()));
create policy partner_contacts_select on public.partner_contacts for select to authenticated
  using (public.is_internal_member(organization_id) or partner_id in (select public.my_partner_ids()));
create policy partner_assignments_select on public.partner_assignments for select to authenticated
  using (public.can_access_project(project_id) or partner_id in (select public.my_partner_ids()));
create policy rfis_select on public.rfis for select to authenticated
  using (public.can_access_project(project_id) or partner_id in (select public.my_partner_ids()));
create policy rfi_responses_select on public.rfi_responses for select to authenticated
  using (exists(select 1 from rfis r where r.id = rfi_id
    and (public.can_access_project(r.project_id) or r.partner_id in (select public.my_partner_ids()))));
create policy site_instructions_select on public.site_instructions for select to authenticated
  using (public.can_access_project(project_id) or partner_id in (select public.my_partner_ids()));
create policy site_reports_select on public.site_reports for select to authenticated
  using (public.can_access_project(project_id) or partner_id in (select public.my_partner_ids()));
create policy inspections_select on public.inspections for select to authenticated
  using (public.can_access_project(project_id));
create policy defects_select on public.defects for select to authenticated
  using (public.can_access_project(project_id) or assigned_partner_id in (select public.my_partner_ids()));

grant select on public.partner_organizations, public.partner_contacts, public.partner_assignments, public.rfis,
  public.rfi_responses, public.site_instructions, public.site_reports, public.inspections, public.defects to authenticated;

-- Contractors see their assigned activities, their own reports/photos, and released drawings.
alter policy schedule_activities_project_select on public.schedule_activities
  using (public.can_access_project(project_id) or public.partner_can_see_activity(id));
alter policy progress_updates_project_select on public.progress_updates
  using (public.can_access_project(project_id) or public.partner_can_see_activity(activity_id));
alter policy activity_photos_project_select on public.activity_photos
  using (public.can_access_project(project_id) or (uploaded_by = auth.uid() and public.partner_can_see_activity(activity_id)));
alter policy drawings_select on public.drawings
  using (public.can_access_project(project_id) or public.customer_can_see_drawing(id)
    or (current_revision_id is not null and public.partner_can_see_drawing(id)));
alter policy drawing_revisions_select on public.drawing_revisions
  using (public.can_access_project(project_id)
    or (status = 'RELEASED' and (public.customer_can_see_drawing(drawing_id) or public.partner_can_see_drawing(drawing_id))));
alter policy design_packages_select on public.design_packages
  using (public.can_access_project(project_id)
    or (scope = 'UNIT' and public.is_unit_customer(unit_id))
    or (scope = 'MASTER' and exists(select 1 from units u where u.project_id = design_packages.project_id
         and u.house_type_id = design_packages.house_type_id and public.is_unit_customer(u.id)))
    or exists(select 1 from drawings d where d.package_id = design_packages.id and public.partner_can_see_drawing(d.id)));

-- Site photos: partners upload/read under their assigned activities (<org>/<project>/<unit>/<activity>/...).
alter policy site_photos_upload on storage.objects
  with check (bucket_id = 'site-photos'
    and (public.can_report_progress(public.try_uuid((storage.foldername(name))[2]))
      or public.partner_can_see_activity(public.try_uuid((storage.foldername(name))[4]))));
alter policy site_photos_read on storage.objects
  using (bucket_id = 'site-photos'
    and (public.can_access_project(public.try_uuid((storage.foldername(name))[2]))
      or (owner_id = auth.uid()::text and public.partner_can_see_activity(public.try_uuid((storage.foldername(name))[4])))));

-- Released drawing files for partners.
create or replace function public.can_read_design_file(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
      select 1 from drawing_revisions r
       where r.file_path = object_name
         and (public.can_access_project(r.project_id)
           or (r.status = 'RELEASED' and (public.customer_can_see_drawing(r.drawing_id)
                                          or public.partner_can_see_drawing(r.drawing_id)))))
    or exists(
      select 1 from materials m
       where m.image_path = object_name
         and (public.is_internal_member(m.organization_id)
           or exists(select 1 from material_selections s where s.material_id = m.id
             and s.status in ('PUBLISHED','APPROVED','CHANGE_REQUESTED') and public.is_unit_customer(s.unit_id))));
$$;

-- ---------------------------------------------------------------- progress reporting by partners

create or replace function public.report_progress(target_activity uuid, percent numeric, note text, report_date date, photos jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  a schedule_activities;
  update_id uuid;
  ph jsonb;
  prefix text;
  as_partner uuid;
begin
  select * into a from schedule_activities where id = target_activity;
  if not found then raise exception 'Activity not found'; end if;
  if not public.can_report_progress(a.project_id) then
    if not public.partner_can_see_activity(a.id) then raise exception 'Not authorized'; end if;
    as_partner := a.assigned_partner_id;
  end if;
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

  insert into progress_updates (organization_id, project_id, unit_id, activity_id, report_date, reported_percent,
    reported_by, note, reporter_partner_id)
  values (a.organization_id, a.project_id, a.unit_id, a.id, coalesce(report_date, current_date), percent, auth.uid(),
    nullif(trim(note), ''), as_partner)
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

-- ---------------------------------------------------------------- RPCs: partners & assignment

create or replace function public.upsert_partner(target_org uuid, target_partner uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare id uuid := target_partner;
begin
  if not (public.can_manage_access(target_org)
          or exists(select 1 from projects p where p.organization_id = target_org and public.can_schedule(p.id, 'APPROVE'))) then
    raise exception 'Not authorized';
  end if;
  if coalesce(trim(data->>'name'), '') = '' then raise exception 'Invalid partner'; end if;
  if id is null then
    insert into partner_organizations (organization_id, partner_type, name, tax_ref, phone, email, created_by)
    values (target_org, upper(coalesce(nullif(data->>'partner_type', ''), 'CONTRACTOR')), trim(data->>'name'),
      nullif(trim(data->>'tax_ref'), ''), nullif(trim(data->>'phone'), ''), nullif(trim(data->>'email'), ''), auth.uid())
    returning partner_organizations.id into id;
  else
    update partner_organizations set partner_type = upper(data->>'partner_type'), name = trim(data->>'name'),
      tax_ref = nullif(trim(data->>'tax_ref'), ''), phone = nullif(trim(data->>'phone'), ''),
      email = nullif(trim(data->>'email'), ''), status = coalesce(nullif(data->>'status', ''), status)
     where partner_organizations.id = id and organization_id = target_org;
    if not found then raise exception 'Not authorized'; end if;
  end if;
  return id;
end $$;

-- Contact; linking a portal user requires that user to be a member of the organization.
create or replace function public.add_partner_contact(target_partner uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  p partner_organizations;
  prof uuid := nullif(data->>'profile_id', '')::uuid;
  id uuid;
begin
  select * into p from partner_organizations where partner_organizations.id = target_partner;
  if not found or not (public.can_manage_access(p.organization_id)
     or exists(select 1 from projects x where x.organization_id = p.organization_id and public.can_schedule(x.id, 'APPROVE'))) then
    raise exception 'Not authorized';
  end if;
  if coalesce(trim(data->>'full_name'), '') = '' then raise exception 'Invalid contact'; end if;
  if prof is not null and not exists(select 1 from organization_memberships m
      where m.organization_id = p.organization_id and m.user_id = prof) then
    raise exception 'Invalid user';
  end if;
  insert into partner_contacts (organization_id, partner_id, profile_id, full_name, phone, email, role)
  values (p.organization_id, p.id, prof, trim(data->>'full_name'), nullif(trim(data->>'phone'), ''),
    nullif(trim(data->>'email'), ''), nullif(trim(data->>'role'), ''))
  returning partner_contacts.id into id;
  return id;
end $$;

create or replace function public.assign_partner(target_project uuid, target_partner uuid, target_unit uuid,
  scope text, start_date date, end_date date)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  pr projects;
  id uuid;
begin
  select * into pr from projects where projects.id = target_project;
  if not found or not public.can_schedule(pr.id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if not exists(select 1 from partner_organizations x where x.id = target_partner and x.organization_id = pr.organization_id
                  and x.status = 'ACTIVE') then
    raise exception 'Invalid partner';
  end if;
  if target_unit is not null and not exists(select 1 from units u where u.id = target_unit and u.project_id = pr.id) then
    raise exception 'Invalid unit';
  end if;
  insert into partner_assignments (organization_id, project_id, partner_id, unit_id, scope_description, start_date, end_date, created_by)
  values (pr.organization_id, pr.id, target_partner, target_unit, nullif(trim(scope), ''), start_date, end_date, auth.uid())
  returning partner_assignments.id into id;
  return id;
end $$;

create or replace function public.end_partner_assignment(target_assignment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a partner_assignments;
begin
  select * into a from partner_assignments where id = target_assignment;
  if not found or not public.can_schedule(a.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  update partner_assignments set status = 'ENDED', end_date = coalesce(end_date, current_date) where id = a.id;
end $$;

-- Assign activities (by id) to a partner, or clear them with a null partner.
create or replace function public.assign_activities(activity_ids uuid[], target_partner uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if exists(select 1 from schedule_activities s where s.id = any(activity_ids)
            and not public.can_schedule(s.project_id, 'APPROVE')) then
    raise exception 'Not authorized';
  end if;
  if target_partner is not null and exists(select 1 from schedule_activities s where s.id = any(activity_ids)
       and not exists(select 1 from partner_assignments a where a.partner_id = target_partner and a.project_id = s.project_id
                      and a.status = 'ACTIVE' and (a.unit_id is null or a.unit_id = s.unit_id))) then
    raise exception 'Partner is not assigned to this work';
  end if;
  update schedule_activities set assigned_partner_id = target_partner, updated_at = now() where id = any(activity_ids);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- RPCs: RFI

create or replace function public.raise_rfi(target_project uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pr projects;
  un uuid := nullif(data->>'unit_id', '')::uuid;
  partner uuid := null;
  id uuid;
  doc_no text;
begin
  select * into pr from projects where projects.id = target_project;
  if not found then raise exception 'Not authorized'; end if;
  if not public.can_access_project(pr.id) then
    select a.partner_id into partner from partner_assignments a
     where a.project_id = pr.id and a.status = 'ACTIVE' and a.partner_id in (select public.my_partner_ids())
       and (a.unit_id is null or un is null or a.unit_id = un)
     limit 1;
    if partner is null then raise exception 'Not authorized'; end if;
  else
    partner := nullif(data->>'partner_id', '')::uuid;
  end if;
  if coalesce(trim(data->>'subject'), '') = '' or coalesce(trim(data->>'question'), '') = '' then
    raise exception 'Invalid RFI';
  end if;
  doc_no := public.next_document_no(pr.organization_id, 'RFI');
  insert into rfis (organization_id, project_id, unit_id, drawing_id, rfi_no, subject, question, partner_id, raised_by, due_date)
  values (pr.organization_id, pr.id, un, nullif(data->>'drawing_id', '')::uuid, doc_no, trim(data->>'subject'),
    trim(data->>'question'), partner, auth.uid(), nullif(data->>'due_date', '')::date)
  returning rfis.id into id;
  perform public.log_timeline(pr.organization_id, pr.id, un, 'RFI_RAISED', 'rfi', id, doc_no || ' ' || trim(data->>'subject'), '{}'::jsonb);
  return id;
end $$;

-- Internal staff answer (is_answer marks the RFI ANSWERED); the partner can add follow-ups.
create or replace function public.respond_rfi(target_rfi uuid, body text, is_answer boolean)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  r rfis;
  internal boolean;
  id uuid;
begin
  select * into r from rfis where rfis.id = target_rfi for update;
  if not found then raise exception 'Not authorized'; end if;
  internal := public.can_schedule(r.project_id, 'EDIT') or public.can_schedule(r.project_id, 'APPROVE')
    or public.can_design(r.project_id, 'EDIT');
  if not internal and not coalesce(r.partner_id in (select public.my_partner_ids()), false) then raise exception 'Not authorized'; end if;
  if r.status = 'CLOSED' then raise exception 'RFI is closed'; end if;
  if coalesce(trim(body), '') = '' then raise exception 'Invalid response'; end if;
  insert into rfi_responses (organization_id, rfi_id, body, is_answer, responded_by, responder_partner_id)
  values (r.organization_id, r.id, trim(body), internal and coalesce(is_answer, false), auth.uid(),
    case when internal then null else r.partner_id end)
  returning rfi_responses.id into id;
  if internal and coalesce(is_answer, false) then
    update rfis set status = 'ANSWERED' where rfis.id = r.id;
    perform public.log_timeline(r.organization_id, r.project_id, r.unit_id, 'RFI_ANSWERED', 'rfi', r.id, r.rfi_no, '{}'::jsonb);
  elsif not internal and r.status = 'ANSWERED' then
    update rfis set status = 'OPEN' where rfis.id = r.id;
  end if;
  return id;
end $$;

create or replace function public.close_rfi(target_rfi uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r rfis;
begin
  select * into r from rfis where id = target_rfi for update;
  if not found or not (public.can_schedule(r.project_id, 'APPROVE') or public.can_schedule(r.project_id, 'EDIT')) then
    raise exception 'Not authorized';
  end if;
  if r.status <> 'ANSWERED' then raise exception 'RFI is not answered'; end if;
  update rfis set status = 'CLOSED', closed_at = now(), closed_by = auth.uid() where id = r.id;
end $$;

-- ---------------------------------------------------------------- RPCs: site instruction

create or replace function public.issue_site_instruction(target_project uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pr projects;
  partner uuid := nullif(data->>'partner_id', '')::uuid;
  un uuid := nullif(data->>'unit_id', '')::uuid;
  id uuid;
  doc_no text;
begin
  select * into pr from projects where projects.id = target_project;
  if not found or not public.can_schedule(pr.id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if partner is null or not exists(select 1 from partner_assignments a where a.partner_id = partner and a.project_id = pr.id
       and a.status = 'ACTIVE' and (a.unit_id is null or un is null or a.unit_id = un)) then
    raise exception 'Partner is not assigned to this work';
  end if;
  if coalesce(trim(data->>'title'), '') = '' or coalesce(trim(data->>'instruction'), '') = '' then
    raise exception 'Invalid instruction';
  end if;
  doc_no := public.next_document_no(pr.organization_id, 'SI');
  insert into site_instructions (organization_id, project_id, unit_id, partner_id, rfi_id, si_no, title, instruction, issued_by)
  values (pr.organization_id, pr.id, un, partner, nullif(data->>'rfi_id', '')::uuid, doc_no, trim(data->>'title'),
    trim(data->>'instruction'), auth.uid())
  returning site_instructions.id into id;
  perform public.log_timeline(pr.organization_id, pr.id, un, 'SI_ISSUED', 'site_instruction', id, doc_no || ' ' || trim(data->>'title'), '{}'::jsonb);
  return id;
end $$;

-- Partner acknowledges, then reports done; internal staff may cancel.
create or replace function public.update_site_instruction(target_si uuid, action text, note text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare s site_instructions;
begin
  select * into s from site_instructions where id = target_si for update;
  if not found then raise exception 'Not authorized'; end if;
  if action = 'CANCEL' then
    if not public.can_schedule(s.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
    if s.status in ('DONE','CANCELLED') then raise exception 'Instruction is closed'; end if;
    update site_instructions set status = 'CANCELLED', completion_note = nullif(trim(note), '') where id = s.id;
    return;
  end if;
  if not (coalesce(s.partner_id in (select public.my_partner_ids()), false) or public.can_schedule(s.project_id, 'APPROVE')) then
    raise exception 'Not authorized';
  end if;
  if action = 'ACKNOWLEDGE' and s.status = 'ISSUED' then
    update site_instructions set status = 'ACKNOWLEDGED', acknowledged_by = auth.uid(), acknowledged_at = now() where id = s.id;
  elsif action = 'DONE' and s.status in ('ISSUED','ACKNOWLEDGED') then
    update site_instructions set status = 'DONE', completed_at = now(), completion_note = nullif(trim(note), ''),
      acknowledged_by = coalesce(acknowledged_by, auth.uid()), acknowledged_at = coalesce(acknowledged_at, now())
     where id = s.id;
    perform public.log_timeline(s.organization_id, s.project_id, s.unit_id, 'SI_DONE', 'site_instruction', s.id, s.si_no, '{}'::jsonb);
  else
    raise exception 'Invalid instruction state';
  end if;
end $$;

-- ---------------------------------------------------------------- RPCs: site report

create or replace function public.submit_site_report(target_project uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pr projects;
  partner uuid := null;
  id uuid;
begin
  select * into pr from projects where projects.id = target_project;
  if not found then raise exception 'Not authorized'; end if;
  if not public.can_report_progress(pr.id) then
    select a.partner_id into partner from partner_assignments a
     where a.project_id = pr.id and a.status = 'ACTIVE' and a.partner_id in (select public.my_partner_ids()) limit 1;
    if partner is null then raise exception 'Not authorized'; end if;
  end if;
  if coalesce(trim(data->>'work_summary'), '') = '' then raise exception 'Invalid report'; end if;
  if coalesce(nullif(data->>'report_date', '')::date, current_date) > current_date then raise exception 'Invalid date'; end if;
  insert into site_reports (organization_id, project_id, partner_id, report_date, weather, manpower, work_summary, issues, created_by)
  values (pr.organization_id, pr.id, partner, coalesce(nullif(data->>'report_date', '')::date, current_date),
    nullif(upper(data->>'weather'), ''), coalesce(nullif(data->>'manpower', '')::int, 0), trim(data->>'work_summary'),
    nullif(trim(data->>'issues'), ''), auth.uid())
  returning site_reports.id into id;
  return id;
end $$;

create or replace function public.verify_site_report(target_report uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s site_reports;
begin
  select * into s from site_reports where id = target_report for update;
  if not found or not public.can_schedule(s.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if s.verified_at is not null then raise exception 'Already verified'; end if;
  if s.created_by = auth.uid() and not public.can_manage_access(s.organization_id) then
    raise exception 'Reporter cannot verify their own report';
  end if;
  update site_reports set verified_by = auth.uid(), verified_at = now() where id = s.id;
end $$;

-- ---------------------------------------------------------------- RPCs: inspection & defect

create or replace function public.record_inspection(target_project uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pr projects;
  un uuid := nullif(data->>'unit_id', '')::uuid;
  id uuid;
  doc_no text;
begin
  select * into pr from projects where projects.id = target_project;
  if not found or not public.can_schedule(pr.id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if coalesce(trim(data->>'title'), '') = '' or upper(coalesce(data->>'result', '')) not in ('PASS','CONDITIONAL','FAIL') then
    raise exception 'Invalid inspection';
  end if;
  doc_no := public.next_document_no(pr.organization_id, 'INS');
  insert into inspections (organization_id, project_id, unit_id, activity_id, inspection_no, title, inspected_on, result, notes, inspector_id)
  values (pr.organization_id, pr.id, un, nullif(data->>'activity_id', '')::uuid, doc_no, trim(data->>'title'),
    coalesce(nullif(data->>'inspected_on', '')::date, current_date), upper(data->>'result'), nullif(trim(data->>'notes'), ''), auth.uid())
  returning inspections.id into id;
  perform public.log_timeline(pr.organization_id, pr.id, un, 'INSPECTION_' || upper(data->>'result'), 'inspection', id,
    doc_no || ' ' || trim(data->>'title'), '{}'::jsonb);
  return id;
end $$;

create or replace function public.open_defect(target_project uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pr projects;
  un uuid := nullif(data->>'unit_id', '')::uuid;
  partner uuid := nullif(data->>'assigned_partner_id', '')::uuid;
  id uuid;
  doc_no text;
begin
  select * into pr from projects where projects.id = target_project;
  if not found or not public.can_schedule(pr.id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if coalesce(trim(data->>'title'), '') = '' then raise exception 'Invalid defect'; end if;
  if partner is not null and not exists(select 1 from partner_assignments a where a.partner_id = partner and a.project_id = pr.id
       and a.status = 'ACTIVE' and (a.unit_id is null or un is null or a.unit_id = un)) then
    raise exception 'Partner is not assigned to this work';
  end if;
  doc_no := public.next_document_no(pr.organization_id, 'DF');
  insert into defects (organization_id, project_id, unit_id, inspection_id, defect_no, title, description, location, severity,
    assigned_partner_id, due_date, created_by)
  values (pr.organization_id, pr.id, un, nullif(data->>'inspection_id', '')::uuid, doc_no, trim(data->>'title'),
    nullif(trim(data->>'description'), ''), nullif(trim(data->>'location'), ''),
    upper(coalesce(nullif(data->>'severity', ''), 'MEDIUM')), partner, nullif(data->>'due_date', '')::date, auth.uid())
  returning defects.id into id;
  perform public.log_timeline(pr.organization_id, pr.id, un, 'DEFECT_OPENED', 'defect', id, doc_no || ' ' || trim(data->>'title'), '{}'::jsonb);
  return id;
end $$;

-- Partner (or site staff) marks fixed; a verifier (APPROVE, not the fixer) verifies or reopens.
create or replace function public.update_defect(target_defect uuid, action text, note text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare d defects;
begin
  select * into d from defects where id = target_defect for update;
  if not found then raise exception 'Not authorized'; end if;
  if action = 'FIX' then
    if not (coalesce(d.assigned_partner_id in (select public.my_partner_ids()), false) or public.can_report_progress(d.project_id)) then
      raise exception 'Not authorized';
    end if;
    if d.status <> 'OPEN' then raise exception 'Defect is not open'; end if;
    update defects set status = 'FIXED', fix_note = nullif(trim(note), ''), fixed_by = auth.uid(), fixed_at = now() where id = d.id;
  elsif action in ('VERIFY','REOPEN') then
    if not public.can_schedule(d.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
    if d.status <> 'FIXED' then raise exception 'Defect is not fixed'; end if;
    if d.fixed_by = auth.uid() and not public.can_manage_access(d.organization_id) then
      raise exception 'Fixer cannot verify their own fix';
    end if;
    if action = 'VERIFY' then
      update defects set status = 'VERIFIED', verified_by = auth.uid(), verified_at = now() where id = d.id;
      perform public.log_timeline(d.organization_id, d.project_id, d.unit_id, 'DEFECT_VERIFIED', 'defect', d.id, d.defect_no, '{}'::jsonb);
    else
      if coalesce(trim(note), '') = '' then raise exception 'Reason required'; end if;
      update defects set status = 'OPEN', reopen_count = reopen_count + 1,
        fix_note = coalesce(fix_note, '') || E'\n[reopened] ' || trim(note) where id = d.id;
    end if;
  else
    raise exception 'Invalid action';
  end if;
end $$;

-- ---------------------------------------------------------------- grants

do $$
declare f text;
begin
  foreach f in array array[
    'my_partner_ids()', 'partner_assigned(uuid, uuid)', 'partner_can_see_activity(uuid)', 'partner_can_see_drawing(uuid)',
    'upsert_partner(uuid, uuid, jsonb)', 'add_partner_contact(uuid, jsonb)',
    'assign_partner(uuid, uuid, uuid, text, date, date)', 'end_partner_assignment(uuid)', 'assign_activities(uuid[], uuid)',
    'raise_rfi(uuid, jsonb)', 'respond_rfi(uuid, text, boolean)', 'close_rfi(uuid)',
    'issue_site_instruction(uuid, jsonb)', 'update_site_instruction(uuid, text, text)',
    'submit_site_report(uuid, jsonb)', 'verify_site_report(uuid)',
    'record_inspection(uuid, jsonb)', 'open_defect(uuid, jsonb)', 'update_defect(uuid, text, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Labels for the contractor portal: projects and units inside my active assignments (the partner
-- cannot read projects/units directly).
create or replace function public.contractor_scope()
returns table(project_id uuid, project_code text, project_name text, unit_id uuid, unit_code text)
language sql stable security definer set search_path = public as $$
  select distinct p.id, p.code, p.name, u.id, u.code
    from partner_assignments a
    join projects p on p.id = a.project_id
    join units u on u.project_id = p.id and (a.unit_id is null or u.id = a.unit_id)
   where a.status = 'ACTIVE' and a.partner_id in (select public.my_partner_ids())
   order by p.code, u.code;
$$;
revoke all on function public.contractor_scope() from public, anon;
grant execute on function public.contractor_scope() to authenticated;
