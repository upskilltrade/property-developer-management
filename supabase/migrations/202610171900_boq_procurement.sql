-- BOQ, cost and procurement core (MVP-ROADMAP Release 6).
-- Requirement -> PR -> RFQ (quotations) -> Comparison -> Approval -> PO -> Delivery -> Inspection.
--
-- Builds on the finance core: cost_categories are the cost codes, project_budgets holds the current
-- baseline per cost code, and financial_documents of type COMMITMENT feed "committed". A budget
-- version is a BOQ (items with qty x rate per cost code, optionally per unit); approving it (by a
-- different person) supersedes the previous version, locks its items and becomes the baseline.
-- Suppliers are partner_organizations. Quotations are commercially restricted to procurement
-- staff. PO approval follows the organization threshold (above it only the owner approves), never
-- by the PO's author, and an approved PO creates a traceable COMMITMENT document. Deliveries are
-- recorded with inspection results. Contractor progress claims are certified by a second person.

-- ---------------------------------------------------------------- permissions

create or replace function public.can_cost(target_project uuid, target_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from projects p where p.id = target_project
    and (public.can_manage_access(p.organization_id)
      or public.has_effective_permission(p.organization_id, p.id, 'COST_CONTROL', target_action)));
$$;

create or replace function public.can_procure(target_project uuid, target_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from projects p where p.id = target_project
    and (public.can_manage_access(p.organization_id)
      or public.has_effective_permission(p.organization_id, p.id, 'PROCUREMENT', target_action)));
$$;

-- ---------------------------------------------------------------- budget versions / BOQ

create table if not exists public.budget_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version int not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','SUBMITTED','APPROVED','SUPERSEDED','REJECTED')),
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  submitted_by uuid references public.profiles(id),
  submitted_at timestamptz,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  review_note text,
  unique (project_id, version)
);
create unique index if not exists budget_versions_one_open on public.budget_versions(project_id)
  where status in ('DRAFT','SUBMITTED');

create table if not exists public.boq_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  budget_version_id uuid not null references public.budget_versions(id) on delete cascade,
  cost_category_id uuid not null references public.cost_categories(id),
  unit_id uuid references public.units(id) on delete set null,
  item_code text,
  description text not null,
  uom text not null default 'LS',
  quantity numeric(18,3) not null check (quantity >= 0),
  rate numeric(18,2) not null check (rate >= 0),
  amount numeric(18,2) generated always as (round(quantity * rate, 2)) stored,
  sort_order int not null default 0,
  removed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists boq_items_version_idx on public.boq_items(budget_version_id, cost_category_id);

-- Items of a submitted/approved version never change (removal in a draft is a soft removal).
create or replace function public.guard_boq_item()
returns trigger language plpgsql as $$
declare st text;
begin
  select status into st from budget_versions where id = new.budget_version_id;
  if st <> 'DRAFT' then raise exception 'Budget version is locked'; end if;
  return new;
end $$;
create or replace trigger boq_items_guard before insert or update on public.boq_items
  for each row execute function public.guard_boq_item();

-- ---------------------------------------------------------------- procurement

create table if not exists public.procurement_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  owner_approval_above numeric(18,2) not null default 100000 check (owner_approval_above >= 0),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  cost_category_id uuid not null references public.cost_categories(id),
  pr_no text not null,
  title text not null,
  needed_by date,
  estimated_amount numeric(18,2) not null default 0 check (estimated_amount >= 0),
  status text not null default 'DRAFT' check (status in ('DRAFT','SUBMITTED','APPROVED','REJECTED','ORDERED','CANCELLED')),
  requested_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_note text,
  unique (organization_id, pr_no)
);

create table if not exists public.pr_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pr_id uuid not null references public.purchase_requests(id) on delete cascade,
  description text not null,
  quantity numeric(18,3) not null check (quantity > 0),
  uom text not null default 'EA',
  est_rate numeric(18,2) not null default 0 check (est_rate >= 0)
);

