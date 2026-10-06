-- Financial Core v1 procurement source documents.
create table if not exists public.procurement_contracts(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), project_id uuid not null references public.projects(id),
 contract_no text not null, contract_type text not null check(contract_type in ('PO','CONTRACT')), vendor_name text not null, cost_category_id uuid references public.cost_categories(id),
 contract_date date not null default current_date, amount numeric(18,2) not null check(amount>0), status text not null default 'DRAFT' check(status in ('DRAFT','APPROVED','CLOSED','CANCELLED')),
 description text, created_by uuid references public.profiles(id), approved_by uuid references public.profiles(id), approved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(project_id,contract_no));
alter table public.procurement_contracts enable row level security;
create policy procurement_contracts_select on public.procurement_contracts for select to authenticated using(public.can_access_project(project_id));
create policy procurement_contracts_insert on public.procurement_contracts for insert to authenticated with check(public.can_manage_organization(organization_id) and public.can_access_project(project_id));
create policy procurement_contracts_update on public.procurement_contracts for update to authenticated using(public.can_manage_organization(organization_id) and public.can_access_project(project_id)) with check(public.can_manage_organization(organization_id) and public.can_access_project(project_id));
alter table public.financial_documents add column if not exists procurement_contract_id uuid references public.procurement_contracts(id);
create index if not exists procurement_contracts_project_idx on public.procurement_contracts(project_id,status);
create index if not exists financial_documents_contract_idx on public.financial_documents(procurement_contract_id);
-- approve_procurement_contract RPC is deployed with this migration in Supabase; approval creates an APPROVED COMMITMENT for the full PO/Contract amount.
