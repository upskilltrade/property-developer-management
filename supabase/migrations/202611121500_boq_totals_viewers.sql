-- Anyone who may read the financial plan also gets the BOQ totals its FROM_BOQ lines use
-- (finance viewers saw those lines as 0). Totals per cost code only, no BOQ line detail.
create or replace function public.get_boq_totals(target_project uuid)
returns table(cost_category_id uuid, amount numeric, version int, status text)
language sql stable security definer set search_path = public as $$
  with p as (
    select pr.id from projects pr where pr.id = target_project
       and (public.can_cost(pr.id, 'VIEW') or public.can_plan_forecast(pr.organization_id)
            or public.can_view_finance(pr.id))
  ),
  bv as (select b.* from budget_versions b join p on true where b.id = public.working_budget_version(p.id))
  select e.cost_category_id, round(sum(e.amount), 2), bv.version, bv.status
    from bv cross join lateral public.boq_effective(bv.id) e
   group by e.cost_category_id, bv.version, bv.status;
$$;
revoke all on function public.get_boq_totals(uuid) from public, anon;
grant execute on function public.get_boq_totals(uuid) to authenticated;