create table if not exists public.supplier_quotations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  pr_id uuid not null references public.purchase_requests(id) on delete cascade,
  partner_id uuid not null references public.partner_organizations(id),
  quote_ref text,
  amount numeric(18,2) not null check (amount > 0),
  lead_time_days int check (lead_time_days >= 0),
  valid_until date,
  notes text,
  status text not null default 'RECEIVED' check (status in ('RECEIVED','SELECTED','NOT_SELECTED')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (pr_id, partner_id)
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  cost_category_id uuid not null references public.cost_categories(id),
  pr_id uuid references public.purchase_requests(id),
  quotation_id uuid references public.supplier_quotations(id),
  partner_id uuid not null references public.partner_organizations(id),
  po_no text not null,
  amount numeric(18,2) not null check (amount > 0),
  delivery_due date,
  terms text,
  status text not null default 'PENDING_APPROVAL'
    check (status in ('PENDING_APPROVAL','APPROVED','PARTIALLY_RECEIVED','RECEIVED','REJECTED','CANCELLED')),
  needs_owner boolean not null default false,
  commitment_document_id uuid references public.financial_documents(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  decision_note text,
  unique (organization_id, po_no)
);

create table if not exists public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  gr_no text not null,
  received_on date not null default current_date,
  amount numeric(18,2) not null check (amount > 0),
  inspection text not null check (inspection in ('ACCEPTED','PARTIAL','REJECTED')),
  note text,
  received_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (organization_id, gr_no)
);

create table if not exists public.progress_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  partner_id uuid not null references public.partner_organizations(id),
  procurement_contract_id uuid references public.procurement_contracts(id),
  cost_category_id uuid references public.cost_categories(id),
  claim_no text not null,
  period_end date not null,
  claimed_amount numeric(18,2) not null check (claimed_amount > 0),
  certified_amount numeric(18,2) check (certified_amount >= 0),
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED','CERTIFIED','REJECTED')),
  note text,
  submitted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  certified_by uuid references public.profiles(id),
  certified_at timestamptz,
  certification_note text,
  unique (organization_id, claim_no)
);

alter table public.procurement_contracts add column if not exists partner_id uuid references public.partner_organizations(id);

-- ---------------------------------------------------------------- RLS

alter table public.budget_versions enable row level security;
alter table public.boq_items enable row level security;
alter table public.procurement_settings enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.pr_items enable row level security;
alter table public.supplier_quotations enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.goods_receipts enable row level security;
alter table public.progress_claims enable row level security;

-- Internal cost data: cost-control or procurement staff on the project (owners always).
create policy budget_versions_select on public.budget_versions for select to authenticated
  using (public.can_cost(project_id, 'VIEW'));
create policy boq_items_select on public.boq_items for select to authenticated
  using (exists(select 1 from budget_versions b where b.id = budget_version_id and public.can_cost(b.project_id, 'VIEW')));
create policy procurement_settings_select on public.procurement_settings for select to authenticated
  using (public.is_internal_member(organization_id));
create policy purchase_requests_select on public.purchase_requests for select to authenticated
  using (public.can_procure(project_id, 'VIEW') or public.can_cost(project_id, 'VIEW')
    or (requested_by = auth.uid() and public.can_access_project(project_id)));
create policy pr_items_select on public.pr_items for select to authenticated
  using (exists(select 1 from purchase_requests r where r.id = pr_id
    and (public.can_procure(r.project_id, 'VIEW') or public.can_cost(r.project_id, 'VIEW')
      or (r.requested_by = auth.uid() and public.can_access_project(r.project_id)))));
-- Quotations are commercially restricted: procurement staff only.
create policy supplier_quotations_select on public.supplier_quotations for select to authenticated
  using (public.can_procure(project_id, 'VIEW'));
create policy purchase_orders_select on public.purchase_orders for select to authenticated
  using (public.can_procure(project_id, 'VIEW') or public.can_cost(project_id, 'VIEW'));
