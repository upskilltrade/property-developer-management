-- Financial Core v1: approval, AP/AR accrual, settlement and account mapping.
alter table public.cost_categories add column if not exists ledger_account_id uuid references public.ledger_accounts(id);
alter table public.financial_documents add column if not exists approved_by uuid references public.profiles(id);
alter table public.financial_documents add column if not exists approved_at timestamptz;
alter table public.financial_documents add column if not exists source_document_id uuid references public.financial_documents(id);
alter table public.financial_documents add column if not exists settled_amount numeric(18,2) not null default 0 check(settled_amount>=0);
alter table public.financial_documents add column if not exists updated_at timestamptz not null default now();
create index if not exists financial_documents_source_idx on public.financial_documents(source_document_id);
create index if not exists cost_categories_ledger_idx on public.cost_categories(ledger_account_id);
update public.cost_categories c set ledger_account_id=a.id from public.ledger_accounts a where a.organization_id=c.organization_id and a.code=case when c.category_type in ('LAND','PRE_DEVELOPMENT','INFRASTRUCTURE','CONSTRUCTION','PROFESSIONAL') then '1300' else '5100' end;
-- RPC function bodies are deployed in Supabase migration financial_core_v1_approval_settlement_mapping:
-- approve_financial_document: DRAFT COMMITMENT/AP/AR -> APPROVED with manager authorization.
-- post_approved_financial_document: APPROVED AP/AR -> balanced accrual journal -> POSTED.
-- post_financial_document: PAYMENT/RECEIPT, direct or AP/AR settlement, with over-settlement protection and mapped ledger accounts.
