-- Project marketing (การตลาดโครงการ): brand kit and files, the project's marketing plan, and
-- campaigns with their copy drafts.
--
-- marketing_assets are the project's marketing files (logo, CI, brochures, ad creatives, videos,
-- renders ...). Each asset keeps every uploaded version in marketing_asset_files and moves
-- DRAFT -> REVIEW -> APPROVED (or ARCHIVED). Files live in the private marketing-files bucket under
-- <org>/<project>/<file>; the file is uploaded first and then recorded with its asset.
-- marketing_plans holds one plan per project: audience, selling points, key message, brand colours
-- and tone, budget and goals.
-- marketing_campaigns are dated pushes (launch, open house ...) with objective, channels, budget and
-- goals; lead_tag is the text sales staff type in a lead's "campaign" field, so leads and bookings
-- can be counted per campaign. marketing_copies are the captions / ad texts drafted for a campaign,
-- by hand or by the AI.
--
-- Access: a new MARKETING permission module (VIEW / EDIT / APPROVE). The owner can do everything;
-- the MARKETING_SALES role gets all three; SALES, CRM and PROJECT_MANAGER can view and download.
-- Only APPROVE may mark a file or copy approved.

-- ---------------------------------------------------------------- permissions

insert into public.permission_catalog(module_code, action_code, name_th, name_en, sort_order) values
  ('MARKETING', 'VIEW', 'ดูงานการตลาด', 'View marketing', 75),
  ('MARKETING', 'EDIT', 'แก้ไขงานการตลาด', 'Edit marketing', 76),
  ('MARKETING', 'APPROVE', 'อนุมัติสื่อการตลาด', 'Approve marketing material', 77)
on conflict (module_code, action_code) do nothing;

insert into public.roles(organization_id, code, name_th, name_en, is_system)
select o.id, 'MARKETING_SALES', 'การตลาด / ฝ่ายขาย', 'Marketing / Sales', true
  from public.organizations o
 where not exists(select 1 from public.roles r where r.organization_id = o.id and r.code = 'MARKETING_SALES');

with matrix(role_code, module_code, action_code) as (values
  ('MARKETING_SALES', 'MARKETING', 'VIEW'), ('MARKETING_SALES', 'MARKETING', 'EDIT'),
  ('MARKETING_SALES', 'MARKETING', 'APPROVE'), ('MARKETING_SALES', 'SALES', 'VIEW'),
  ('MARKETING_SALES', 'PROJECTS', 'VIEW'),
  ('SALES', 'MARKETING', 'VIEW'), ('CRM', 'MARKETING', 'VIEW'), ('PROJECT_MANAGER', 'MARKETING', 'VIEW'),
  ('OWNER', 'MARKETING', 'VIEW'))
insert into public.role_permissions(role_id, module_code, action_code)
select r.id, m.module_code, m.action_code from matrix m join public.roles r on r.code = m.role_code
on conflict (role_id, module_code, action_code) do nothing;

create or replace function public.can_market(target_project uuid, target_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from projects p where p.id = target_project
    and (public.can_manage_access(p.organization_id)
      or public.has_effective_permission(p.organization_id, p.id, 'MARKETING', upper(target_action))));
$$;

