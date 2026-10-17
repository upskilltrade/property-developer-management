-- Change / variation control (MVP-ROADMAP Release 5).
-- Request -> Scope -> Cost/Time -> Internal approval -> Customer approval -> Payment condition
-- -> Revision -> Release -> Execute -> Close.
--
-- change_requests capture the original ask (from a customer in the portal or from staff/site).
-- variation_orders carry the controlled change; every edit while DRAFT appends a vo_versions row
-- (original scope, revised scope, contractor cost delta, customer price delta, time delta), and
-- versions are immutable. Approvals (internal by someone other than the author, then the customer
-- for customer-facing VOs) are append-only and reference the exact version. A customer approval
-- with a price delta creates a payment-schedule installment; release can require it to be paid and
-- requires a linked drawing revision to be RELEASED. Release adds the work to the unit schedule
-- (assigned to the contractor), pushes handover by the time delta, raises the unit budget by the
-- cost delta and issues a site instruction, so site can see what is released for execution.

-- ---------------------------------------------------------------- tables

create table if not exists public.change_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  cr_no text not null,
  source text not null check (source in ('CUSTOMER','DEVELOPER','DESIGN','SITE','CONTRACTOR','AUTHORITY')),
  title text not null,
  description text not null,
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED','UNDER_REVIEW','CONVERTED','REJECTED','WITHDRAWN')),
  requested_by uuid references public.profiles(id),
  requested_by_customer boolean not null default false,
  decision_note text,
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, cr_no)
);

create table if not exists public.variation_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  change_request_id uuid references public.change_requests(id) on delete set null,
  vo_no text not null,
  title text not null,
  customer_facing boolean not null default true,
  partner_id uuid references public.partner_organizations(id),
  drawing_revision_id uuid references public.drawing_revisions(id),
  requires_payment_before_release boolean not null default false,
  payment_due_days int not null default 7 check (payment_due_days between 0 and 365),
  status text not null default 'DRAFT' check (status in
    ('DRAFT','PENDING_INTERNAL','INTERNAL_APPROVED','OFFERED','CUSTOMER_APPROVED','CUSTOMER_REJECTED','RELEASED','CLOSED','CANCELLED')),
  current_version int not null default 1,
  approved_version int,
  payment_schedule_id uuid references public.payment_schedules(id),
  schedule_activity_id uuid references public.schedule_activities(id) on delete set null,
  site_instruction_id uuid references public.site_instructions(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  released_by uuid references public.profiles(id),
  released_at timestamptz,
  closed_at timestamptz,
  cancel_reason text,
  unique (organization_id, vo_no)
);

create table if not exists public.vo_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vo_id uuid not null references public.variation_orders(id) on delete cascade,
  version int not null,
  original_scope text not null,
  revised_scope text not null,
  cost_delta numeric(18,2) not null default 0,
  price_delta numeric(18,2) not null default 0,
  time_delta_days int not null default 0 check (time_delta_days between -365 and 365),
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (vo_id, version)
);

create table if not exists public.vo_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vo_id uuid not null references public.variation_orders(id) on delete cascade,
  version int not null,
  stage text not null check (stage in ('INTERNAL','CUSTOMER')),
  decision text not null check (decision in ('APPROVED','REJECTED')),
  price_delta numeric(18,2) not null,
  time_delta_days int not null,
  comment text,
  decided_by uuid references public.profiles(id),
  decided_at timestamptz not null default now()
);

create or replace function public.reject_vo_history_change()
returns trigger language plpgsql as $$
begin
  raise exception 'Variation history is immutable';
end $$;
create or replace trigger vo_versions_immutable before update or delete on public.vo_versions
  for each row execute function public.reject_vo_history_change();
create or replace trigger vo_approvals_immutable before update or delete on public.vo_approvals
  for each row execute function public.reject_vo_history_change();

-- ---------------------------------------------------------------- RLS

alter table public.change_requests enable row level security;
alter table public.variation_orders enable row level security;
alter table public.vo_versions enable row level security;
alter table public.vo_approvals enable row level security;

