-- Photos for the spec list: standard items, upgrade options and unit lines can each have several.
-- Files go to the private design-files bucket under <org>/<project>/spec/<file>; spec_photos keeps
-- the paths. Staff of the project can see them; anyone who can edit the project design can add or
-- remove them. Upload and read are granted by their own storage policies, so the existing
-- design-file rules are left as they are.

create table if not exists public.spec_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  item_id uuid references public.spec_items(id) on delete cascade,
  option_id uuid references public.spec_options(id) on delete cascade,
  line_id uuid references public.unit_spec_items(id) on delete cascade,
  path text not null,
  thumb_path text,
  caption text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (num_nonnulls(item_id, option_id, line_id) = 1)
);
create index if not exists spec_photos_item_idx on public.spec_photos(item_id);
create index if not exists spec_photos_option_idx on public.spec_photos(option_id);
create index if not exists spec_photos_line_idx on public.spec_photos(line_id);
create index if not exists spec_photos_project_idx on public.spec_photos(project_id);
create index if not exists spec_photos_org_idx on public.spec_photos(organization_id);
create index if not exists spec_photos_created_by_idx on public.spec_photos(created_by);

alter table public.spec_photos enable row level security;
drop policy if exists spec_photos_select on public.spec_photos;
create policy spec_photos_select on public.spec_photos for select to authenticated
  using (public.can_access_project(project_id));
grant select on public.spec_photos to authenticated;

-- ---------------------------------------------------------------- storage

-- <org>/<project>/spec/<file>: the project of the path, when the org matches.
create or replace function public.spec_photo_project(object_name text)
returns uuid language sql stable security definer set search_path = public as $$
  select p.id from projects p
   where (storage.foldername(object_name))[3] = 'spec'
     and p.id = public.try_uuid((storage.foldername(object_name))[2])
     and p.organization_id = public.try_uuid((storage.foldername(object_name))[1]);
$$;

drop policy if exists spec_photos_upload on storage.objects;
create policy spec_photos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'design-files' and public.spec_photo_project(name) is not null
    and public.can_design(public.spec_photo_project(name), 'EDIT'));
drop policy if exists spec_photos_read on storage.objects;
create policy spec_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'design-files' and public.spec_photo_project(name) is not null
    and public.can_access_project(public.spec_photo_project(name)));

-- ---------------------------------------------------------------- RPCs

-- target: {"item_id"} | {"option_id"} | {"line_id"}; photos: [{"path","thumb_path","caption"}].
create or replace function public.add_spec_photos(target_project uuid, target jsonb, photos jsonb)
returns int language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  pr projects;
  item uuid := nullif(target->>'item_id', '')::uuid;
  opt uuid := nullif(target->>'option_id', '')::uuid;
  line uuid := nullif(target->>'line_id', '')::uuid;
  prefix text;
  ph jsonb;
  n int := 0;
begin
  select * into pr from projects where projects.id = target_project;
  if not found or not public.can_design(pr.id, 'EDIT') then raise exception 'Not authorized'; end if;
  if num_nonnulls(item, opt, line) <> 1
     or (item is not null and not exists(select 1 from spec_items s where s.id = item and s.project_id = pr.id))
     or (opt is not null and not exists(select 1 from spec_options o where o.id = opt and o.project_id = pr.id))
     or (line is not null and not exists(select 1 from unit_spec_items l where l.id = line and l.project_id = pr.id))
     or photos is null or jsonb_typeof(photos) <> 'array' or jsonb_array_length(photos) not between 1 and 30 then
    raise exception 'Invalid spec';
  end if;
  prefix := pr.organization_id || '/' || pr.id || '/spec/';
  for ph in select * from jsonb_array_elements(photos) loop
    if left(coalesce(ph->>'path', ''), length(prefix)) <> prefix
       or (nullif(ph->>'thumb_path', '') is not null and left(ph->>'thumb_path', length(prefix)) <> prefix)
       or not exists(select 1 from storage.objects o where o.bucket_id = 'design-files' and o.name = ph->>'path') then
      raise exception 'Invalid spec';
    end if;
    insert into spec_photos (organization_id, project_id, item_id, option_id, line_id, path, thumb_path, caption, created_by)
    values (pr.organization_id, pr.id, item, opt, line, ph->>'path', nullif(ph->>'thumb_path', ''),
      nullif(trim(ph->>'caption'), ''), auth.uid());
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.remove_spec_photo(target_photo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ph spec_photos;
begin
  select * into ph from spec_photos where id = target_photo;
  if not found or not public.can_design(ph.project_id, 'EDIT') then raise exception 'Not authorized'; end if;
  delete from spec_photos where id = ph.id;
end $$;

do $$
declare f text;
begin
  foreach f in array array['spec_photo_project(text)', 'add_spec_photos(uuid, jsonb, jsonb)', 'remove_spec_photo(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
