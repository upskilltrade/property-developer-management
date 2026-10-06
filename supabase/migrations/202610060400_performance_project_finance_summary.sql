create or replace function public.get_project_finance_summary(target_project uuid)
returns table(budget numeric,forecast numeric,latest_date date,opening_cash numeric,cash_in numeric,cash_out numeric,closing_cash numeric,ap_outstanding numeric,ar_outstanding numeric,committed numeric,actual numeric)
language sql security definer stable set search_path=public as $$
with allowed as (select p.id from projects p where p.id=target_project and can_access_project(p.id)),
bud as (select coalesce(sum(pb.budget_amount),0) budget,coalesce(sum(pb.forecast_amount),0) forecast from project_budgets pb join allowed a on a.id=pb.project_id),
d as (select fd.* from financial_documents fd join allowed a on a.id=fd.project_id),
ld as (select coalesce(max(document_date),current_date) latest_date from d),
cash as (select coalesce(sum(case when status='POSTED' and document_date<(select latest_date from ld) and document_type='RECEIPT' then amount when status='POSTED' and document_date<(select latest_date from ld) and document_type='PAYMENT' then -amount else 0 end),0) opening_cash,coalesce(sum(case when status='POSTED' and document_date=(select latest_date from ld) and document_type='RECEIPT' then amount else 0 end),0) cash_in,coalesce(sum(case when status='POSTED' and document_date=(select latest_date from ld) and document_type='PAYMENT' then amount else 0 end),0) cash_out from d),
bal as (select coalesce(sum(case when document_type='AP' and status in ('APPROVED','POSTED') then greatest(amount-settled_amount,0) else 0 end),0) ap_outstanding,coalesce(sum(case when document_type='AR' and status in ('APPROVED','POSTED') then greatest(amount-settled_amount,0) else 0 end),0) ar_outstanding,coalesce(sum(case when document_type='COMMITMENT' and status<>'VOID' then amount else 0 end),0) committed,coalesce(sum(case when document_type='PAYMENT' and status='POSTED' then amount else 0 end),0) actual from d)
select bud.budget,bud.forecast,ld.latest_date,cash.opening_cash,cash.cash_in,cash.cash_out,cash.opening_cash+cash.cash_in-cash.cash_out,bal.ap_outstanding,bal.ar_outstanding,bal.committed,bal.actual from bud,ld,cash,bal;
$$;
revoke all on function public.get_project_finance_summary(uuid) from public,anon;
grant execute on function public.get_project_finance_summary(uuid) to authenticated;
create index if not exists financial_documents_project_date_status_type_idx on public.financial_documents(project_id,document_date,status,document_type);
create index if not exists project_budgets_project_idx on public.project_budgets(project_id);