create or replace function public.post_financial_document(target_document uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare d financial_documents%rowtype; src financial_documents%rowtype; cash_ledger_id uuid; offset_id uuid; wht_id uuid; j_id uuid; entry_no text; settle_gross numeric; cash_amount numeric; wht numeric;
begin
 select * into d from financial_documents where id=target_document for update;
 if not found then raise exception 'Document not found'; end if;
 if d.status<>'DRAFT' then raise exception 'Only DRAFT cash documents can be posted'; end if;
 if not can_manage_organization(d.organization_id) then raise exception 'Not authorized'; end if;
 if d.document_type not in('PAYMENT','RECEIPT') then raise exception 'Only PAYMENT and RECEIPT can be cash-posted'; end if;
 if d.cash_account_id is null then select id into d.cash_account_id from cash_accounts where organization_id=d.organization_id and active order by code limit 1; end if;
 select ledger_account_id into cash_ledger_id from cash_accounts where id=d.cash_account_id and organization_id=d.organization_id and active;
 if cash_ledger_id is null then raise exception 'Valid cash account required'; end if;
 cash_amount:=d.amount; wht:=coalesce(d.wht_amount,0); settle_gross:=cash_amount+wht;
 if d.source_document_id is not null then
  select * into src from financial_documents where id=d.source_document_id for update;
  if not found or src.organization_id<>d.organization_id or src.project_id is distinct from d.project_id then raise exception 'Invalid settlement source'; end if;
  if d.document_type='PAYMENT' and src.document_type<>'AP' then raise exception 'Payment source must be AP'; end if;
  if d.document_type='RECEIPT' and src.document_type<>'AR' then raise exception 'Receipt source must be AR'; end if;
  if src.status not in('APPROVED','POSTED') then raise exception 'Source must be approved'; end if;
  if src.settled_amount+settle_gross>src.amount then raise exception 'Settlement exceeds outstanding amount'; end if;
  select id into offset_id from ledger_accounts where organization_id=d.organization_id and code=case when d.document_type='PAYMENT' then '2100' else '1200' end and active limit 1;
  if wht>0 then select id into wht_id from ledger_accounts where organization_id=d.organization_id and code=case when d.document_type='PAYMENT' then '2160' else '1250' end and active limit 1; end if;
 elsif d.document_type='PAYMENT' then
  if d.cost_category_id is null then raise exception 'Cost category required for direct payment'; end if;
  select c.ledger_account_id into offset_id from cost_categories c where c.id=d.cost_category_id and c.organization_id=d.organization_id;
 elsif coalesce(d.receipt_purpose,'DIRECT_REVENUE')='CUSTOMER_DEPOSIT' then select id into offset_id from ledger_accounts where organization_id=d.organization_id and code='2200' and active limit 1;
 else select id into offset_id from ledger_accounts where organization_id=d.organization_id and code='4100' and active limit 1; end if;
 if offset_id is null or (wht>0 and wht_id is null) then raise exception 'Required ledger mapping missing'; end if;
 entry_no:='JV-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
 insert into journal_entries(organization_id,project_id,document_id,entry_no,entry_date,description,status,created_by,posted_at) values(d.organization_id,d.project_id,d.id,entry_no,d.document_date,coalesce(d.description,d.document_no),'POSTED',auth.uid(),now()) returning id into j_id;
 if d.document_type='PAYMENT' then
  insert into journal_lines(journal_entry_id,account_id,unit_id,cost_category_id,debit,credit,memo) values(j_id,offset_id,d.unit_id,d.cost_category_id,settle_gross,0,d.description),(j_id,cash_ledger_id,d.unit_id,null,0,cash_amount,d.description);
  if wht>0 then insert into journal_lines(journal_entry_id,account_id,unit_id,cost_category_id,debit,credit,memo) values(j_id,wht_id,d.unit_id,null,0,wht,d.description); end if;
 else
  insert into journal_lines(journal_entry_id,account_id,unit_id,cost_category_id,debit,credit,memo) values(j_id,cash_ledger_id,d.unit_id,null,cash_amount,0,d.description),(j_id,offset_id,d.unit_id,d.cost_category_id,0,settle_gross,d.description);
  if wht>0 then insert into journal_lines(journal_entry_id,account_id,unit_id,cost_category_id,debit,credit,memo) values(j_id,wht_id,d.unit_id,null,wht,0,d.description); end if;
 end if;
 update financial_documents set status='POSTED',cash_account_id=d.cash_account_id,net_payable_amount=cash_amount,updated_at=now() where id=d.id;
 if d.source_document_id is not null then update financial_documents set settled_amount=settled_amount+settle_gross,updated_at=now() where id=d.source_document_id; end if; return j_id;
end $$;
revoke all on function public.post_financial_document(uuid) from public,anon;
grant execute on function public.post_financial_document(uuid) to authenticated;