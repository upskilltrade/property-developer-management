alter table public.financial_documents add column if not exists tax_invoice_no text;
alter table public.financial_documents add column if not exists tax_invoice_date date;
alter table public.financial_documents add column if not exists counterparty_tax_id text;
alter table public.financial_documents add column if not exists vat_rate numeric(7,4) not null default 0 check(vat_rate>=0 and vat_rate<=100);
alter table public.financial_documents add column if not exists vat_amount numeric(18,2) not null default 0 check(vat_amount>=0);
alter table public.financial_documents add column if not exists wht_rate numeric(7,4) not null default 0 check(wht_rate>=0 and wht_rate<=100);
alter table public.financial_documents add column if not exists wht_amount numeric(18,2) not null default 0 check(wht_amount>=0);
alter table public.financial_documents add column if not exists tax_base_amount numeric(18,2) check(tax_base_amount is null or tax_base_amount>=0);
alter table public.financial_documents add column if not exists net_payable_amount numeric(18,2) check(net_payable_amount is null or net_payable_amount>=0);
create index if not exists financial_documents_tax_invoice_idx on public.financial_documents(organization_id,tax_invoice_no) where tax_invoice_no is not null;
insert into public.ledger_accounts(organization_id,code,name,account_type)
select o.id,x.code,x.name,x.account_type from organizations o cross join (values
('1150','Input VAT','ASSET'),('2150','Output VAT','LIABILITY'),('2160','Withholding Tax Payable','LIABILITY'),('1250','Withholding Tax Receivable','ASSET')
) x(code,name,account_type)
where not exists(select 1 from ledger_accounts l where l.organization_id=o.id and l.code=x.code);