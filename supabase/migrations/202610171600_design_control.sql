-- Design control and customer approval (MVP-ROADMAP Release 3).
-- Master Design -> Plot Design -> Revision -> Review -> Approval -> Release.
-- Customer: Published design -> Review -> Approve / Request change.
--
-- drawings are logical identities; drawing_revisions are immutable once created (file, code and
-- author never change) and move DRAFT -> IN_REVIEW -> APPROVED -> RELEASED -> SUPERSEDED. A drawing
-- has at most one RELEASED revision, so "current released" is unambiguous, and a new change is
-- always a new revision. Reviewers must differ from the author (the organization owner excepted).
-- Customers see only RELEASED revisions of drawings marked customer-visible for their own unit,
-- and published material selections. customer_approvals are append-only and reference the exact
-- revision or selection version. Files live in the private design-files bucket; tables keep paths.

-- ---------------------------------------------------------------- permissions

create or replace function public.can_design(target_project uuid, target_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from projects p where p.id = target_project
    and (public.can_manage_access(p.organization_id)
      or public.has_effective_permission(p.organization_id, p.id, 'PROJECTS', target_action)
      or public.has_effective_permission(p.organization_id, p.id, 'CONSTRUCTION', 'APPROVE')));
$$;

-- ---------------------------------------------------------------- tables

create table if not exists public.design_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  scope text not null check (scope in ('MASTER','UNIT')),
  house_type_id uuid references public.house_types(id),
  unit_id uuid references public.units(id) on delete cascade,
  parent_package_id uuid references public.design_packages(id),
  code text not null,
  name text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (project_id, code),
  check ((scope = 'MASTER' and unit_id is null) or (scope = 'UNIT' and unit_id is not null))
);
create unique index if not exists design_packages_one_per_unit on public.design_packages(unit_id) where scope = 'UNIT';

create table if not exists public.drawings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  package_id uuid not null references public.design_packages(id) on delete cascade,
  discipline text not null check (discipline in ('ARCHITECTURE','INTERIOR','STRUCTURE','MEP','LANDSCAPE','POOL','FURNITURE')),
  drawing_no text not null,
  title text not null,
  customer_visible boolean not null default false,
  current_revision_id uuid,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (package_id, drawing_no)
);

create table if not exists public.drawing_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  drawing_id uuid not null references public.drawings(id) on delete cascade,
  seq int not null,
  revision_code text not null,
  status text not null default 'DRAFT'
    check (status in ('DRAFT','IN_REVIEW','APPROVED','REJECTED','RELEASED','SUPERSEDED')),
  file_path text not null,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  released_by uuid references public.profiles(id),
  released_at timestamptz,
  superseded_by uuid references public.drawing_revisions(id),
  unique (drawing_id, seq)
);
create unique index if not exists drawing_revisions_one_released on public.drawing_revisions(drawing_id) where status = 'RELEASED';
create unique index if not exists drawing_revisions_one_open on public.drawing_revisions(drawing_id)
  where status in ('DRAFT','IN_REVIEW','APPROVED');
alter table public.drawings add constraint drawings_current_revision_fk
  foreign key (current_revision_id) references public.drawing_revisions(id);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  category text not null check (category in ('FLOOR','WALL','CEILING','SANITARY','KITCHEN','DOOR_WINDOW','LIGHTING','ROOF','EXTERIOR','OTHER')),
  name_th text not null,
  name_en text,
  brand text,
  spec text,
  price_delta numeric(18,2) not null default 0,
  image_path text,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.material_selections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  area text not null,
  material_id uuid not null references public.materials(id),
  version int not null,
  status text not null default 'DRAFT'
    check (status in ('DRAFT','PUBLISHED','APPROVED','CHANGE_REQUESTED','SUPERSEDED')),
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  decided_at timestamptz,
  unique (unit_id, area, version)
);
create unique index if not exists material_selections_one_current on public.material_selections(unit_id, area)
  where status <> 'SUPERSEDED';

