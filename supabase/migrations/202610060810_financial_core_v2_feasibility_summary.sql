create or replace function public.get_project_feasibility_summary(target_project uuid)
returns table(target_revenue numeric,total_projected_cost numeric,projected_profit numeric,margin_percent numeric,forecast_inflow numeric,forecast_outflow numeric,forecast_net_cash numeric,lowest_cumulative_cash numeric,funding_required numeric)
language plpgsql security definer set search_path=public as $$
begin
 if not can_access_project(target_project) then raise exception 'Not authorized'; end if;
 return query
 with f as (select coalesce(pf.target_revenue,0) revenue,coalesce(pf.target_cost,0)+coalesce(pf.financing_cost,0)+coalesce(pf.tax_transfer_cost,0)+coalesce(pf.contingency_amount,0) costs from projects p left join project_feasibility pf on pf.project_id=p.id where p.id=target_project),
 m as (select forecast_month,inflow_sales+inflow_other inflow,outflow_land+outflow_construction+outflow_operating+outflow_finance_tax outflow from cashflow_forecast_lines where project_id=target_project),
 c as (select forecast_month,inflow,outflow,sum(inflow-outflow) over(order by forecast_month rows unbounded preceding) cumulative from m)
 select f.revenue,f.costs,f.revenue-f.costs,case when f.revenue>0 then round((f.revenue-f.costs)/f.revenue*100,2) else 0 end,coalesce((select sum(inflow) from m),0),coalesce((select sum(outflow) from m),0),coalesce((select sum(inflow-outflow) from m),0),coalesce((select min(cumulative) from c),0),greatest(0,-coalesce((select min(cumulative) from c),0)) from f;
end $$;
revoke all on function get_project_feasibility_summary(uuid) from public,anon;
grant execute on function get_project_feasibility_summary(uuid) to authenticated;