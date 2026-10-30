-- Market intelligence for choosing land: zones on the map, land price points, competitor projects
-- and saved AI analyses. Everything is per organization and open to its internal team, who add
-- points by coordinate (pasted from Google Maps) or accept what the AI research found.
-- AI-found rows start unverified and always carry the page they came from.

create table if not exists public.market_zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  center_lat double precision not null check (center_lat between -90 and 90),
  center_lng double precision not null check (center_lng between -180 and 180),
  radius_m int not null default 2000 check (radius_m between 100 and 50000),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists market_zones_org_idx on public.market_zones(organization_id);

create table if not exists public.land_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  location_text text,
  kind text not null default 'ASKING' check (kind in ('ASKING','SOLD','APPRAISAL')),
  price_per_wah numeric(14,2) not null check (price_per_wah > 0),
  area_wah numeric(12,2) check (area_wah is null or area_wah > 0),
  observed_on date,
  source text not null default 'MANUAL' check (source in ('MANUAL','AI')),
  source_url text,
  verified boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists land_prices_org_idx on public.land_prices(organization_id);

create table if not exists public.competitor_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  developer text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  location_text text,
  product_type text not null default 'POOL_VILLA'
    check (product_type in ('POOL_VILLA','HOUSE','TOWNHOME','CONDO','LAND','OTHER')),
  status text not null default 'SELLING' check (status in ('SELLING','SOLD_OUT','UPCOMING','UNKNOWN')),
  grade text check (grade in ('A','B','C')),
  price_min numeric(14,2) check (price_min is null or price_min > 0),
  price_max numeric(14,2) check (price_max is null or price_max > 0),
  house_area_min numeric(10,2),
  house_area_max numeric(10,2),
  land_area_min_wah numeric(10,2),
  land_area_max_wah numeric(10,2),
  bedrooms text,
  units_total int,
  offerings text[] not null default '{}',
  strengths text,
  weaknesses text,
  observed_on date,
  source text not null default 'MANUAL' check (source in ('MANUAL','AI')),
  source_url text,
  verified boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists competitor_projects_org_idx on public.competitor_projects(organization_id);

create table if not exists public.market_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  result jsonb not null,
  input_tokens int,
  output_tokens int,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists market_analyses_org_idx on public.market_analyses(organization_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['market_zones','land_prices','competitor_projects','market_analyses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_team', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.is_internal_member(organization_id))
         with check (public.is_internal_member(organization_id))', t || '_team', t);
  end loop;
end $$;

create index if not exists market_zones_created_by_idx on public.market_zones(created_by);
create index if not exists land_prices_created_by_idx on public.land_prices(created_by);
create index if not exists competitor_projects_created_by_idx on public.competitor_projects(created_by);
create index if not exists market_analyses_created_by_idx on public.market_analyses(created_by);
