-- AI photo review judged against documents, never memory.
-- 1) Documents in the standards library gain a type: STANDARD (technical / good-practice standard),
--    PROJECT_SPEC (รายการประกอบแบบ) or CONTRACT (สัญญา / TOR); project documents are tied to a project,
--    and any document can be limited to schedule stages. The AI review attaches the verified
--    documents that apply to the activity being checked.
-- 2) A review now has two parts — against the project's specification and contract, and against
--    technical standards — each with findings that cite a provided document (code + clause/page).

alter table public.inspection_standards add column if not exists doc_type text not null default 'STANDARD'
  check (doc_type in ('STANDARD','PROJECT_SPEC','CONTRACT'));
alter table public.inspection_standards add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.inspection_standards add column if not exists stages text[] not null default '{}';

alter policy inspection_standards_select on public.inspection_standards
  using (public.is_internal_member(organization_id) and (project_id is null or public.can_access_project(project_id)));

alter table public.ai_photo_reviews add column if not exists spec_verdict text
  check (spec_verdict in ('PASS','FAIL','NOT_ASSESSABLE'));
alter table public.ai_photo_reviews add column if not exists technical_verdict text
  check (technical_verdict in ('PASS','FAIL','NOT_ASSESSABLE'));
alter table public.ai_photo_reviews add column if not exists findings jsonb not null default '[]'::jsonb;
alter table public.ai_photo_reviews add column if not exists documents jsonb not null default '[]'::jsonb;

create or replace function public.save_inspection_standard(target_org uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s inspection_standards;
  sid uuid := public.try_uuid(nullif(data->>'id', ''));
  fpath text := nullif(trim(data->>'file_path'), '');
  proj uuid := public.try_uuid(nullif(data->>'project_id', ''));
  dtype text := coalesce(nullif(data->>'doc_type', ''), 'STANDARD');
  stg text[] := coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(data->'stages') = 'array' then data->'stages' else '[]'::jsonb end)), '{}');
begin
  if not public.can_manage_standards(target_org) then raise exception 'Not authorized'; end if;
  if coalesce(trim(data->>'code'), '') = '' or coalesce(trim(data->>'title'), '') = ''
     or coalesce(data->>'issuer', '') not in ('DPT','TISI','EIT','LAW','MANUFACTURER','COMPANY','OTHER')
     or dtype not in ('STANDARD','PROJECT_SPEC','CONTRACT')
     or not stg <@ array['FOUNDATION','STRUCTURE','ROOF','MEP','FINISHING','INSPECTION']
     or (proj is not null and not exists(select 1 from projects where id = proj and organization_id = target_org))
     or (dtype <> 'STANDARD' and proj is null) then
    raise exception 'Invalid standard';
  end if;
  if fpath is not null and ((storage.foldername(fpath))[1] <> target_org::text
     or not exists(select 1 from storage.objects o where o.bucket_id = 'standard-docs' and o.name = fpath)) then
    raise exception 'Invalid standard';
  end if;
  if sid is null then
    insert into inspection_standards (organization_id, code, title, issuer, edition, source_url, file_path, notes, created_by,
                                      doc_type, project_id, stages)
    values (target_org, trim(data->>'code'), trim(data->>'title'), data->>'issuer', nullif(trim(data->>'edition'), ''),
            nullif(trim(data->>'source_url'), ''), fpath, nullif(trim(data->>'notes'), ''), auth.uid(), dtype, proj, stg)
    returning * into s;
  else
    select * into s from inspection_standards where id = sid and organization_id = target_org for update;
    if not found then raise exception 'Invalid standard'; end if;
    update inspection_standards set
      code = trim(data->>'code'), title = trim(data->>'title'), issuer = data->>'issuer',
      edition = nullif(trim(data->>'edition'), ''), source_url = nullif(trim(data->>'source_url'), ''),
      file_path = coalesce(fpath, file_path), notes = nullif(trim(data->>'notes'), ''), updated_at = now(),
      doc_type = dtype, project_id = proj, stages = stg,
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
                                summary_th, summary_en, concerns, photo_count, model, created_by,
                                spec_verdict, technical_verdict, findings, documents)
  values (u.organization_id, u.project_id, u.id, review->>'verdict',
          nullif(review->>'estimated_percent', '')::numeric,
          coalesce(review->>'summary_th', ''), coalesce(review->>'summary_en', ''),
          coalesce(array(select jsonb_array_elements_text(review->'concerns')), '{}'),
          coalesce((review->>'photo_count')::int, 0), coalesce(review->>'model', 'unknown'), auth.uid(),
          nullif(review->>'spec_verdict', ''), nullif(review->>'technical_verdict', ''),
          case when jsonb_typeof(review->'findings') = 'array' then review->'findings' else '[]'::jsonb end,
          case when jsonb_typeof(review->'documents') = 'array' then review->'documents' else '[]'::jsonb end)
  returning id into new_id;
  return new_id;
end $$;