create table if not exists public.customer_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  entity_type text not null check (entity_type in ('DRAWING_REVISION','MATERIAL_SELECTION')),
  entity_id uuid not null,
  entity_label text not null,
  decision text not null check (decision in ('APPROVED','CHANGE_REQUESTED')),
  comment text,
  decided_by uuid references public.profiles(id),
  decided_at timestamptz not null default now()
);
create index if not exists customer_approvals_unit_idx on public.customer_approvals(unit_id, decided_at desc);

-- ---------------------------------------------------------------- immutability

-- A revision's identity (drawing, code, file, author) never changes; released ones only supersede.
create or replace function public.guard_drawing_revision()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Drawing revisions cannot be deleted'; end if;
  if new.drawing_id <> old.drawing_id or new.seq <> old.seq or new.revision_code <> old.revision_code
     or new.file_path <> old.file_path or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at then
    raise exception 'Drawing revisions are immutable';
  end if;
  if old.status in ('RELEASED') and new.status not in ('RELEASED','SUPERSEDED') then
    raise exception 'Released revision cannot be changed';
  end if;
  if old.status in ('SUPERSEDED','REJECTED') then raise exception 'Closed revision cannot be changed'; end if;
  return new;
end $$;
create or replace trigger drawing_revisions_guard before update or delete on public.drawing_revisions
  for each row execute function public.guard_drawing_revision();

create or replace function public.reject_customer_approval_change()
returns trigger language plpgsql as $$
begin
  raise exception 'Customer approvals are immutable';
end $$;
create or replace trigger customer_approvals_immutable before update or delete on public.customer_approvals
  for each row execute function public.reject_customer_approval_change();

-- ---------------------------------------------------------------- visibility

-- Customer-safe: released revision of a customer-visible drawing in the customer's unit package,
-- or in the master package of their unit's house type.
create or replace function public.customer_can_see_drawing(target_drawing uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from drawings d join design_packages p on p.id = d.package_id
     where d.id = target_drawing and d.customer_visible
       and (
         (p.scope = 'UNIT' and public.is_unit_customer(p.unit_id))
         or (p.scope = 'MASTER' and exists(
           select 1 from units u where u.project_id = p.project_id and u.house_type_id = p.house_type_id
              and public.is_unit_customer(u.id)))));
$$;

alter table public.design_packages enable row level security;
alter table public.drawings enable row level security;
alter table public.drawing_revisions enable row level security;
alter table public.materials enable row level security;
alter table public.material_selections enable row level security;
alter table public.customer_approvals enable row level security;

create policy design_packages_select on public.design_packages for select to authenticated
  using (public.can_access_project(project_id)
    or (scope = 'UNIT' and public.is_unit_customer(unit_id))
    or (scope = 'MASTER' and exists(select 1 from units u where u.project_id = design_packages.project_id
         and u.house_type_id = design_packages.house_type_id and public.is_unit_customer(u.id))));
create policy drawings_select on public.drawings for select to authenticated
  using (public.can_access_project(project_id) or public.customer_can_see_drawing(id));
create policy drawing_revisions_select on public.drawing_revisions for select to authenticated
  using (public.can_access_project(project_id)
    or (status = 'RELEASED' and public.customer_can_see_drawing(drawing_id)));
create policy materials_select on public.materials for select to authenticated
  using (public.is_internal_member(organization_id)
    or exists(select 1 from material_selections s where s.material_id = materials.id
      and s.status in ('PUBLISHED','APPROVED','CHANGE_REQUESTED') and public.is_unit_customer(s.unit_id)));
create policy material_selections_select on public.material_selections for select to authenticated
  using (public.can_access_project(project_id)
    or (status in ('PUBLISHED','APPROVED','CHANGE_REQUESTED') and public.is_unit_customer(unit_id)));
create policy customer_approvals_select on public.customer_approvals for select to authenticated
  using (public.can_access_project(project_id) or public.is_unit_customer(unit_id));

