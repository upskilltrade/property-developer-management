-- The marketing plan as a presentation: the AI turns the plan's text into structured sections
-- (executive summary, segments, personas, value proposition, channel mix, funnel, roadmap,
-- guardrails, next steps) shown as a branded, printable deck.

alter table public.marketing_plans add column if not exists presentation jsonb
  check (presentation is null or jsonb_typeof(presentation) = 'object');
alter table public.marketing_plans add column if not exists presentation_at timestamptz;
