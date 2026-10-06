create or replace function public.post_financial_document(target_document uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare d public.financial_documents%rowtype; src public.financial_documents%rowtype; cash_ledger_id uuid; offset_id uuid; j_id uuid; entry_no text;
begin
 select * into d from financial_documents where id=target_document for update;
 if not found then raise exception 'Document not found'; end if;
 if d.status<>'DRAFT' then raise exception 'Only DRAFT cash documents can be posted'; end if;
 if not can_manage_organization(d.organization_id) then raise exception 'Not authorized'; end if;
 if d.document_type not in ('PAYMENT','RECEIPT') then raise exception 'Only PAYMENT and RECEIPT can be cash-posted'; end if;
 if d.cash_account_id is null then select id into d.cash_account_id from cash_accounts where organization_id=d.organization_id and active order by code limit 1; end if;
 select ledger_account_id into cash_ledger_id from cash_accounts where id=d.cash_account_id and organization_id=d.organization_id and active;
 if cash_ledger_id is null then raise exception 'Valid cash account required'; end if;
 if d.source_document_id is not null then
  select * into src from financial_documents where id=d.source_document_id for update;
  if not found or src.organization_id<>d.organization_id or src.project_id is distinct from d.project_id then raise exception 'Invalid settlement source'; end if;
  if d.document_type='PAYMENT' and src.document_type<>'AP' then raise exception 'Payment source must be AP'; end if;
  if d.document_type='RECEIPT' and src.document_type<>'AR' then raise exception 'Receipt source must be AR'; end if;
  if src.status not in ('APPROVED','POSTED') then raise exception 'Source must be approved'; end if;
  if src.settled_amount+d.amount>src.amount then raise exception 'Settlement exceeds outstanding amount'; end if;
  select id into offset_id from ledger_accounts where organization_id=d.organization_id and code=case when d.document_type='PAYMENT' then '2100' else '1200' end and active limit 1;
 elsif d.document_type='PAYMENT' then
  if d.cost_category_id is null then raise exception 'Cost category required for direct payment'; end if;
  select c.ledger_account_id into offset_id from cost_categories c where c.id=d.cost_category_id and c.organization_id=d.organization_id;
 elsif coalesce(d.receipt_purpose,'DIRECT_REVENUE')='CUSTOMER_DEPOSIT' then
  select id into offset_id from ledger_accounts where organization_id=d.organization_id and code='2200' and active limit 1;
 else select id into offset_id from ledger_accounts where organization_id=d.organization_id and code='4100' and active limit 1;
 end if;
 if offset_id is null then raise exception 'Required ledger mapping missing'; end if;
 entry_no:='JV-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
 insert into journal_entries(organization_id,project_id,document_id,entry_no,entry_date,description,status,created_by,posted_at) values(d.organization_id,d.project_id,d.id,entry_no,d.document_date,coalesce(d.description,d.document_no),'POSTED',auth.uid(),now()) returning id into j_id;
 if d.document_type='PAYMENT' then
  insert into journal_lines(journal_entry_id,account_id,unit_id,cost_category_id,debit,credit,memo) values(j_id,offset_id,d.unit_id,d.cost_category_id,d.amount,0,d.description),(j_id,cash_ledger_id,d.unit_id,null,0,d.amount,d.description);
 else
  insert into journal_lines(journal_entry_id,account_id,unit_id,cost_category_id,debit,credit,memo) values(j_id,cash_ledger_id,d.unit_id,null,d.amount,0,d.description),(j_id,offset_id,d.unit_id,d.cost_category_id,0,d.amount,d.description);
 end if;
 update financial_documents set status='POSTED',cash_account_id=d.cash_account_id,updated_at=now() where id=d.id;
 if d.source_document_id is not null then update financial_documents set settled_amount=settled_amount+d.amount,updated_at=now() where id=d.source_document_id; end if;
 return j_id;
end $$;
revoke all on function public.post_financial_document(uuid) from public,anon;
grant execute on function public.post_financial_document(uuid) to authenticated;

create or replace function public.get_project_finance_summary_v2(target_project uuid)
returns table(budget numeric,forecast numeric,latest_date date,opening_cash numeric,cash_in numeric,cash_out numeric,closing_cash numeric,ap_outstanding numeric,ar_outstanding numeric,committed numeric,actual numeric,customer_deposits numeric)
language sql security definer stable set search_path=public as $$
with allowed as(select p.id,p.organization_id from projects p where p.id=target_project and can_access_project(p.id)),
bud as(select coalesce(sum(pb.budget_amount),0) budget,coalesce(sum(pb.forecast_amount),0) forecast from project_budgets pb join allowed a on a.id=pb.project_id),
d as(select fd.* from financial_documents fd join allowed a on a.id=fd.project_id),
ld as(select coalesce(max(document_date),current_date) latest_date from d),
ob as(select coalesce(sum(c.opening_balance),0) opening_base from cash_accounts c join allowed a on a.organization_id=c.organization_id where c.active),
cash as(select coalesce(sum(case when status='POSTED' and document_date<(select latest_date from ld) and document_type='RECEIPT' then amount when status='POSTED' and document_date<(select latest_date from ld) and document_type='PAYMENT' then -amount else 0 end),0) prior,coalesce(sum(case when status='POSTED' and document_date=(select latest_date from ld) and document_type='RECEIPT' then amount else 0 end),0) cash_in,coalesce(sum(case when status='POSTED' and document_date=(select latest_date from ld) and document_type='PAYMENT' then amount else 0 end),0) cash_out from d),
bal as(select coalesce(sum(case when document_type='AP' and status in('APPROVED','POSTED') then greatest(amount-settled_amount,0) else 0 end),0) ap,coalesce(sum(case when document_type='AR' and status in('APPROVED','POSTED') then greatest(amount-settled_amount,0) else 0 end),0) ar,coalesce(sum(case when document_type='COMMITMENT' and status<>'VOID' then amount else 0 end),0) committed,coalesce(sum(case when document_type='PAYMENT' and status='POSTED' then amount else 0 end),0) actual,coalesce(sum(case when document_type='RECEIPT' and status='POSTED' and receipt_purpose='CUSTOMER_DEPOSIT' then amount else 0 end),0) deposits from d)
select bud.budget,bud.forecast,ld.latest_date,ob.opening_base+cash.prior,cash.cash_in,cash.cash_out,ob.opening_base+cash.prior+cash.cash_in-cash.cash_out,bal.ap,bal.ar,bal.committed,bal.actual,bal.deposits from bud,ld,ob,cash,bal $$;
revoke all on function public.get_project_finance_summary_v2(uuid) from public,anon;
grant execute on function public.get_project_finance_summary_v2(uuid) to authenticated;
