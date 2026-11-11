-- Raw project data for the AI marketing plan: a free-text brief on the plan (concept, details,
-- notes pasted from anywhere) and a PROJECT_DATA file category for documents the AI should read
-- (concept decks, project details, master plan, price lists ...). Also records when the AI last
-- drafted the plan and what it says it read.

alter table public.marketing_plans add column if not exists raw_brief text;
alter table public.marketing_plans add column if not exists ai_summary text;
alter table public.marketing_plans add column if not exists ai_drafted_at timestamptz;

alter table public.marketing_assets drop constraint if exists marketing_assets_category_check;
alter table public.marketing_assets add constraint marketing_assets_category_check
  check (category in ('PROJECT_DATA','LOGO','CI','BROCHURE','AD_CREATIVE','SOCIAL','VIDEO',
    'RENDER','PHOTO','FLOOR_PLAN','PRICE_LIST','PRESENTATION','SIGNAGE','OTHER'));