create policy goods_receipts_select on public.goods_receipts for select to authenticated
  using (public.can_procure(project_id, 'VIEW') or public.can_cost(project_id, 'VIEW') or public.can_report_progress(project_id));
create policy progress_claims_select on public.progress_claims for select to authenticated
  using (public.can_cost(project_id, 'VIEW') or public.can_procure(project_id, 'VIEW'));

grant select on public.budget_versions, public.boq_items, public.procurement_settings, public.purchase_requests,
  public.pr_items, public.supplier_quotations, public.purchase_orders, public.goods_receipts, public.progress_claims
  to authenticated;

-- ---------------------------------------------------------------- RPCs: budget / BOQ

-- New draft version, starting from the current approved BOQ.
create or replace function public.create_budget_version(target_project uuid, note text)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  pr projects;
  prev budget_versions;
  n int;
  id uuid;
begin
  select * into pr from projects where projects.id = target_project;
  if not found or not (public.can_cost(pr.id, 'CREATE') or public.can_cost(pr.id, 'EDIT')) then raise exception 'Not authorized'; end if;
  select coalesce(max(version), 0) + 1 into n from budget_versions b where b.project_id = pr.id;
  select * into prev from budget_versions b where b.project_id = pr.id and b.status = 'APPROVED';
  insert into budget_versions (organization_id, project_id, version, note, created_by)
  values (pr.organization_id, pr.id, n, nullif(trim(note), ''), auth.uid())
  returning budget_versions.id into id;
  if prev.id is not null then
    insert into boq_items (organization_id, budget_version_id, cost_category_id, unit_id, item_code, description, uom, quantity, rate, sort_order)
    select x.organization_id, id, x.cost_category_id, x.unit_id, x.item_code, x.description, x.uom, x.quantity, x.rate, x.sort_order
      from boq_items x where x.budget_version_id = prev.id and x.removed_at is null;
  end if;
  return id;
end $$;

