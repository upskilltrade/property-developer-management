-- Release 8: Management Control Center.
-- The control center reads operational tables directly (RLS-scoped), so this migration is about
-- keeping restricted finance restricted and making exports authorised and audited:
--   * can_view_finance: finance figures (documents, journals, budgets, feasibility, cash) are visible
--     only to owners, FINANCE.VIEW and COST_CONTROL.VIEW. Before this, any internal member with
--     project access could read them.
--   * can_export + log_export: CSV exports need REPORTS.EXPORT or the module's EXPORT permission and
--     leave a timeline event.

-- ---------------------------------------------------------------- finance visibility

create or replace function public.can_view_finance(target_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from projects p where p.id = target_project
    and (public.can_manage_access(p.organization_id)
      or public.has_effective_permission(p.organization_id, p.id, 'FINANCE', 'VIEW')
      or public.has_effective_permission(p.organization_id, p.id, 'COST_CONTROL', 'VIEW')));
$$;

-- Organisation-level finance (cash accounts, documents without a project).
create or replace function public.can_view_org_finance(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_access(target_org)
      or public.has_effective_permission(target_org, null, 'FINANCE', 'VIEW');
$$;

revoke all on function public.can_view_finance(uuid) from public, anon;
grant execute on function public.can_view_finance(uuid) to authenticated;
revoke all on function public.can_view_org_finance(uuid) from public, anon;
grant execute on function public.can_view_org_finance(uuid) to authenticated;

alter policy financial_documents_select on public.financial_documents
  using (public.is_internal_member(organization_id) and
    case when project_id is null then public.can_view_org_finance(organization_id)
         else public.can_view_finance(project_id) end);
alter policy journal_entries_select on public.journal_entries
  using (public.is_internal_member(organization_id) and
    case when project_id is null then public.can_view_org_finance(organization_id)
         else public.can_view_finance(project_id) end);
alter policy journal_lines_select on public.journal_lines
  using (exists(select 1 from public.journal_entries j
    where j.id = journal_lines.journal_entry_id and public.is_internal_member(j.organization_id)
      and case when j.project_id is null then public.can_view_org_finance(j.organization_id)
               else public.can_view_finance(j.project_id) end));
alter policy project_feasibility_select on public.project_feasibility
  using (public.can_view_finance(project_id));
alter policy cashflow_forecast_select on public.cashflow_forecast_lines
  using (public.can_view_finance(project_id));
alter policy cash_accounts_select on public.cash_accounts
  using (public.can_view_org_finance(organization_id));

-- project_budgets' select policy predates the repo migrations; tighten whichever one exists.
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
              where schemaname = 'public' and tablename = 'project_budgets' and cmd in ('SELECT', 'ALL')
  loop
    execute format('alter policy %I on public.project_budgets using (public.can_view_finance(project_id))',
                   pol.policyname);
  end loop;
end $$;

create or replace function public.get_project_finance_summary(target_project uuid)
returns table(budget numeric,forecast numeric,latest_date date,opening_cash numeric,cash_in numeric,cash_out numeric,closing_cash numeric,ap_outstanding numeric,ar_outstanding numeric,committed numeric,actual numeric)
language sql security definer stable set search_path=public as $$
with allowed as (select p.id from projects p where p.id=target_project and can_view_finance(p.id)),
bud as (select coalesce(sum(pb.budget_amount),0) budget,coalesce(sum(pb.forecast_amount),0) forecast from project_budgets pb join allowed a on a.id=pb.project_id),
d as (select fd.* from financial_documents fd join allowed a on a.id=fd.project_id),
ld as (select coalesce(max(document_date),current_date) latest_date from d),
cash as (select coalesce(sum(case when status='POSTED' and document_date<(select latest_date from ld) and document_type='RECEIPT' then amount when status='POSTED' and document_date<(select latest_date from ld) and document_type='PAYMENT' then -amount else 0 end),0) opening_cash,coalesce(sum(case when status='POSTED' and document_date=(select latest_date from ld) and document_type='RECEIPT' then amount else 0 end),0) cash_in,coalesce(sum(case when status='POSTED' and document_date=(select latest_date from ld) and document_type='PAYMENT' then amount else 0 end),0) cash_out from d),
bal as (select coalesce(sum(case when document_type='AP' and status in ('APPROVED','POSTED') then greatest(amount-settled_amount,0) else 0 end),0) ap_outstanding,coalesce(sum(case when document_type='AR' and status in ('APPROVED','POSTED') then greatest(amount-settled_amount,0) else 0 end),0) ar_outstanding,coalesce(sum(case when document_type='COMMITMENT' and status<>'VOID' then amount else 0 end),0) committed,coalesce(sum(case when document_type='PAYMENT' and status='POSTED' then amount else 0 end),0) actual from d)
select bud.budget,bud.forecast,ld.latest_date,cash.opening_cash,cash.cash_in,cash.cash_out,cash.opening_cash+cash.cash_in-cash.cash_out,bal.ap_outstanding,bal.ar_outstanding,bal.committed,bal.actual from bud,ld,cash,bal;
$$;

create or replace function public.get_project_finance_summary_v2(target_project uuid)
returns table(budget numeric,forecast numeric,latest_date date,opening_cash numeric,cash_in numeric,cash_out numeric,closing_cash numeric,ap_outstanding numeric,ar_outstanding numeric,committed numeric,actual numeric,customer_deposits numeric)
language sql security definer stable set search_path=public as $$
with allowed as(select p.id,p.organization_id from projects p where p.id=target_project and can_view_finance(p.id)),
bud as(select coalesce(sum(pb.budget_amount),0) budget,coalesce(sum(pb.forecast_amount),0) forecast from project_budgets pb join allowed a on a.id=pb.project_id),
d as(select fd.* from financial_documents fd join allowed a on a.id=fd.project_id),
ld as(select coalesce(max(document_date),current_date) latest_date from d),
ob as(select coalesce(sum(c.opening_balance),0) opening_base from cash_accounts c join allowed a on a.organization_id=c.organization_id where c.active),
cash as(select coalesce(sum(case when status='POSTED' and document_date<(select latest_date from ld) and document_type='RECEIPT' then amount when status='POSTED' and document_date<(select latest_date from ld) and document_type='PAYMENT' then -amount else 0 end),0) prior,coalesce(sum(case when status='POSTED' and document_date=(select latest_date from ld) and document_type='RECEIPT' then amount else 0 end),0) cash_in,coalesce(sum(case when status='POSTED' and document_date=(select latest_date from ld) and document_type='PAYMENT' then amount else 0 end),0) cash_out from d),
bal as(select coalesce(sum(case when document_type='AP' and status in('APPROVED','POSTED') then greatest(amount-settled_amount,0) else 0 end),0) ap,coalesce(sum(case when document_type='AR' and status in('APPROVED','POSTED') then greatest(amount-settled_amount,0) else 0 end),0) ar,coalesce(sum(case when document_type='COMMITMENT' and status<>'VOID' then amount else 0 end),0) committed,coalesce(sum(case when document_type='PAYMENT' and status='POSTED' then amount else 0 end),0) actual,coalesce(sum(case when document_type='RECEIPT' and status='POSTED' and receipt_purpose='CUSTOMER_DEPOSIT' then amount else 0 end),0) deposits from d)
select bud.budget,bud.forecast,ld.latest_date,ob.opening_base+cash.prior,cash.cash_in,cash.cash_out,ob.opening_base+cash.prior+cash.cash_in-cash.cash_out,bal.ap,bal.ar,bal.committed,bal.actual,bal.deposits from bud,ld,ob,cash,bal $$;

create or replace function public.get_project_feasibility_summary(target_project uuid)
returns table(target_revenue numeric,total_projected_cost numeric,projected_profit numeric,margin_percent numeric,forecast_inflow numeric,forecast_outflow numeric,forecast_net_cash numeric,lowest_cumulative_cash numeric,funding_required numeric)
language plpgsql security definer set search_path=public as $$
begin
 if not can_view_finance(target_project) then raise exception 'Not authorized'; end if;
 return query
 with f as (select coalesce(pf.target_revenue,0) revenue,coalesce(pf.target_cost,0)+coalesce(pf.financing_cost,0)+coalesce(pf.tax_transfer_cost,0)+coalesce(pf.contingency_amount,0) costs from projects p left join project_feasibility pf on pf.project_id=p.id where p.id=target_project),
 m as (select forecast_month,inflow_sales+inflow_other inflow,outflow_land+outflow_construction+outflow_operating+outflow_finance_tax outflow from cashflow_forecast_lines where project_id=target_project),
 c as (select forecast_month,inflow,outflow,sum(inflow-outflow) over(order by forecast_month rows unbounded preceding) cumulative from m)
 select f.revenue,f.costs,f.revenue-f.costs,case when f.revenue>0 then round((f.revenue-f.costs)/f.revenue*100,2) else 0 end,coalesce((select sum(inflow) from m),0),coalesce((select sum(outflow) from m),0),coalesce((select sum(inflow-outflow) from m),0),coalesce((select min(cumulative) from c),0),greatest(0,-coalesce((select min(cumulative) from c),0)) from f;
end $$;

-- ---------------------------------------------------------------- exports

insert into public.role_permissions(role_id, module_code, action_code)
select r.id, v.module_code, v.action_code
  from public.roles r
  join (values ('OWNER','REPORTS','EXPORT'), ('FINANCE_MANAGER','REPORTS','EXPORT'),
               ('PROJECT_MANAGER','REPORTS','VIEW')) v(role_code, module_code, action_code)
    on v.role_code = r.code
on conflict (role_id, module_code, action_code) do nothing;

-- Datasets map to the module whose data they contain; finance datasets also need finance visibility.
create or replace function public.can_export(target_project uuid, dataset text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  org uuid;
  module text := case dataset
    when 'houses' then 'PROJECTS'
    when 'receivables' then 'FINANCE'
    when 'cost' then 'COST_CONTROL'
    when 'approvals' then 'PROJECTS'
    when 'issues' then 'CONSTRUCTION'
    when 'timeline' then 'PROJECTS'
    else null end;
begin
  if module is null then return false; end if;
  select organization_id into org from projects where id = target_project and public.can_access_project(id);
  if org is null then return false; end if;
  if dataset in ('receivables', 'cost') and not public.can_view_finance(target_project) then
    return false;
  end if;
  return public.can_manage_access(org)
      or public.has_effective_permission(org, target_project, 'REPORTS', 'EXPORT')
      or public.has_effective_permission(org, target_project, module, 'EXPORT');
end $$;

create or replace function public.log_export(target_project uuid, dataset text, row_count int)
returns void language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  if not public.can_export(target_project, dataset) then raise exception 'Not authorized'; end if;
  select organization_id into org from projects where id = target_project;
  perform public.log_timeline(org, target_project, null, 'REPORT_EXPORTED', 'report', null,
    'Exported ' || dataset, jsonb_build_object('dataset', dataset, 'rows', row_count));
end $$;

revoke all on function public.can_export(uuid, text) from public, anon;
grant execute on function public.can_export(uuid, text) to authenticated;
revoke all on function public.log_export(uuid, text, int) from public, anon;
grant execute on function public.log_export(uuid, text, int) to authenticated;
