-- AI risk review (Release 10 "risk detection"). The review is built from data loaded through the
-- requesting person's own session, so it never reflects more than they may see. Each risk keeps
-- the source records it cites; the server drops citations to records that weren't in the data.
create table if not exists public.risk_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  summary_th text not null,
  summary_en text not null,
  risks jsonb not null default '[]'::jsonb,
  discarded int not null default 0,
  record_count int not null default 0,
  input_tokens int,
  output_tokens int,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists risk_reviews_org_idx on public.risk_reviews(organization_id, created_at desc);
alter table public.risk_reviews enable row level security;
-- The person who ran it, and the owner, can read a review.
create policy risk_reviews_select on public.risk_reviews for select to authenticated
  using (created_by = auth.uid() or public.can_manage_access(organization_id));

create or replace function public.save_risk_review(target_org uuid, target_project uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if not public.is_internal_member(target_org) then raise exception 'Not authorized'; end if;
  if target_project is not null and not exists(
       select 1 from projects where id = target_project and organization_id = target_org
         and public.can_access_project(id)) then
    raise exception 'Not authorized';
  end if;
  if jsonb_typeof(data->'risks') <> 'array' or coalesce(trim(data->>'summary_th'), '') = '' then
    raise exception 'Invalid review';
  end if;
  insert into risk_reviews (organization_id, project_id, summary_th, summary_en, risks, discarded, record_count,
    input_tokens, output_tokens, created_by)
  values (target_org, target_project, left(data->>'summary_th', 4000), left(coalesce(data->>'summary_en', ''), 4000),
    data->'risks', coalesce((data->>'discarded')::int, 0), coalesce((data->>'record_count')::int, 0),
    nullif(data->>'input_tokens', '')::int, nullif(data->>'output_tokens', '')::int, auth.uid())
  returning id into rid;
  return rid;
end $$;

revoke all on function public.save_risk_review(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_risk_review(uuid, uuid, jsonb) to authenticated;