-- Read access: marketing viewers and the sales team (who send brochures to buyers).
create or replace function public.can_view_marketing(target_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_market(target_project, 'VIEW') or public.can_market(target_project, 'EDIT')
      or public.can_sell(target_project, 'VIEW');
$$;

-- The row's organization must be its project's.
create or replace function public.project_in_org(target_project uuid, target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from projects p where p.id = target_project and p.organization_id = target_org);
$$;

-- ---------------------------------------------------------------- tables

create table if not exists public.marketing_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null check (category in ('LOGO','CI','BROCHURE','AD_CREATIVE','SOCIAL','VIDEO',
    'RENDER','PHOTO','FLOOR_PLAN','PRICE_LIST','PRESENTATION','SIGNAGE','OTHER')),
  title text not null check (length(trim(title)) > 0),
  description text,
  language text check (language in ('TH','EN','ZH','RU','DE','MULTI')),
  tags text[] not null default '{}',
  status text not null default 'DRAFT' check (status in ('DRAFT','REVIEW','APPROVED','ARCHIVED')),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_assets_project_idx on public.marketing_assets(project_id, category);
create index if not exists marketing_assets_org_idx on public.marketing_assets(organization_id);
create index if not exists marketing_assets_created_by_idx on public.marketing_assets(created_by);
create index if not exists marketing_assets_approved_by_idx on public.marketing_assets(approved_by);

create table if not exists public.marketing_asset_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  asset_id uuid not null references public.marketing_assets(id) on delete cascade,
  version_no int not null check (version_no > 0),
  path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (asset_id, version_no)
);
create index if not exists marketing_asset_files_project_idx on public.marketing_asset_files(project_id);
create index if not exists marketing_asset_files_org_idx on public.marketing_asset_files(organization_id);
create index if not exists marketing_asset_files_created_by_idx on public.marketing_asset_files(created_by);

create table if not exists public.marketing_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null unique references public.projects(id) on delete cascade,
  tagline text,
  location_text text,
  website_url text,
  target_audience text,
  personas text,
  usp text,
  key_message text,
  positioning text,
  competitors text,
  brand_tone text,
  brand_fonts text,
  -- [{"name": "Primary", "hex": "#1F3A5F"}, ...]
  brand_colors jsonb not null default '[]' check (jsonb_typeof(brand_colors) = 'array'),
  budget_total numeric(18,2) check (budget_total >= 0),
  goal_leads int check (goal_leads >= 0),
  goal_bookings int check (goal_bookings >= 0),
  goal_sales_value numeric(18,2) check (goal_sales_value >= 0),
  start_date date,
  end_date date,
  notes text,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index if not exists marketing_plans_org_idx on public.marketing_plans(organization_id);
create index if not exists marketing_plans_updated_by_idx on public.marketing_plans(updated_by);

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null check (length(trim(code)) > 0),
  name text not null check (length(trim(name)) > 0),
  objective text not null default 'LEADS'
    check (objective in ('AWARENESS','LEADS','BOOKINGS','EVENT','RETARGETING','BRAND')),
  status text not null default 'DRAFT'
    check (status in ('DRAFT','PLANNED','ACTIVE','PAUSED','DONE','CANCELLED')),
  start_date date,
  end_date date,
  budget numeric(18,2) check (budget >= 0),
  audience text,
  key_message text,
  offer text,
  channels text[] not null default '{}',
  languages text[] not null default '{TH,EN}',
  lead_tag text,
  goal_leads int check (goal_leads >= 0),
  goal_bookings int check (goal_bookings >= 0),
  -- The AI's concept: {"big_idea","insight","angles":[...],"key_visual","hashtags":[...]}
  concept jsonb,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, code),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index if not exists marketing_campaigns_org_idx on public.marketing_campaigns(organization_id);
create index if not exists marketing_campaigns_created_by_idx on public.marketing_campaigns(created_by);

