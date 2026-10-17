-- Release 10 (cont.): AI Design Studio.
-- Renders made with an image model (OpenAI GPT Image or Google Gemini) from a reference image
-- (floor plan, 3D screenshot, site photo) or from a text brief. Images live in the private
-- design-renders bucket; the table keeps paths only. Path: <org>/<project>/<render id>/<file>.
-- Renders are internal until staff share one with the unit's buyer.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('design-renders', 'design-renders', false, 20971520,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create table if not exists public.design_renders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  scene text not null check (scene in ('EXTERIOR','INTERIOR','LANDSCAPE','FLOOR_PLAN_3D','FURNITURE')),
  style text not null,
  purpose text not null default 'INTERNAL' check (purpose in ('INTERNAL','CUSTOMER','MARKETING')),
  provider text not null check (provider in ('OPENAI','GEMINI')),
  model text not null,
  prompt text not null,
  brief text,
  source_path text,
  output_path text not null unique,
  parent_render_id uuid references public.design_renders(id) on delete set null,
  customer_visible boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id)
);
create index if not exists design_renders_project_idx on public.design_renders(project_id, created_at desc);
alter table public.design_renders enable row level security;

create policy design_renders_select on public.design_renders for select to authenticated
  using (public.can_access_project(project_id)
      or (customer_visible and archived_at is null and unit_id is not null and public.is_unit_customer(unit_id)));

-- Uploads (reference image and generated output) by people who may edit design.
create or replace function public.can_upload_render(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from projects p
    where p.id = public.try_uuid((storage.foldername(object_name))[2])
      and p.organization_id = public.try_uuid((storage.foldername(object_name))[1])
      and public.can_design(p.id, 'EDIT'));
$$;

create or replace function public.can_read_render(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_access_project(public.try_uuid((storage.foldername(object_name))[2]))
      or exists(select 1 from design_renders r
                 where r.output_path = object_name and r.customer_visible and r.archived_at is null
                   and r.unit_id is not null and public.is_unit_customer(r.unit_id));
$$;

create policy design_renders_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'design-renders' and public.can_upload_render(name));
create policy design_renders_read on storage.objects for select to authenticated
  using (bucket_id = 'design-renders' and public.can_read_render(name));

create or replace function public.save_design_render(target_project uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p projects;
  new_id uuid := coalesce(public.try_uuid(data->>'id'), gen_random_uuid());
  out_path text := data->>'output_path';
  unit uuid := public.try_uuid(nullif(data->>'unit_id', ''));
begin
  select * into p from projects where id = target_project;
  if not found or not public.can_design(p.id, 'EDIT') then raise exception 'Not authorized'; end if;
  if out_path is null or (storage.foldername(out_path))[2] <> p.id::text
     or not exists(select 1 from storage.objects o where o.bucket_id = 'design-renders' and o.name = out_path) then
    raise exception 'Render file required';
  end if;
  if unit is not null and not exists(select 1 from units where id = unit and project_id = p.id) then
    raise exception 'Invalid unit';
  end if;
  insert into design_renders (id, organization_id, project_id, unit_id, scene, style, purpose, provider, model,
                              prompt, brief, source_path, output_path, parent_render_id, created_by)
  values (new_id, p.organization_id, p.id, unit, data->>'scene', coalesce(data->>'style', 'CUSTOM'),
          coalesce(data->>'purpose', 'INTERNAL'), data->>'provider', coalesce(data->>'model', 'unknown'),
          left(coalesce(data->>'prompt', ''), 8000), left(data->>'brief', 2000), nullif(data->>'source_path', ''),
          out_path, public.try_uuid(nullif(data->>'parent_render_id', '')), auth.uid());
  return new_id;
end $$;

-- Sharing with the buyer needs the render tied to a unit.
create or replace function public.set_render_visibility(target_render uuid, visible boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r design_renders;
begin
  select * into r from design_renders where id = target_render;
  if not found or not public.can_design(r.project_id, 'EDIT') then raise exception 'Not authorized'; end if;
  if visible and r.unit_id is null then raise exception 'Render has no unit'; end if;
  if r.archived_at is not null then raise exception 'Render archived'; end if;
  update design_renders set customer_visible = visible where id = r.id;
end $$;

create or replace function public.archive_render(target_render uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r design_renders;
begin
  select * into r from design_renders where id = target_render;
  if not found or not public.can_design(r.project_id, 'EDIT') then raise exception 'Not authorized'; end if;
  update design_renders set archived_at = now(), archived_by = auth.uid(), customer_visible = false
   where id = r.id and archived_at is null;
end $$;

do $$
declare f text;
begin
  foreach f in array array['can_upload_render(text)', 'can_read_render(text)',
    'save_design_render(uuid, jsonb)', 'set_render_visibility(uuid, boolean)', 'archive_render(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
