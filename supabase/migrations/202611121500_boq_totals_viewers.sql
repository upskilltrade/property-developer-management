-- Anyone who may read the financial plan also gets the BOQ totals its FROM_BOQ lines use
-- (finance viewers saw those lines as 0). Totals per cost code only, no BOQ line detail.
-- Someone without access gets an error instead of an empty list, so the app can say so
-- rather than show 0.
create or replace function public.get_boq_totals(target_project uuid)
returns table(cost_category_id uuid, amount numeric, version int, status text)
language plpgsql stable security definer set search_path = public as $$
declare org uuid; v budget_versions;
begin
  select pr.organization_id into org from projects pr where pr.id = target_project;
  if org is null or not (public.can_cost(target_project, 'VIEW') or public.can_plan_forecast(org)
                         or public.can_view_finance(target_project)) then
    raise exception 'Not authorized';
  end if;
  select * into v from budget_versions b where b.id = public.working_budget_version(target_project);
  if v.id is null then return; end if;
  return query
    select e.cost_category_id, round(sum(e.amount), 2), v.version, v.status
      from public.boq_effective(v.id) e
     group by e.cost_category_id;
end $$;
revoke all on function public.get_boq_totals(uuid) from public, anon;
grant execute on function public.get_boq_totals(uuid) to authenticated;
