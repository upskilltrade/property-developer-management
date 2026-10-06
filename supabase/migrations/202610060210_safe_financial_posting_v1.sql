create or replace function public.post_financial_document(target_document uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare d public.financial_documents%rowtype; cash_id uuid; offset_id uuid; j_id uuid; entry_no text;
begin
 select * into d from public.financial_documents where id=target_document for update;
 if not found then raise exception 'Document not found'; end if;
 if d.status <> 'DRAFT' then raise exception 'Only DRAFT documents can be posted'; end if;
 if not public.can_manage_organization(d.organization_id) then raise exception 'Not authorized'; end if;
 if d.project_id is not null and not exists(select 1 from public.projects p where p.id=d.project_id and p.organization_id=d.organization_id) then raise exception 'Project organization mismatch'; end if;
 if d.cost_category_id is not null and not exists(select 1 from public.cost_categories c where c.id=d.cost_category_id and c.organization_id=d.organization_id) then raise exception 'Cost category organization mismatch'; end if;
 if d.document_type not in ('PAYMENT','RECEIPT') then raise exception 'Only PAYMENT and RECEIPT can be posted to ledger in v1'; end if;
 select id into cash_id from public.ledger_accounts where organization_id=d.organization_id and code='1100' and active limit 1;
 select id into offset_id from public.ledger_accounts where organization_id=d.organization_id and code=case when d.document_type='PAYMENT' then '5100' else '4100' end and active limit 1;
 if cash_id is null or offset_id is null then raise exception 'Required ledger accounts are missing'; end if;
 entry_no := 'JV-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
 insert into public.journal_entries(organization_id,project_id,document_id,entry_no,entry_date,description,status,created_by,posted_at)
 values(d.organization_id,d.project_id,d.id,entry_no,d.document_date,coalesce(d.description,d.document_no),'POSTED',auth.uid(),now()) returning id into j_id;
 if d.document_type='PAYMENT' then
  insert into public.journal_lines(journal_entry_id,account_id,unit_id,cost_category_id,debit,credit,memo)
  values(j_id,offset_id,d.unit_id,d.cost_category_id,d.amount,0,d.description),(j_id,cash_id,d.unit_id,null,0,d.amount,d.description);
 else
  insert into public.journal_lines(journal_entry_id,account_id,unit_id,cost_category_id,debit,credit,memo)
  values(j_id,cash_id,d.unit_id,null,d.amount,0,d.description),(j_id,offset_id,d.unit_id,d.cost_category_id,0,d.amount,d.description);
 end if;
 if (select coalesce(sum(debit),0) from public.journal_lines where journal_entry_id=j_id) <> (select coalesce(sum(credit),0) from public.journal_lines where journal_entry_id=j_id) then raise exception 'Journal is not balanced'; end if;
 update public.financial_documents set status='POSTED',updated_at=now() where id=d.id;
 return j_id;
end $$;
revoke all on function public.post_financial_document(uuid) from public,anon;
grant execute on function public.post_financial_document(uuid) to authenticated;
