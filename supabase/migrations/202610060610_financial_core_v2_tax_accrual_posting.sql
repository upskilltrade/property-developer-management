create or replace function public.post_approved_financial_document(target_document uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare d public.financial_documents%rowtype; base_id uuid; control_id uuid; vat_id uuid; j_id uuid; entry_no text; base numeric; vat numeric; gross numeric;
begin
 select * into d from financial_documents where id=target_document for update;
 if not found then raise exception 'Document not found'; end if;
 if d.status<>'APPROVED' then raise exception 'Document must be APPROVED'; end if;
 if not can_manage_organization(d.organization_id) then raise exception 'Not authorized'; end if;
 if d.document_type not in('AP','AR') then raise exception 'Only AP and AR can be accrued'; end if;
 base:=coalesce(d.tax_base_amount,d.amount); vat:=coalesce(d.vat_amount,0); gross:=base+vat;
 if d.document_type='AP' then
  if d.cost_category_id is null then raise exception 'Cost category required'; end if;
  select ledger_account_id into base_id from cost_categories where id=d.cost_category_id and organization_id=d.organization_id;
  select id into control_id from ledger_accounts where organization_id=d.organization_id and code='2100' and active limit 1;
  if vat>0 then select id into vat_id from ledger_accounts where organization_id=d.organization_id and code='1150' and active limit 1; end if;
 else
  select id into base_id from ledger_accounts where organization_id=d.organization_id and code='4100' and active limit 1;
  select id into control_id from ledger_accounts where organization_id=d.organization_id and code='1200' and active limit 1;
  if vat>0 then select id into vat_id from ledger_accounts where organization_id=d.organization_id and code='2150' and active limit 1; end if;
 end if;
 if base_id is null or control_id is null or (vat>0 and vat_id is null) then raise exception 'Required ledger mapping missing'; end if;
 entry_no:='JV-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
 insert into journal_entries(organization_id,project_id,document_id,entry_no,entry_date,description,status,created_by,posted_at) values(d.organization_id,d.project_id,d.id,entry_no,d.document_date,coalesce(d.description,d.document_no),'POSTED',auth.uid(),now()) returning id into j_id;
 if d.document_type='AP' then
  insert into journal_lines(journal_entry_id,account_id,unit_id,cost_category_id,debit,credit,memo) values(j_id,base_id,d.unit_id,d.cost_category_id,base,0,d.description),(j_id,control_id,d.unit_id,null,0,gross,d.description);
  if vat>0 then insert into journal_lines(journal_entry_id,account_id,unit_id,cost_category_id,debit,credit,memo) values(j_id,vat_id,d.unit_id,null,vat,0,d.description); end if;
 else
  insert into journal_lines(journal_entry_id,account_id,unit_id,cost_category_id,debit,credit,memo) values(j_id,control_id,d.unit_id,null,gross,0,d.description),(j_id,base_id,d.unit_id,d.cost_category_id,0,base,d.description);
  if vat>0 then insert into journal_lines(journal_entry_id,account_id,unit_id,cost_category_id,debit,credit,memo) values(j_id,vat_id,d.unit_id,null,0,vat,d.description); end if;
 end if;
 update financial_documents set amount=gross,net_payable_amount=greatest(gross-coalesce(wht_amount,0),0),status='POSTED',updated_at=now() where id=d.id; return j_id;
end $$;
revoke all on function public.post_approved_financial_document(uuid) from public,anon;
grant execute on function public.post_approved_financial_document(uuid) to authenticated;