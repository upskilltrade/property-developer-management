-- Release 10: AI assistant audit trail.
-- The assistant reads data only through the asking user's session (RLS), so it can never see
-- more than they can. Each turn is logged: who asked, what, which tools ran, and token usage.

create table if not exists public.assistant_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  question text not null,
  tools text[] not null default '{}',
  input_tokens int,
  output_tokens int,
  stop_reason text,
  created_at timestamptz not null default now()
);
create index if not exists assistant_logs_user_idx on public.assistant_logs(user_id, created_at desc);
alter table public.assistant_logs enable row level security;

create policy assistant_logs_select on public.assistant_logs
  for select to authenticated
  using (user_id = auth.uid() or (organization_id is not null and public.can_manage_access(organization_id)));

create or replace function public.log_assistant_turn(question_text text, tools_used text[],
  tokens_in int, tokens_out int, stop text)
returns void language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  select organization_id into org from organization_memberships
   where user_id = auth.uid() and status = 'ACTIVE' order by organization_id limit 1;
  insert into assistant_logs (organization_id, user_id, question, tools, input_tokens, output_tokens, stop_reason)
  values (org, auth.uid(), left(question_text, 4000), coalesce(tools_used, '{}'), tokens_in, tokens_out, stop);
end $$;

revoke all on function public.log_assistant_turn(text, text[], int, int, text) from public, anon;
grant execute on function public.log_assistant_turn(text, text[], int, int, text) to authenticated;