create table if not exists public.marketing_campaign_assets (
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  asset_id uuid not null references public.marketing_assets(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (campaign_id, asset_id)
);
create index if not exists marketing_campaign_assets_asset_idx on public.marketing_campaign_assets(asset_id);
create index if not exists marketing_campaign_assets_project_idx on public.marketing_campaign_assets(project_id);
create index if not exists marketing_campaign_assets_org_idx on public.marketing_campaign_assets(organization_id);

create table if not exists public.marketing_copies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  channel text not null default 'FACEBOOK',
  format text not null default 'POST' check (format in ('POST','AD','STORY','VIDEO_SCRIPT','LINE_MESSAGE',
    'EMAIL','ARTICLE','BROCHURE','SEARCH_AD','OTHER')),
  language text not null default 'TH' check (language in ('TH','EN','ZH','RU','DE')),
  headline text,
  body text not null check (length(trim(body)) > 0),
  cta text,
  hashtags text,
  visual_idea text,
  source text not null default 'MANUAL' check (source in ('MANUAL','AI')),
  status text not null default 'DRAFT' check (status in ('DRAFT','APPROVED','USED','ARCHIVED')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_copies_campaign_idx on public.marketing_copies(campaign_id);
create index if not exists marketing_copies_project_idx on public.marketing_copies(project_id);
create index if not exists marketing_copies_org_idx on public.marketing_copies(organization_id);
create index if not exists marketing_copies_created_by_idx on public.marketing_copies(created_by);

-- ---------------------------------------------------------------- row security

do $$
declare t text;
begin
  foreach t in array array['marketing_assets','marketing_asset_files','marketing_plans','marketing_campaigns',
      'marketing_campaign_assets','marketing_copies'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated
      using (public.can_view_marketing(project_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated
      using (public.can_market(project_id, ''EDIT''))', t || '_delete', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Writes need EDIT, the organization of the project, and APPROVE for anything approved.
drop policy if exists marketing_assets_insert on public.marketing_assets;
create policy marketing_assets_insert on public.marketing_assets for insert to authenticated
  with check (public.can_market(project_id, 'EDIT') and public.project_in_org(project_id, organization_id)
    and (status <> 'APPROVED' or public.can_market(project_id, 'APPROVE')));
drop policy if exists marketing_assets_update on public.marketing_assets;
create policy marketing_assets_update on public.marketing_assets for update to authenticated
  using (public.can_market(project_id, 'EDIT')
    and (status <> 'APPROVED' or public.can_market(project_id, 'APPROVE')))
  with check (public.can_market(project_id, 'EDIT') and public.project_in_org(project_id, organization_id)
    and (status <> 'APPROVED' or public.can_market(project_id, 'APPROVE')));

drop policy if exists marketing_asset_files_insert on public.marketing_asset_files;
create policy marketing_asset_files_insert on public.marketing_asset_files for insert to authenticated
  with check (public.can_market(project_id, 'EDIT')
    and exists(select 1 from marketing_assets a where a.id = asset_id and a.project_id = marketing_asset_files.project_id
      and a.organization_id = marketing_asset_files.organization_id)
    and path like organization_id || '/' || project_id || '/%');

drop policy if exists marketing_plans_insert on public.marketing_plans;
create policy marketing_plans_insert on public.marketing_plans for insert to authenticated
  with check (public.can_market(project_id, 'EDIT') and public.project_in_org(project_id, organization_id));
drop policy if exists marketing_plans_update on public.marketing_plans;
create policy marketing_plans_update on public.marketing_plans for update to authenticated
  using (public.can_market(project_id, 'EDIT'))
  with check (public.can_market(project_id, 'EDIT') and public.project_in_org(project_id, organization_id));

drop policy if exists marketing_campaigns_insert on public.marketing_campaigns;
create policy marketing_campaigns_insert on public.marketing_campaigns for insert to authenticated
  with check (public.can_market(project_id, 'EDIT') and public.project_in_org(project_id, organization_id));
drop policy if exists marketing_campaigns_update on public.marketing_campaigns;
create policy marketing_campaigns_update on public.marketing_campaigns for update to authenticated
  using (public.can_market(project_id, 'EDIT'))
  with check (public.can_market(project_id, 'EDIT') and public.project_in_org(project_id, organization_id));

drop policy if exists marketing_campaign_assets_insert on public.marketing_campaign_assets;
create policy marketing_campaign_assets_insert on public.marketing_campaign_assets for insert to authenticated
  with check (public.can_market(project_id, 'EDIT')
    and exists(select 1 from marketing_campaigns c where c.id = campaign_id
      and c.project_id = marketing_campaign_assets.project_id and c.organization_id = marketing_campaign_assets.organization_id)
    and exists(select 1 from marketing_assets a where a.id = asset_id and a.project_id = marketing_campaign_assets.project_id));

drop policy if exists marketing_copies_insert on public.marketing_copies;
create policy marketing_copies_insert on public.marketing_copies for insert to authenticated
  with check (public.can_market(project_id, 'EDIT')
    and exists(select 1 from marketing_campaigns c where c.id = campaign_id
      and c.project_id = marketing_copies.project_id and c.organization_id = marketing_copies.organization_id)
    and (status <> 'APPROVED' or public.can_market(project_id, 'APPROVE')));
drop policy if exists marketing_copies_update on public.marketing_copies;
create policy marketing_copies_update on public.marketing_copies for update to authenticated
  using (public.can_market(project_id, 'EDIT'))
  with check (public.can_market(project_id, 'EDIT')
    and exists(select 1 from marketing_campaigns c where c.id = campaign_id
      and c.project_id = marketing_copies.project_id and c.organization_id = marketing_copies.organization_id)
    and (status <> 'APPROVED' or public.can_market(project_id, 'APPROVE')));

-- Files are never edited in place: a new upload is a new version.
revoke update on public.marketing_asset_files, public.marketing_campaign_assets from authenticated;

-- Who approved and when is stamped by the database, not the form.
create or replace function public.marketing_asset_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'APPROVED' and (tg_op = 'INSERT' or old.status is distinct from 'APPROVED') then
    new.approved_by := auth.uid();
    new.approved_at := now();
  elsif new.status <> 'APPROVED' then
    new.approved_by := null;
    new.approved_at := null;
  elsif tg_op = 'UPDATE' then
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
  end if;
  return new;
end $$;
drop trigger if exists marketing_asset_stamp on public.marketing_assets;
create trigger marketing_asset_stamp before insert or update on public.marketing_assets
  for each row execute function public.marketing_asset_stamp();

create or replace function public.marketing_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['marketing_plans','marketing_campaigns','marketing_copies'] loop
    execute format('drop trigger if exists marketing_touch on public.%I', t);
    execute format('create trigger marketing_touch before update on public.%I
      for each row execute function public.marketing_touch()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- storage

-- 50 MB per file; any type, so CI packs (.ai, .psd, .zip), fonts and videos can be kept.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketing-files', 'marketing-files', false, 52428800, null)
on conflict (id) do nothing;

-- <org>/<project>/<file>: the project of the path, when the org matches.
create or replace function public.marketing_file_project(object_name text)
returns uuid language sql stable security definer set search_path = public as $$
  select p.id from projects p
   where p.id = public.try_uuid((storage.foldername(object_name))[2])
     and p.organization_id = public.try_uuid((storage.foldername(object_name))[1]);
$$;

drop policy if exists marketing_files_upload on storage.objects;
create policy marketing_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'marketing-files' and public.marketing_file_project(name) is not null
    and public.can_market(public.marketing_file_project(name), 'EDIT'));
drop policy if exists marketing_files_read on storage.objects;
create policy marketing_files_read on storage.objects for select to authenticated
  using (bucket_id = 'marketing-files' and public.marketing_file_project(name) is not null
    and public.can_view_marketing(public.marketing_file_project(name)));
drop policy if exists marketing_files_delete on storage.objects;
create policy marketing_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'marketing-files' and public.marketing_file_project(name) is not null
    and public.can_market(public.marketing_file_project(name), 'EDIT'));

-- ---------------------------------------------------------------- lead counts

-- Leads and bookings per campaign tag and per source, without exposing who the leads are.
-- tag is lower-cased and trimmed so "Launch Q1" and "launch q1 " count together.
create or replace function public.marketing_lead_stats(target_project uuid)
returns table (tag text, source text, leads bigint, qualified bigint, booked bigint, lost bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_view_marketing(target_project) then raise exception 'Not authorized'; end if;
  return query
  select lower(nullif(trim(l.campaign), '')), l.source, count(*),
         count(*) filter (where l.stage in ('QUALIFIED','VIEWING','NEGOTIATION','BOOKED')),
         count(*) filter (where l.stage = 'BOOKED'),
         count(*) filter (where l.stage = 'LOST')
    from leads l
   where l.project_id = target_project
   group by 1, 2;
end $$;

do $$
declare f text;
begin
  foreach f in array array['can_market(uuid, text)', 'can_view_marketing(uuid)', 'project_in_org(uuid, uuid)',
      'marketing_file_project(text)', 'marketing_lead_stats(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