-- Staff on the project; the customer sees requests on their unit and VOs offered to them;
-- the assigned contractor sees released VOs (cost, never price, via the version policy below).
create policy change_requests_select on public.change_requests for select to authenticated
  using (public.can_access_project(project_id) or (unit_id is not null and public.is_unit_customer(unit_id)));
create policy variation_orders_select on public.variation_orders for select to authenticated
  using (public.can_access_project(project_id)
    or (customer_facing and unit_id is not null and public.is_unit_customer(unit_id)
        and status in ('OFFERED','CUSTOMER_APPROVED','CUSTOMER_REJECTED','RELEASED','CLOSED'))
    or (status in ('RELEASED','CLOSED') and coalesce(partner_id in (select public.my_partner_ids()), false)));
create policy vo_versions_select on public.vo_versions for select to authenticated
  using (exists(select 1 from variation_orders v where v.id = vo_id
    and (public.can_access_project(v.project_id)
      or (v.customer_facing and v.unit_id is not null and public.is_unit_customer(v.unit_id)
          and v.status in ('OFFERED','CUSTOMER_APPROVED','CUSTOMER_REJECTED','RELEASED','CLOSED')
          and version = v.current_version))));
create policy vo_approvals_select on public.vo_approvals for select to authenticated
  using (exists(select 1 from variation_orders v where v.id = vo_id
    and (public.can_access_project(v.project_id)
      or (v.customer_facing and v.unit_id is not null and public.is_unit_customer(v.unit_id) and stage = 'CUSTOMER'))));

grant select on public.change_requests, public.variation_orders, public.vo_versions, public.vo_approvals to authenticated;

-- ---------------------------------------------------------------- helpers