grant select on public.design_packages, public.drawings, public.drawing_revisions, public.materials,
  public.material_selections, public.customer_approvals to authenticated;

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('design-files', 'design-files', false, 52428800,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Drawings: <org>/<project>/<package>/<drawing>/<file>; material images: <org>/materials/<material>/<file>.
create or replace function public.can_upload_design_file(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
      select 1 from drawings d
       where d.id = public.try_uuid((storage.foldername(object_name))[4])
         and d.package_id = public.try_uuid((storage.foldername(object_name))[3])
         and d.project_id = public.try_uuid((storage.foldername(object_name))[2])
         and d.organization_id = public.try_uuid((storage.foldername(object_name))[1])
         and public.can_design(d.project_id, 'EDIT'))
    or exists(
      select 1 from materials m
       where (storage.foldername(object_name))[2] = 'materials'
         and m.id = public.try_uuid((storage.foldername(object_name))[3])
         and m.organization_id = public.try_uuid((storage.foldername(object_name))[1])
         and (public.can_manage_access(m.organization_id)
           or exists(select 1 from projects p where p.organization_id = m.organization_id and public.can_design(p.id, 'EDIT'))));
$$;

create or replace function public.can_read_design_file(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
      select 1 from drawing_revisions r
       where r.file_path = object_name
         and (public.can_access_project(r.project_id)
           or (r.status = 'RELEASED' and public.customer_can_see_drawing(r.drawing_id))))
    or exists(
      select 1 from materials m
       where m.image_path = object_name
         and (public.is_internal_member(m.organization_id)
           or exists(select 1 from material_selections s where s.material_id = m.id
             and s.status in ('PUBLISHED','APPROVED','CHANGE_REQUESTED') and public.is_unit_customer(s.unit_id))));
$$;

create policy design_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'design-files' and public.can_upload_design_file(name));
create policy design_files_read on storage.objects for select to authenticated
  using (bucket_id = 'design-files' and public.can_read_design_file(name));

-- ---------------------------------------------------------------- RPCs: packages & drawings