create or replace function public.upsert_boq_item(target_version uuid, target_item uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  b budget_versions;
  id uuid := target_item;
begin
  select * into b from budget_versions where budget_versions.id = target_version;
  if not found or not (public.can_cost(b.project_id, 'CREATE') or public.can_cost(b.project_id, 'EDIT')) then raise exception 'Not authorized'; end if;
  if b.status <> 'DRAFT' then raise exception 'Budget version is locked'; end if;
  if coalesce(trim(data->>'description'), '') = '' or nullif(data->>'cost_category_id', '') is null then raise exception 'Invalid item'; end if;
  if id is null then
    insert into boq_items (organization_id, budget_version_id, cost_category_id, unit_id, item_code, description, uom, quantity, rate)
    values (b.organization_id, b.id, (data->>'cost_category_id')::uuid, nullif(data->>'unit_id', '')::uuid,
      nullif(trim(data->>'item_code'), ''), trim(data->>'description'), coalesce(nullif(trim(data->>'uom'), ''), 'LS'),
      coalesce(nullif(data->>'quantity', '')::numeric, 1), coalesce(nullif(data->>'rate', '')::numeric, 0))
    returning boq_items.id into id;
  else
    update boq_items set cost_category_id = (data->>'cost_category_id')::uuid, unit_id = nullif(data->>'unit_id', '')::uuid,
      item_code = nullif(trim(data->>'item_code'), ''), description = trim(data->>'description'),
      uom = coalesce(nullif(trim(data->>'uom'), ''), 'LS'), quantity = coalesce(nullif(data->>'quantity', '')::numeric, 1),
      rate = coalesce(nullif(data->>'rate', '')::numeric, 0)
     where boq_items.id = id and budget_version_id = b.id;
    if not found then raise exception 'Not authorized'; end if;
  end if;
  return id;
end $$;

create or replace function public.remove_boq_item(target_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b budget_versions;
begin
  select v.* into b from boq_items i join budget_versions v on v.id = i.budget_version_id where i.id = target_item;
  if not found or not (public.can_cost(b.project_id, 'CREATE') or public.can_cost(b.project_id, 'EDIT')) then raise exception 'Not authorized'; end if;
  update boq_items set removed_at = now() where id = target_item;
end $$;

create or replace function public.submit_budget_version(target_version uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b budget_versions;
begin
  select * into b from budget_versions where id = target_version for update;
  if not found or not (public.can_cost(b.project_id, 'SUBMIT') or public.can_cost(b.project_id, 'EDIT')) then raise exception 'Not authorized'; end if;
  if b.status <> 'DRAFT' then raise exception 'Budget version is not a draft'; end if;
  if not exists(select 1 from boq_items where budget_version_id = b.id and removed_at is null) then raise exception 'Invalid budget'; end if;
  update budget_versions set status = 'SUBMITTED', submitted_by = auth.uid(), submitted_at = now() where id = b.id;
end $$;

-- Approval (not by the submitter, owner excepted) supersedes the old baseline and refreshes
-- project_budgets per cost code; rejection returns it to draft with the reason.
create or replace function public.decide_budget_version(target_version uuid, approve boolean, note text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare b budget_versions;
begin
  select * into b from budget_versions where id = target_version for update;
  if not found or not public.can_cost(b.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if b.status <> 'SUBMITTED' then raise exception 'Budget version is not submitted'; end if;
  if b.submitted_by = auth.uid() and not public.can_manage_access(b.organization_id) then
    raise exception 'Submitter cannot approve their own budget';
  end if;
  if not approve then
    if coalesce(trim(note), '') = '' then raise exception 'Reason required'; end if;
    update budget_versions set status = 'DRAFT', review_note = trim(note) where id = b.id;
    return;
  end if;
  update budget_versions set status = 'SUPERSEDED' where project_id = b.project_id and status = 'APPROVED';
  update budget_versions set status = 'APPROVED', approved_by = auth.uid(), approved_at = now(), review_note = nullif(trim(note), '')
   where id = b.id;
  insert into project_budgets (project_id, cost_category_id, budget_amount, updated_at)
  select b.project_id, i.cost_category_id, sum(i.amount), now() from boq_items i where i.budget_version_id = b.id and i.removed_at is null
   group by i.cost_category_id
  on conflict (project_id, cost_category_id) do update set budget_amount = excluded.budget_amount, updated_at = now();
  update project_budgets pb set budget_amount = 0, updated_at = now()
   where pb.project_id = b.project_id
     and not exists(select 1 from boq_items i where i.budget_version_id = b.id and i.removed_at is null and i.cost_category_id = pb.cost_category_id);
  perform public.log_timeline(b.organization_id, b.project_id, null, 'BUDGET_APPROVED', 'budget_version', b.id,
    'Budget v' || b.version, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------- RPCs: purchase request / quotation

create or replace function public.create_purchase_request(target_project uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pr projects;
  it jsonb;
  est numeric := 0;
  doc_no text;
  new_id uuid;
begin
  select * into pr from projects where projects.id = target_project;
  if not found or not (public.can_procure(pr.id, 'CREATE') or public.can_report_progress(pr.id)) then
    raise exception 'Not authorized';
  end if;
  if coalesce(trim(data->>'title'), '') = '' or nullif(data->>'cost_category_id', '') is null
     or coalesce(jsonb_array_length(data->'items'), 0) = 0 then
    raise exception 'Invalid request';
  end if;
  doc_no := public.next_document_no(pr.organization_id, 'PR');
  insert into purchase_requests (organization_id, project_id, unit_id, cost_category_id, pr_no, title, needed_by, requested_by)
  values (pr.organization_id, pr.id, nullif(data->>'unit_id', '')::uuid, (data->>'cost_category_id')::uuid, doc_no,
    trim(data->>'title'), nullif(data->>'needed_by', '')::date, auth.uid())
  returning purchase_requests.id into new_id;
  for it in select * from jsonb_array_elements(data->'items') loop
    if coalesce(trim(it->>'description'), '') = '' then continue; end if;
    insert into pr_items (organization_id, pr_id, description, quantity, uom, est_rate)
    values (pr.organization_id, new_id, trim(it->>'description'), coalesce(nullif(it->>'quantity', '')::numeric, 1),
      coalesce(nullif(trim(it->>'uom'), ''), 'EA'), coalesce(nullif(it->>'est_rate', '')::numeric, 0));
    est := est + coalesce(nullif(it->>'quantity', '')::numeric, 1) * coalesce(nullif(it->>'est_rate', '')::numeric, 0);
  end loop;
  update purchase_requests set estimated_amount = round(est, 2), status = 'SUBMITTED' where purchase_requests.id = new_id;
  return new_id;
end $$;

create or replace function public.decide_purchase_request(target_pr uuid, approve boolean, note text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare r purchase_requests;
begin
  select * into r from purchase_requests where id = target_pr for update;
  if not found or not public.can_procure(r.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if r.status <> 'SUBMITTED' then raise exception 'Request is not submitted'; end if;
  if r.requested_by = auth.uid() and not public.can_manage_access(r.organization_id) then
    raise exception 'Requester cannot approve their own request';
  end if;
  if not approve and coalesce(trim(note), '') = '' then raise exception 'Reason required'; end if;
  update purchase_requests set status = case when approve then 'APPROVED' else 'REJECTED' end, decided_by = auth.uid(),
    decided_at = now(), decision_note = nullif(trim(note), '')
   where id = r.id;
end $$;

create or replace function public.add_quotation(target_pr uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r purchase_requests;
  id uuid;
begin
  select * into r from purchase_requests where purchase_requests.id = target_pr;
  if not found or not (public.can_procure(r.project_id, 'CREATE') or public.can_procure(r.project_id, 'EDIT')) then
    raise exception 'Not authorized';
  end if;
  if r.status <> 'APPROVED' then raise exception 'Request is not approved'; end if;
  if not exists(select 1 from partner_organizations p where p.id = nullif(data->>'partner_id', '')::uuid
                and p.organization_id = r.organization_id and p.status = 'ACTIVE') then
    raise exception 'Invalid supplier';
  end if;
  insert into supplier_quotations (organization_id, project_id, pr_id, partner_id, quote_ref, amount, lead_time_days, valid_until, notes, created_by)
  values (r.organization_id, r.project_id, r.id, (data->>'partner_id')::uuid, nullif(trim(data->>'quote_ref'), ''),
    (data->>'amount')::numeric, nullif(data->>'lead_time_days', '')::int, nullif(data->>'valid_until', '')::date,
    nullif(trim(data->>'notes'), ''), auth.uid())
  returning supplier_quotations.id into id;
  return id;
end $$;

-- ---------------------------------------------------------------- RPCs: purchase order

-- PO from the chosen quotation; others on the PR are marked NOT_SELECTED.
create or replace function public.create_po_from_quotation(target_quotation uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  q supplier_quotations;
  r purchase_requests;
  threshold numeric;
  doc_no text;
  id uuid;
begin
  select * into q from supplier_quotations where supplier_quotations.id = target_quotation for update;
  if not found or not public.can_procure(q.project_id, 'CREATE') then raise exception 'Not authorized'; end if;
  select * into r from purchase_requests where purchase_requests.id = q.pr_id for update;
  if r.status <> 'APPROVED' then raise exception 'Request is not approved'; end if;
  select owner_approval_above into threshold from procurement_settings where organization_id = q.organization_id;
  doc_no := public.next_document_no(q.organization_id, 'PO');
  insert into purchase_orders (organization_id, project_id, unit_id, cost_category_id, pr_id, quotation_id, partner_id, po_no,
    amount, delivery_due, terms, needs_owner, created_by)
  values (q.organization_id, q.project_id, r.unit_id, r.cost_category_id, r.id, q.id, q.partner_id, doc_no, q.amount,
    nullif(data->>'delivery_due', '')::date, nullif(trim(data->>'terms'), ''), q.amount > coalesce(threshold, 100000), auth.uid())
  returning purchase_orders.id into id;
  update supplier_quotations set status = case when supplier_quotations.id = q.id then 'SELECTED' else 'NOT_SELECTED' end
   where pr_id = r.id;
  update purchase_requests set status = 'ORDERED' where purchase_requests.id = r.id;
  return id;
end $$;

-- Authority: never the PO author; above the organization threshold only the owner.
-- Approval creates the COMMITMENT document that the cost report counts as committed.
create or replace function public.decide_purchase_order(target_po uuid, approve boolean, note text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  po purchase_orders;
  partner_name text;
  doc uuid;
begin
  select * into po from purchase_orders where id = target_po for update;
  if not found or not public.can_procure(po.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if po.status <> 'PENDING_APPROVAL' then raise exception 'Order is not pending'; end if;
  if po.created_by = auth.uid() and not public.can_manage_access(po.organization_id) then
    raise exception 'Author cannot approve their own order';
  end if;
  if po.needs_owner and not public.can_manage_access(po.organization_id) then
    raise exception 'Above approval limit';
  end if;
  if not approve then
    if coalesce(trim(note), '') = '' then raise exception 'Reason required'; end if;
    update purchase_orders set status = 'REJECTED', decision_note = trim(note), approved_by = auth.uid(), approved_at = now() where id = po.id;
    update purchase_requests set status = 'APPROVED' where id = po.pr_id;
    update supplier_quotations set status = 'RECEIVED' where pr_id = po.pr_id;
    return;
  end if;
  select name into partner_name from partner_organizations where id = po.partner_id;
  insert into financial_documents (organization_id, project_id, unit_id, document_type, document_no, document_date,
    counterparty_type, counterparty_name, cost_category_id, amount, status, reference, description, created_by, approved_by, approved_at, due_date)
  values (po.organization_id, po.project_id, po.unit_id, 'COMMITMENT', po.po_no, current_date, 'SUPPLIER', partner_name,
    po.cost_category_id, po.amount, 'APPROVED', po.po_no, 'Purchase order ' || po.po_no, po.created_by, auth.uid(), now(), po.delivery_due)
  returning id into doc;
  update purchase_orders set status = 'APPROVED', approved_by = auth.uid(), approved_at = now(),
    decision_note = nullif(trim(note), ''), commitment_document_id = doc
   where id = po.id;
  perform public.log_timeline(po.organization_id, po.project_id, po.unit_id, 'PO_APPROVED', 'purchase_order', po.id,
    po.po_no || ' · ' || partner_name, jsonb_build_object('amount', po.amount));
end $$;

create or replace function public.receive_purchase_order(target_po uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  po purchase_orders;
  received numeric;
  doc_no text;
  id uuid;
begin
  select * into po from purchase_orders where purchase_orders.id = target_po for update;
  if not found or not (public.can_procure(po.project_id, 'EDIT') or public.can_report_progress(po.project_id)) then
    raise exception 'Not authorized';
  end if;
  if po.status not in ('APPROVED','PARTIALLY_RECEIVED') then raise exception 'Order is not open'; end if;
  if nullif(data->>'amount', '')::numeric is null or (data->>'amount')::numeric <= 0
     or upper(coalesce(data->>'inspection', '')) not in ('ACCEPTED','PARTIAL','REJECTED') then
    raise exception 'Invalid receipt';
  end if;
  doc_no := public.next_document_no(po.organization_id, 'GR');
  insert into goods_receipts (organization_id, project_id, po_id, gr_no, received_on, amount, inspection, note, received_by)
  values (po.organization_id, po.project_id, po.id, doc_no, coalesce(nullif(data->>'received_on', '')::date, current_date),
    (data->>'amount')::numeric, upper(data->>'inspection'), nullif(trim(data->>'note'), ''), auth.uid())
  returning goods_receipts.id into id;
  select coalesce(sum(amount), 0) into received from goods_receipts where po_id = po.id and inspection <> 'REJECTED';
  update purchase_orders set status = case when received >= po.amount then 'RECEIVED' else 'PARTIALLY_RECEIVED' end
   where purchase_orders.id = po.id;
  return id;
end $$;

create or replace function public.cancel_purchase_order(target_po uuid, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare po purchase_orders;
begin
  select * into po from purchase_orders where id = target_po for update;
  if not found or not public.can_procure(po.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if po.status not in ('PENDING_APPROVAL','APPROVED') then raise exception 'Order is not open'; end if;
  if exists(select 1 from goods_receipts g where g.po_id = po.id) then raise exception 'Order has deliveries'; end if;
  if coalesce(trim(reason), '') = '' then raise exception 'Reason required'; end if;
  update purchase_orders set status = 'CANCELLED', decision_note = trim(reason) where id = po.id;
  if po.commitment_document_id is not null then
    update financial_documents set status = 'VOID', updated_at = now() where id = po.commitment_document_id;
  end if;
  update purchase_requests set status = 'CANCELLED' where id = po.pr_id;
end $$;

create or replace function public.set_procurement_threshold(target_org uuid, amount numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_access(target_org) then raise exception 'Not authorized'; end if;
  if amount is null or amount < 0 then raise exception 'Invalid amount'; end if;
  insert into procurement_settings (organization_id, owner_approval_above, updated_by, updated_at)
  values (target_org, amount, auth.uid(), now())
  on conflict (organization_id) do update set owner_approval_above = excluded.owner_approval_above,
    updated_by = excluded.updated_by, updated_at = now();
end $$;

-- ---------------------------------------------------------------- RPCs: progress claims

create or replace function public.submit_progress_claim(target_project uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pr projects;
  doc_no text;
  id uuid;
begin
  select * into pr from projects where projects.id = target_project;
  if not found or not (public.can_cost(pr.id, 'CREATE') or public.can_cost(pr.id, 'EDIT') or public.can_procure(pr.id, 'CREATE')) then
    raise exception 'Not authorized';
  end if;
  if not exists(select 1 from partner_organizations p where p.id = nullif(data->>'partner_id', '')::uuid and p.organization_id = pr.organization_id)
     or nullif(data->>'claimed_amount', '')::numeric is null or (data->>'claimed_amount')::numeric <= 0 then
    raise exception 'Invalid claim';
  end if;
  doc_no := public.next_document_no(pr.organization_id, 'CLM');
  insert into progress_claims (organization_id, project_id, partner_id, procurement_contract_id, cost_category_id, claim_no,
    period_end, claimed_amount, note, submitted_by)
  values (pr.organization_id, pr.id, (data->>'partner_id')::uuid, nullif(data->>'procurement_contract_id', '')::uuid,
    nullif(data->>'cost_category_id', '')::uuid, doc_no, coalesce(nullif(data->>'period_end', '')::date, current_date),
    (data->>'claimed_amount')::numeric, nullif(trim(data->>'note'), ''), auth.uid())
  returning progress_claims.id into id;
  return id;
end $$;

-- Certification (work verified on site) by someone other than the person who entered the claim.
create or replace function public.certify_progress_claim(target_claim uuid, certified numeric, note text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare c progress_claims;
begin
  select * into c from progress_claims where id = target_claim for update;
  if not found or not public.can_cost(c.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if c.status <> 'SUBMITTED' then raise exception 'Claim is not submitted'; end if;
  if c.submitted_by = auth.uid() and not public.can_manage_access(c.organization_id) then
    raise exception 'Submitter cannot certify their own claim';
  end if;
  if certified is null or certified < 0 or certified > c.claimed_amount then raise exception 'Invalid amount'; end if;
  update progress_claims set status = case when certified = 0 then 'REJECTED' else 'CERTIFIED' end,
    certified_amount = certified, certified_by = auth.uid(), certified_at = now(), certification_note = nullif(trim(note), '')
   where id = c.id;
end $$;

-- ---------------------------------------------------------------- cost report

-- Per cost code: approved baseline, committed (COMMITMENT documents not void), actual (posted
-- payments), certified claims, forecast and variance. Optional unit filter.
create or replace function public.get_cost_report(target_project uuid, target_unit uuid default null)
returns table(cost_category_id uuid, code text, name text, baseline numeric, committed numeric, actual numeric,
  certified numeric, forecast numeric, variance numeric)
language sql stable security definer set search_path = public as $$
  with p as (select * from projects where id = target_project and public.can_cost(target_project, 'VIEW')),
  bv as (select b.id from budget_versions b join p on p.id = b.project_id where b.status = 'APPROVED'),
  base as (select i.cost_category_id, sum(i.amount) amt from boq_items i join bv on bv.id = i.budget_version_id
            where i.removed_at is null and (target_unit is null or i.unit_id = target_unit) group by 1),
  docs as (select d.cost_category_id,
             sum(case when d.document_type = 'COMMITMENT' and d.status <> 'VOID' then d.amount else 0 end) committed,
             sum(case when d.document_type = 'PAYMENT' and d.status = 'POSTED' then d.amount else 0 end) actual
           from financial_documents d join p on p.id = d.project_id
          where target_unit is null or d.unit_id = target_unit group by 1),
  claims as (select c.cost_category_id, sum(coalesce(c.certified_amount, 0)) amt from progress_claims c join p on p.id = c.project_id
              where c.status = 'CERTIFIED' and target_unit is null group by 1),
  fc as (select pb.cost_category_id, pb.forecast_amount from project_budgets pb join p on p.id = pb.project_id where target_unit is null)
  select cc.id, cc.code, cc.name,
         coalesce(base.amt, 0), coalesce(docs.committed, 0), coalesce(docs.actual, 0), coalesce(claims.amt, 0),
         greatest(coalesce(nullif(fc.forecast_amount, 0), 0), coalesce(base.amt, 0), coalesce(docs.committed, 0), coalesce(docs.actual, 0)),
         coalesce(base.amt, 0) - greatest(coalesce(nullif(fc.forecast_amount, 0), 0), coalesce(base.amt, 0), coalesce(docs.committed, 0), coalesce(docs.actual, 0))
    from cost_categories cc join p on p.organization_id = cc.organization_id
    left join base on base.cost_category_id = cc.id
    left join docs on docs.cost_category_id = cc.id
    left join claims on claims.cost_category_id = cc.id
    left join fc on fc.cost_category_id = cc.id
   where cc.active or base.amt is not null or docs.committed is not null
   order by cc.code;
$$;

-- ---------------------------------------------------------------- grants

do $$
declare f text;
begin
  foreach f in array array[
    'can_cost(uuid, text)', 'can_procure(uuid, text)',
    'create_budget_version(uuid, text)', 'upsert_boq_item(uuid, uuid, jsonb)', 'remove_boq_item(uuid)',
    'submit_budget_version(uuid)', 'decide_budget_version(uuid, boolean, text)',
    'create_purchase_request(uuid, jsonb)', 'decide_purchase_request(uuid, boolean, text)', 'add_quotation(uuid, jsonb)',
    'create_po_from_quotation(uuid, jsonb)', 'decide_purchase_order(uuid, boolean, text)',
    'receive_purchase_order(uuid, jsonb)', 'cancel_purchase_order(uuid, text)', 'set_procurement_threshold(uuid, numeric)',
    'submit_progress_claim(uuid, jsonb)', 'certify_progress_claim(uuid, numeric, text)',
    'get_cost_report(uuid, uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