create or replace function public.can_vary(target_project uuid, target_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_schedule(target_project, target_action) or public.can_sell(target_project, target_action)
    or public.can_design(target_project, target_action);
$$;

create or replace function public.vo_log(v variation_orders, kind text, title text)
returns void language sql security definer set search_path = public as $$
  select public.log_timeline(v.organization_id, v.project_id, v.unit_id, kind, 'variation_order', v.id,
    v.vo_no || coalesce(' · ' || title, ''), '{}'::jsonb);
$$;
revoke all on function public.vo_log(variation_orders, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- RPCs: change request

-- Customers submit for their own unit; staff submit with any source.
create or replace function public.submit_change_request(target_project uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pr projects;
  un uuid := nullif(data->>'unit_id', '')::uuid;
  as_customer boolean := false;
  src text := upper(coalesce(nullif(data->>'source', ''), 'DEVELOPER'));
  doc_no text;
  id uuid;
begin
  -- Customers don't see project ids; the unit identifies the project.
  select * into pr from projects
   where projects.id = coalesce(target_project, (select u.project_id from units u where u.id = un));
  if not found then raise exception 'Not authorized'; end if;
  if not public.can_access_project(pr.id) then
    if un is null or not public.is_unit_customer(un) then raise exception 'Not authorized'; end if;
    as_customer := true;
    src := 'CUSTOMER';
  end if;
  if un is not null and not exists(select 1 from units u where u.id = un and u.project_id = pr.id) then
    raise exception 'Invalid unit';
  end if;
  if coalesce(trim(data->>'title'), '') = '' or coalesce(trim(data->>'description'), '') = '' then
    raise exception 'Invalid request';
  end if;
  doc_no := public.next_document_no(pr.organization_id, 'CR');
  insert into change_requests (organization_id, project_id, unit_id, cr_no, source, title, description, requested_by, requested_by_customer)
  values (pr.organization_id, pr.id, un, doc_no, src, trim(data->>'title'), trim(data->>'description'), auth.uid(), as_customer)
  returning change_requests.id into id;
  perform public.log_timeline(pr.organization_id, pr.id, un, 'CHANGE_REQUESTED', 'change_request', id,
    doc_no || ' · ' || trim(data->>'title'), '{}'::jsonb);
  return id;
end $$;

create or replace function public.decide_change_request(target_cr uuid, decision text, note text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare c change_requests;
begin
  select * into c from change_requests where id = target_cr for update;
  if not found or not public.can_vary(c.project_id, 'EDIT') then raise exception 'Not authorized'; end if;
  if c.status not in ('SUBMITTED','UNDER_REVIEW') then raise exception 'Request is closed'; end if;
  if decision = 'REVIEW' then
    update change_requests set status = 'UNDER_REVIEW' where id = c.id;
  elsif decision = 'REJECT' then
    if coalesce(trim(note), '') = '' then raise exception 'Reason required'; end if;
    update change_requests set status = 'REJECTED', decision_note = trim(note), decided_by = auth.uid(), decided_at = now()
     where id = c.id;
  else
    raise exception 'Invalid decision';
  end if;
end $$;

-- ---------------------------------------------------------------- RPCs: variation order

create or replace function public.create_variation(target_project uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pr projects;
  cr change_requests;
  un uuid := nullif(data->>'unit_id', '')::uuid;
  doc_no text;
  v variation_orders;
begin
  select * into pr from projects where projects.id = target_project;
  if not found or not public.can_vary(pr.id, 'EDIT') then raise exception 'Not authorized'; end if;
  if nullif(data->>'change_request_id', '') is not null then
    select * into cr from change_requests where change_requests.id = (data->>'change_request_id')::uuid
      and project_id = pr.id for update;
    if not found or cr.status not in ('SUBMITTED','UNDER_REVIEW') then raise exception 'Invalid request'; end if;
    un := coalesce(un, cr.unit_id);
  end if;
  if coalesce(trim(data->>'title'), '') = '' or coalesce(trim(data->>'revised_scope'), '') = '' then
    raise exception 'Invalid variation';
  end if;
  doc_no := public.next_document_no(pr.organization_id, 'VO');
  insert into variation_orders (organization_id, project_id, unit_id, change_request_id, vo_no, title, customer_facing,
    partner_id, requires_payment_before_release, payment_due_days, created_by)
  values (pr.organization_id, pr.id, un, cr.id, doc_no, trim(data->>'title'),
    coalesce((data->>'customer_facing')::boolean, cr.id is not null and cr.source = 'CUSTOMER', true),
    nullif(data->>'partner_id', '')::uuid, coalesce((data->>'requires_payment_before_release')::boolean, false),
    coalesce(nullif(data->>'payment_due_days', '')::int, 7), auth.uid())
  returning * into v;
  insert into vo_versions (organization_id, vo_id, version, original_scope, revised_scope, cost_delta, price_delta,
    time_delta_days, note, created_by)
  values (v.organization_id, v.id, 1, coalesce(nullif(trim(data->>'original_scope'), ''), cr.description, '-'),
    trim(data->>'revised_scope'), coalesce(nullif(data->>'cost_delta', '')::numeric, 0),
    coalesce(nullif(data->>'price_delta', '')::numeric, 0), coalesce(nullif(data->>'time_delta_days', '')::int, 0),
    nullif(trim(data->>'note'), ''), auth.uid());
  if cr.id is not null then update change_requests set status = 'CONVERTED', decided_by = auth.uid(), decided_at = now() where change_requests.id = cr.id; end if;
  perform public.vo_log(v, 'VO_CREATED', v.title);
  return v.id;
end $$;

-- Draft edits append a version; nothing already written is changed.
create or replace function public.revise_variation(target_vo uuid, data jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v variation_orders;
begin
  select * into v from variation_orders where id = target_vo for update;
  if not found or not public.can_vary(v.project_id, 'EDIT') then raise exception 'Not authorized'; end if;
  if v.status not in ('DRAFT','CUSTOMER_REJECTED') then raise exception 'Variation is locked'; end if;
  if coalesce(trim(data->>'revised_scope'), '') = '' then raise exception 'Invalid variation'; end if;
  insert into vo_versions (organization_id, vo_id, version, original_scope, revised_scope, cost_delta, price_delta,
    time_delta_days, note, created_by)
  select v.organization_id, v.id, v.current_version + 1, coalesce(nullif(trim(data->>'original_scope'), ''), x.original_scope),
    trim(data->>'revised_scope'), coalesce(nullif(data->>'cost_delta', '')::numeric, 0),
    coalesce(nullif(data->>'price_delta', '')::numeric, 0), coalesce(nullif(data->>'time_delta_days', '')::int, 0),
    nullif(trim(data->>'note'), ''), auth.uid()
    from vo_versions x where x.vo_id = v.id and x.version = v.current_version;
  update variation_orders set current_version = v.current_version + 1, status = 'DRAFT',
    partner_id = coalesce(nullif(data->>'partner_id', '')::uuid, partner_id),
    drawing_revision_id = coalesce(nullif(data->>'drawing_revision_id', '')::uuid, drawing_revision_id),
    requires_payment_before_release = coalesce((data->>'requires_payment_before_release')::boolean, requires_payment_before_release),
    updated_at = now()
   where id = v.id;
  return v.current_version + 1;
end $$;

-- Link the drawing revision that implements the change (any status; release checks it is RELEASED).
create or replace function public.link_variation_drawing(target_vo uuid, target_revision uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v variation_orders;
begin
  select * into v from variation_orders where id = target_vo for update;
  if not found or not public.can_vary(v.project_id, 'EDIT') then raise exception 'Not authorized'; end if;
  if v.status in ('RELEASED','CLOSED','CANCELLED') then raise exception 'Variation is locked'; end if;
  if target_revision is not null and not exists(select 1 from drawing_revisions r where r.id = target_revision and r.project_id = v.project_id) then
    raise exception 'Invalid drawing';
  end if;
  update variation_orders set drawing_revision_id = target_revision, updated_at = now() where id = v.id;
end $$;

create or replace function public.submit_variation(target_vo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v variation_orders;
begin
  select * into v from variation_orders where id = target_vo for update;
  if not found or not public.can_vary(v.project_id, 'EDIT') then raise exception 'Not authorized'; end if;
  if v.status <> 'DRAFT' then raise exception 'Variation is not a draft'; end if;
  update variation_orders set status = 'PENDING_INTERNAL', updated_at = now() where id = v.id;
  perform public.vo_log(v, 'VO_SUBMITTED', null);
end $$;

-- Internal approval by someone other than the version author (the organization owner excepted).
create or replace function public.approve_variation_internal(target_vo uuid, approve boolean, comment text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  v variation_orders;
  x vo_versions;
begin
  select * into v from variation_orders where id = target_vo for update;
  if not found or not public.can_vary(v.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if v.status <> 'PENDING_INTERNAL' then raise exception 'Variation is not pending'; end if;
  select * into x from vo_versions where vo_id = v.id and version = v.current_version;
  if x.created_by = auth.uid() and not public.can_manage_access(v.organization_id) then
    raise exception 'Author cannot approve their own variation';
  end if;
  if not approve and coalesce(trim(comment), '') = '' then raise exception 'Reason required'; end if;
  insert into vo_approvals (organization_id, vo_id, version, stage, decision, price_delta, time_delta_days, comment, decided_by)
  values (v.organization_id, v.id, v.current_version, 'INTERNAL', case when approve then 'APPROVED' else 'REJECTED' end,
    x.price_delta, x.time_delta_days, nullif(trim(comment), ''), auth.uid());
  if approve then
    update variation_orders set status = case when v.customer_facing and v.unit_id is not null then 'OFFERED' else 'INTERNAL_APPROVED' end,
      approved_version = case when v.customer_facing and v.unit_id is not null then null else v.current_version end,
      updated_at = now()
     where id = v.id;
    perform public.vo_log(v, case when v.customer_facing and v.unit_id is not null then 'VO_OFFERED' else 'VO_APPROVED' end, null);
  else
    update variation_orders set status = 'DRAFT', updated_at = now() where id = v.id;
  end if;
end $$;

-- Customer decision on the offered version. Approval with a price delta adds an installment.
create or replace function public.customer_decide_variation(target_vo uuid, approve boolean, comment text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  v variation_orders;
  x vo_versions;
  cust uuid;
  seq int;
  sched uuid;
begin
  select * into v from variation_orders where id = target_vo for update;
  if not found or v.unit_id is null or not public.is_unit_customer(v.unit_id) then raise exception 'Not authorized'; end if;
  if v.status <> 'OFFERED' then raise exception 'Variation is not offered'; end if;
  if not approve and coalesce(trim(comment), '') = '' then raise exception 'Comment required'; end if;
  select * into x from vo_versions where vo_id = v.id and version = v.current_version;
  insert into vo_approvals (organization_id, vo_id, version, stage, decision, price_delta, time_delta_days, comment, decided_by)
  values (v.organization_id, v.id, v.current_version, 'CUSTOMER', case when approve then 'APPROVED' else 'REJECTED' end,
    x.price_delta, x.time_delta_days, nullif(trim(comment), ''), auth.uid());
  if approve then
    if x.price_delta > 0 then
      select customer_id into cust from unit_sales where unit_id = v.unit_id;
      select coalesce(max(sequence), 0) + 1 into seq from payment_schedules where unit_id = v.unit_id and status = 'ACTIVE';
      insert into payment_schedules (organization_id, project_id, unit_id, customer_id, sequence, kind, label_th, label_en, amount, due_date, created_by)
      values (v.organization_id, v.project_id, v.unit_id, cust, seq, 'OTHER', 'งานเปลี่ยนแปลง ' || v.vo_no, 'Variation ' || v.vo_no,
        x.price_delta, current_date + v.payment_due_days, auth.uid())
      returning id into sched;
    end if;
    update variation_orders set status = 'CUSTOMER_APPROVED', approved_version = v.current_version,
      payment_schedule_id = sched, updated_at = now()
     where id = v.id;
    perform public.vo_log(v, 'VO_CUSTOMER_APPROVED', null);
  else
    update variation_orders set status = 'CUSTOMER_REJECTED', updated_at = now() where id = v.id;
    perform public.vo_log(v, 'VO_CUSTOMER_REJECTED', null);
  end if;
end $$;

-- Release for execution: checks payment condition and drawing, then updates schedule, budget and site.
create or replace function public.release_variation(target_vo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v variation_orders;
  x vo_versions;
  act uuid;
  si uuid;
  milestone schedule_activities;
  si_no text;
begin
  select * into v from variation_orders where id = target_vo for update;
  if not found or not public.can_vary(v.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if v.status not in ('INTERNAL_APPROVED','CUSTOMER_APPROVED') then raise exception 'Variation is not approved'; end if;
  if v.requires_payment_before_release and v.payment_schedule_id is not null
     and not exists(select 1 from payment_schedule_status s where s.id = v.payment_schedule_id and s.payment_status = 'PAID') then
    raise exception 'Payment condition not met';
  end if;
  if v.drawing_revision_id is not null
     and not exists(select 1 from drawing_revisions r where r.id = v.drawing_revision_id and r.status = 'RELEASED') then
    raise exception 'Drawing revision not released';
  end if;
  select * into x from vo_versions where vo_id = v.id and version = v.approved_version;

  if v.unit_id is not null then
    -- Budget: contractor cost impact.
    if x.cost_delta <> 0 then
      insert into unit_financials (unit_id, budget_amount) values (v.unit_id, x.cost_delta)
      on conflict (unit_id) do update set budget_amount = coalesce(unit_financials.budget_amount, 0) + x.cost_delta, updated_at = now();
    end if;
    -- Schedule: the change becomes assigned work; handover moves by the time impact.
    if exists(select 1 from schedule_activities s where s.unit_id = v.unit_id) then
      insert into schedule_activities (organization_id, project_id, unit_id, code, name_th, name_en, stage, sequence, weight,
        baseline_start, baseline_finish, forecast_start, forecast_finish, photos_required, assigned_partner_id)
      values (v.organization_id, v.project_id, v.unit_id, v.vo_no, v.title, v.title,
        coalesce((select s.stage from schedule_activities s where s.unit_id = v.unit_id and s.status <> 'COMPLETED' order by s.sequence limit 1), 'FINISHING'),
        coalesce((select max(s.sequence) from schedule_activities s where s.unit_id = v.unit_id and not s.is_milestone), 0) + 1, 0,
        current_date, current_date + greatest(x.time_delta_days, 1), current_date, current_date + greatest(x.time_delta_days, 1),
        1, v.partner_id)
      returning id into act;
      if x.time_delta_days <> 0 then
        select * into milestone from schedule_activities s
         where s.unit_id = v.unit_id and s.is_milestone and s.status <> 'COMPLETED' order by s.sequence desc limit 1;
        if found then
          update schedule_activities set forecast_finish = forecast_finish + x.time_delta_days,
            forecast_start = forecast_start + x.time_delta_days, updated_at = now()
           where id = milestone.id;
        end if;
      end if;
      perform public.refresh_unit_progress(v.unit_id);
    end if;
  end if;
  -- Site: a site instruction to the assigned contractor.
  if v.partner_id is not null and exists(select 1 from partner_assignments a where a.partner_id = v.partner_id
       and a.project_id = v.project_id and a.status = 'ACTIVE' and (a.unit_id is null or v.unit_id is null or a.unit_id = v.unit_id)) then
    si_no := public.next_document_no(v.organization_id, 'SI');
    insert into site_instructions (organization_id, project_id, unit_id, partner_id, si_no, title, instruction, issued_by)
    values (v.organization_id, v.project_id, v.unit_id, v.partner_id, si_no, v.vo_no || ' · ' || v.title, x.revised_scope, auth.uid())
    returning id into si;
  end if;
  update variation_orders set status = 'RELEASED', released_by = auth.uid(), released_at = now(),
    schedule_activity_id = act, site_instruction_id = si, updated_at = now()
   where id = v.id;
  perform public.vo_log(v, 'VO_RELEASED', null);
end $$;

create or replace function public.close_variation(target_vo uuid, cancel boolean, reason text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare v variation_orders;
begin
  select * into v from variation_orders where id = target_vo for update;
  if not found or not public.can_vary(v.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if cancel then
    if v.status in ('RELEASED','CLOSED','CANCELLED') then raise exception 'Variation is locked'; end if;
    if coalesce(trim(reason), '') = '' then raise exception 'Reason required'; end if;
    if v.payment_schedule_id is not null then
      if exists(select 1 from payments p where p.schedule_id = v.payment_schedule_id and p.status = 'VALID') then
        raise exception 'Variation has payments';
      end if;
      update payment_schedules set status = 'CANCELLED', updated_at = now() where id = v.payment_schedule_id;
    end if;
    update variation_orders set status = 'CANCELLED', cancel_reason = trim(reason), updated_at = now() where id = v.id;
    perform public.vo_log(v, 'VO_CANCELLED', null);
  else
    if v.status <> 'RELEASED' then raise exception 'Variation is not released'; end if;
    update variation_orders set status = 'CLOSED', closed_at = now(), updated_at = now() where id = v.id;
    perform public.vo_log(v, 'VO_CLOSED', null);
  end if;
end $$;

-- ---------------------------------------------------------------- grants

do $$
declare f text;
begin
  foreach f in array array[
    'can_vary(uuid, text)', 'submit_change_request(uuid, jsonb)', 'decide_change_request(uuid, text, text)',
    'create_variation(uuid, jsonb)', 'revise_variation(uuid, jsonb)', 'link_variation_drawing(uuid, uuid)',
    'submit_variation(uuid)', 'approve_variation_internal(uuid, boolean, text)',
    'customer_decide_variation(uuid, boolean, text)', 'release_variation(uuid)', 'close_variation(uuid, boolean, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Contractor cost is internal: clients can read every version column except cost_delta; staff
-- get costs through vo_costs(), which checks project access.
revoke select on public.vo_versions from authenticated;
grant select (id, organization_id, vo_id, version, original_scope, revised_scope, price_delta, time_delta_days,
  note, created_by, created_at) on public.vo_versions to authenticated;

create or replace function public.vo_costs(target_project uuid)
returns table(vo_id uuid, version int, cost_delta numeric)
language sql stable security definer set search_path = public as $$
  select x.vo_id, x.version, x.cost_delta
    from vo_versions x join variation_orders v on v.id = x.vo_id
   where v.project_id = target_project and public.can_access_project(target_project);
$$;
revoke all on function public.vo_costs(uuid) from public, anon;
grant execute on function public.vo_costs(uuid) to authenticated;