create or replace function public.create_design_package(target_project uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p projects;
  sc text := upper(coalesce(data->>'scope', ''));
  ht uuid := nullif(data->>'house_type_id', '')::uuid;
  un uuid := nullif(data->>'unit_id', '')::uuid;
  parent uuid;
  id uuid;
begin
  select * into p from projects where projects.id = target_project;
  if not found or not public.can_design(p.id, 'EDIT') then raise exception 'Not authorized'; end if;
  if sc not in ('MASTER','UNIT') or coalesce(trim(data->>'code'), '') = '' or coalesce(trim(data->>'name'), '') = '' then
    raise exception 'Invalid package';
  end if;
  if sc = 'UNIT' then
    select u.house_type_id into ht from units u where u.id = un and u.project_id = p.id;
    if not found then raise exception 'Invalid unit'; end if;
    select dp.id into parent from design_packages dp
     where dp.project_id = p.id and dp.scope = 'MASTER' and dp.house_type_id is not distinct from ht limit 1;
  else
    un := null;
  end if;
  insert into design_packages (organization_id, project_id, scope, house_type_id, unit_id, parent_package_id, code, name, created_by)
  values (p.organization_id, p.id, sc, ht, un, parent, upper(trim(data->>'code')), trim(data->>'name'), auth.uid())
  returning design_packages.id into id;
  return id;
end $$;

create or replace function public.create_drawing(target_package uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pk design_packages;
  id uuid;
begin
  select * into pk from design_packages where design_packages.id = target_package;
  if not found or not public.can_design(pk.project_id, 'EDIT') then raise exception 'Not authorized'; end if;
  if coalesce(trim(data->>'drawing_no'), '') = '' or coalesce(trim(data->>'title'), '') = '' then
    raise exception 'Invalid drawing';
  end if;
  insert into drawings (organization_id, project_id, package_id, discipline, drawing_no, title, customer_visible, created_by)
  values (pk.organization_id, pk.project_id, pk.id, upper(data->>'discipline'), upper(trim(data->>'drawing_no')),
    trim(data->>'title'), coalesce((data->>'customer_visible')::boolean, false), auth.uid())
  returning drawings.id into id;
  return id;
end $$;

create or replace function public.set_drawing_customer_visible(target_drawing uuid, visible boolean)
returns void language plpgsql security definer set search_path = public as $$
declare d drawings;
begin
  select * into d from drawings where id = target_drawing;
  if not found or not public.can_design(d.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  update drawings set customer_visible = coalesce(visible, false) where id = d.id;
end $$;

-- ---------------------------------------------------------------- RPCs: revision workflow

create or replace function public.design_unit(target_drawing uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select p.unit_id from drawings d join design_packages p on p.id = d.package_id where d.id = target_drawing;
$$;
revoke all on function public.design_unit(uuid) from public, anon, authenticated;

-- New revision from an uploaded file. Codes run A, B, ... Z, AA, AB ...
create or replace function public.add_drawing_revision(target_drawing uuid, file_path text, note text)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  d drawings;
  n int;
  code text;
  prefix text;
  id uuid;
begin
  select * into d from drawings where drawings.id = target_drawing for update;
  if not found or not public.can_design(d.project_id, 'EDIT') then raise exception 'Not authorized'; end if;
  prefix := d.organization_id || '/' || d.project_id || '/' || d.package_id || '/' || d.id || '/';
  if file_path is null or left(file_path, length(prefix)) <> prefix
     or not exists(select 1 from storage.objects o where o.bucket_id = 'design-files' and o.name = file_path) then
    raise exception 'Design file not uploaded';
  end if;
  if exists(select 1 from drawing_revisions r where r.drawing_id = d.id and r.status in ('DRAFT','IN_REVIEW','APPROVED')) then
    raise exception 'Drawing has an open revision';
  end if;
  select coalesce(max(seq), 0) + 1 into n from drawing_revisions r where r.drawing_id = d.id;
  code := case when n <= 26 then chr(64 + n) else chr(64 + (n - 1) / 26) || chr(65 + (n - 1) % 26) end;
  insert into drawing_revisions (organization_id, project_id, drawing_id, seq, revision_code, file_path, note, created_by)
  values (d.organization_id, d.project_id, d.id, n, code, file_path, nullif(trim(note), ''), auth.uid())
  returning drawing_revisions.id into id;
  perform public.log_timeline(d.organization_id, d.project_id, public.design_unit(d.id), 'DRAWING_REVISED', 'drawing', d.id,
    d.drawing_no || ' rev ' || code, '{}'::jsonb);
  return id;
end $$;

create or replace function public.submit_drawing_revision(target_revision uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r drawing_revisions;
begin
  select * into r from drawing_revisions where id = target_revision for update;
  if not found or not public.can_design(r.project_id, 'EDIT') then raise exception 'Not authorized'; end if;
  if r.status <> 'DRAFT' then raise exception 'Revision is not a draft'; end if;
  update drawing_revisions set status = 'IN_REVIEW', submitted_at = now() where id = r.id;
end $$;

-- Review by someone other than the author (the organization owner may review their own).
create or replace function public.review_drawing_revision(target_revision uuid, approve boolean, note text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare r drawing_revisions;
begin
  select * into r from drawing_revisions where id = target_revision for update;
  if not found or not public.can_design(r.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if r.status <> 'IN_REVIEW' then raise exception 'Revision is not in review'; end if;
  if r.created_by = auth.uid() and not public.can_manage_access(r.organization_id) then
    raise exception 'Author cannot review their own revision';
  end if;
  if not approve and coalesce(trim(note), '') = '' then raise exception 'Reason required'; end if;
  update drawing_revisions set status = case when approve then 'APPROVED' else 'REJECTED' end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(note), '')
   where id = r.id;
end $$;

-- Release: the approved revision becomes the one current released revision; the old one is superseded.
create or replace function public.release_drawing_revision(target_revision uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r drawing_revisions;
  d drawings;
begin
  select * into r from drawing_revisions where id = target_revision for update;
  if not found or not public.can_design(r.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if r.status <> 'APPROVED' then raise exception 'Revision is not approved'; end if;
  select * into d from drawings where id = r.drawing_id for update;
  update drawing_revisions set status = 'SUPERSEDED', superseded_by = r.id
   where drawing_id = r.drawing_id and status = 'RELEASED';
  update drawing_revisions set status = 'RELEASED', released_by = auth.uid(), released_at = now() where id = r.id;
  update drawings set current_revision_id = r.id where id = d.id;
  perform public.log_timeline(d.organization_id, d.project_id, public.design_unit(d.id), 'DRAWING_RELEASED', 'drawing', d.id,
    d.drawing_no || ' rev ' || r.revision_code, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------- RPCs: materials & selections

create or replace function public.upsert_material(target_org uuid, target_material uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare id uuid := target_material;
begin
  if not (public.can_manage_access(target_org)
          or exists(select 1 from projects p where p.organization_id = target_org and public.can_design(p.id, 'EDIT'))) then
    raise exception 'Not authorized';
  end if;
  if coalesce(trim(data->>'code'), '') = '' or coalesce(trim(data->>'name_th'), '') = '' then raise exception 'Invalid material'; end if;
  if id is null then
    insert into materials (organization_id, code, category, name_th, name_en, brand, spec, price_delta, created_by)
    values (target_org, upper(trim(data->>'code')), upper(data->>'category'), trim(data->>'name_th'),
      nullif(trim(data->>'name_en'), ''), nullif(trim(data->>'brand'), ''), nullif(trim(data->>'spec'), ''),
      coalesce(nullif(data->>'price_delta', '')::numeric, 0), auth.uid())
    returning materials.id into id;
  else
    update materials set category = upper(data->>'category'), name_th = trim(data->>'name_th'),
      name_en = nullif(trim(data->>'name_en'), ''), brand = nullif(trim(data->>'brand'), ''),
      spec = nullif(trim(data->>'spec'), ''), price_delta = coalesce(nullif(data->>'price_delta', '')::numeric, 0),
      active = coalesce((data->>'active')::boolean, active), updated_at = now()
     where materials.id = id and organization_id = target_org;
    if not found then raise exception 'Not authorized'; end if;
  end if;
  return id;
end $$;

create or replace function public.set_material_image(target_material uuid, image_path text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare m materials;
begin
  select * into m from materials where id = target_material;
  if not found or not public.can_upload_design_file(image_path)
     or left(image_path, length(m.organization_id || '/materials/' || m.id || '/')) <> m.organization_id || '/materials/' || m.id || '/'
     or not exists(select 1 from storage.objects o where o.bucket_id = 'design-files' and o.name = image_path) then
    raise exception 'Not authorized';
  end if;
  update materials set image_path = image_path, updated_at = now() where id = m.id;
end $$;

-- Each proposal is a new version for (unit, area); whatever was current is superseded.
create or replace function public.propose_material_selection(target_unit uuid, area text, target_material uuid, note text)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  u units;
  org uuid;
  v int;
  id uuid;
begin
  select * into u from units where units.id = target_unit;
  if not found or not public.can_design(u.project_id, 'EDIT') then raise exception 'Not authorized'; end if;
  select organization_id into org from projects where projects.id = u.project_id;
  if coalesce(trim(area), '') = '' then raise exception 'Invalid area'; end if;
  if not exists(select 1 from materials m where m.id = target_material and m.organization_id = org and m.active) then
    raise exception 'Invalid material';
  end if;
  update material_selections set status = 'SUPERSEDED'
   where unit_id = u.id and material_selections.area = trim(area) and status <> 'SUPERSEDED';
  select coalesce(max(version), 0) + 1 into v from material_selections s where s.unit_id = u.id and s.area = trim(area);
  insert into material_selections (organization_id, project_id, unit_id, area, material_id, version, note, created_by)
  values (org, u.project_id, u.id, trim(area), target_material, v, nullif(trim(note), ''), auth.uid())
  returning material_selections.id into id;
  return id;
end $$;

create or replace function public.publish_material_selection(target_selection uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s material_selections;
begin
  select * into s from material_selections where id = target_selection for update;
  if not found or not public.can_design(s.project_id, 'EDIT') then raise exception 'Not authorized'; end if;
  if s.status <> 'DRAFT' then raise exception 'Selection is not a draft'; end if;
  update material_selections set status = 'PUBLISHED', published_at = now() where id = s.id;
  perform public.log_timeline(s.organization_id, s.project_id, s.unit_id, 'SELECTION_PUBLISHED', 'material_selection', s.id,
    s.area || ' v' || s.version, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------- RPC: customer decision

create or replace function public.customer_decide(entity_type text, entity_id uuid, decision text, comment text)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  r drawing_revisions;
  d drawings;
  s material_selections;
  m materials;
  unit uuid;
  lbl text;
  id uuid;
begin
  if decision not in ('APPROVED','CHANGE_REQUESTED') then raise exception 'Invalid decision'; end if;
  if decision = 'CHANGE_REQUESTED' and coalesce(trim(comment), '') = '' then raise exception 'Comment required'; end if;
  if entity_type = 'DRAWING_REVISION' then
    select * into r from drawing_revisions where drawing_revisions.id = entity_id;
    if not found or r.status <> 'RELEASED' or not public.customer_can_see_drawing(r.drawing_id) then raise exception 'Not authorized'; end if;
    select * into d from drawings where drawings.id = r.drawing_id;
    -- The approving unit: the customer's unit in this project the drawing applies to.
    select u.id into unit from units u join design_packages p on p.id = d.package_id
     where u.project_id = d.project_id and public.is_unit_customer(u.id)
       and ((p.scope = 'UNIT' and p.unit_id = u.id) or (p.scope = 'MASTER' and u.house_type_id = p.house_type_id))
     limit 1;
    lbl := d.drawing_no || ' rev ' || r.revision_code;
    insert into customer_approvals (organization_id, project_id, unit_id, entity_type, entity_id, entity_label, decision, comment, decided_by)
    values (r.organization_id, r.project_id, unit, entity_type, r.id, lbl, decision, nullif(trim(comment), ''), auth.uid())
    returning customer_approvals.id into id;
  elsif entity_type = 'MATERIAL_SELECTION' then
    select * into s from material_selections where material_selections.id = entity_id for update;
    if not found or s.status <> 'PUBLISHED' or not public.is_unit_customer(s.unit_id) then raise exception 'Not authorized'; end if;
    select * into m from materials where materials.id = s.material_id;
    lbl := s.area || ' v' || s.version || ' · ' || m.code;
    update material_selections set status = decision, decided_at = now() where material_selections.id = s.id;
    insert into customer_approvals (organization_id, project_id, unit_id, entity_type, entity_id, entity_label, decision, comment, decided_by)
    values (s.organization_id, s.project_id, s.unit_id, entity_type, s.id, lbl, decision, nullif(trim(comment), ''), auth.uid())
    returning customer_approvals.id into id;
    unit := s.unit_id;
  else
    raise exception 'Invalid entity';
  end if;
  perform public.log_timeline((select organization_id from customer_approvals where customer_approvals.id = id),
    (select project_id from customer_approvals where customer_approvals.id = id), unit,
    'CUSTOMER_' || decision, 'customer_approval', id, lbl, '{}'::jsonb);
  return id;
end $$;

-- ---------------------------------------------------------------- grants

do $$
declare f text;
begin
  foreach f in array array[
    'can_design(uuid, text)', 'customer_can_see_drawing(uuid)', 'can_upload_design_file(text)', 'can_read_design_file(text)',
    'create_design_package(uuid, jsonb)', 'create_drawing(uuid, jsonb)', 'set_drawing_customer_visible(uuid, boolean)',
    'add_drawing_revision(uuid, text, text)', 'submit_drawing_revision(uuid)', 'review_drawing_revision(uuid, boolean, text)',
    'release_drawing_revision(uuid)', 'upsert_material(uuid, uuid, jsonb)', 'set_material_image(uuid, text)',
    'propose_material_selection(uuid, text, uuid, text)', 'publish_material_selection(uuid)',
    'customer_decide(text, uuid, text, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
