-- Customer assistant: homebuyers' questions are logged like staff ones. Customers usually have no
-- organization membership, so the log falls back to the organization that sold them a unit;
-- that lets the owner review what the assistant told customers.
create or replace function public.log_assistant_turn(question_text text, tools_used text[],
  tokens_in int, tokens_out int, stop text)
returns void language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  select organization_id into org from organization_memberships
   where user_id = auth.uid() and status = 'ACTIVE' order by organization_id limit 1;
  if org is null then
    select organization_id into org from customers
     where primary_profile_id = auth.uid() order by created_at limit 1;
  end if;
  insert into assistant_logs (organization_id, user_id, question, tools, input_tokens, output_tokens, stop_reason)
  values (org, auth.uid(), left(question_text, 4000), coalesce(tools_used, '{}'), tokens_in, tokens_out, stop);
end $$;
