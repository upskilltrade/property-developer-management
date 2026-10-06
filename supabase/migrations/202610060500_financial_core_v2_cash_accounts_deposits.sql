create table if not exists public.cash_accounts(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), code text not null, name text not null,
 account_kind text not null check(account_kind in('BANK','CASH')), bank_name text, account_number_masked text, currency_code text not null default 'THB',
 ledger_account_id uuid not null references ledger_accounts(id), opening_balance numeric(18,2) not null default 0, opening_date date not null default current_date,
 active boolean not null default true, created_at timestamptz not null default now(), unique(organization_id,code));
alter table public.cash_accounts enable row level security;
create policy "cash_accounts_select" on public.cash_accounts for select to authenticated using(is_org_member(organization_id));
create policy "cash_accounts_insert" on public.cash_accounts for insert to authenticated with check(can_manage_organization(organization_id));
create policy "cash_accounts_update" on public.cash_accounts for update to authenticated using(can_manage_organization(organization_id)) with check(can_manage_organization(organization_id));
alter table public.financial_documents add column if not exists cash_account_id uuid references public.cash_accounts(id);
alter table public.financial_documents add column if not exists receipt_purpose text check(receipt_purpose is null or receipt_purpose in('AR_SETTLEMENT','CUSTOMER_DEPOSIT','DIRECT_REVENUE'));
create index if not exists financial_documents_cash_account_idx on public.financial_documents(cash_account_id);
insert into public.ledger_accounts(organization_id,code,name,account_type) select o.id,'2200','Customer Deposits / Deferred Revenue','LIABILITY' from organizations o where not exists(select 1 from ledger_accounts l where l.organization_id=o.id and l.code='2200');
insert into public.cash_accounts(organization_id,code,name,account_kind,currency_code,ledger_account_id,opening_balance,opening_date) select l.organization_id,'BANK-001','Primary Bank Account','BANK','THB',l.id,0,current_date from ledger_accounts l where l.code='1100' and not exists(select 1 from cash_accounts c where c.organization_id=l.organization_id);