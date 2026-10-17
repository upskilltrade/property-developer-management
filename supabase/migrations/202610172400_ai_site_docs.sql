-- Release 10 (cont.): AI photo review for progress verification.
-- The AI gives verifiers a second opinion on whether site photos support the reported percent.
-- It never verifies anything itself; the human verification flow is unchanged.

create table if not exists public.ai_photo_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  progress_update_id uuid not null references public.progress_updates(id) on delete cascade,
  verdict text not null check (verdict in ('CONSISTENT','QUESTIONABLE','INSUFFICIENT')),
  estimated_percent numeric(5,2) check (estimated_percent between 0 and 100),
  summary_th text not null,
  summary_en text not null,
  concerns text[] not null default '{}',
  photo_count int not null,
  model text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists ai_photo_reviews_update_idx on public.ai_photo_reviews(progress_update_id, created_at desc);
alter table public.ai_photo_reviews enable row level security;

create policy ai_photo_reviews_select on public.ai_photo_reviews
  for select to authenticated using (public.can_access_project(project_id));

-- Only people who may verify progress can ask for (and store) a review.
create or replace function public.save_photo_review(target_update uuid, review jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  u progress_updates;
  new_id uuid;
begin
  select * into u from progress_updates where id = target_update;
  if not found then raise exception 'Update not found'; end if;
  if not public.can_schedule(u.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  insert into ai_photo_reviews (organization_id, project_id, progress_update_id, verdict, estimated_percent,
                                summary_th, summary_en, concerns, photo_count, model, created_by)
  values (u.organization_id, u.project_id, u.id, review->>'verdict',
          nullif(review->>'estimated_percent', '')::numeric,
          coalesce(review->>'summary_th', ''), coalesce(review->>'summary_en', ''),
          coalesce(array(select jsonb_array_elements_text(review->'concerns')), '{}'),
          coalesce((review->>'photo_count')::int, 0), coalesce(review->>'model', 'unknown'), auth.uid())
  returning id into new_id;
  return new_id;
end $$;

revoke all on function public.save_photo_review(uuid, jsonb) from public, anon;
grant execute on function public.save_photo_review(uuid, jsonb) to authenticated;
