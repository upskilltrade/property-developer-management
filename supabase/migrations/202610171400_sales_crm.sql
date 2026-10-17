-- Sales, CRM & unit inventory (MVP-ROADMAP Release 1).
-- Lead -> Contact -> Qualified -> Viewing -> Negotiation -> Hold -> Booking.
--
-- Tables are read-only to clients; every change goes through an RPC that checks SALES
-- permissions, keeps an append-only activity log and writes timeline events. A unit can have at
-- most one active hold and one active booking (partial unique indexes), so conflicting
-- commitments are impossible even under concurrent requests. A discounted booking waits for
-- approval by a different person with SALES.APPROVE.

-- ---------------------------------------------------------------- permissions

create or replace function public.can_sell(target_project uuid, target_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from projects p where p.id = target_project
    and (public.can_manage_access(p.organization_id)
      or public.has_effective_permission(p.organization_id, p.id, 'SALES', target_action)));
$$;

create or replace function public.can_edit_sales(target_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_sell(target_project, 'EDIT') or public.can_sell(target_project, 'CREATE');
$$;

-- Lead contact data is customer data: sales or customer-relations staff only.
create or replace function public.can_see_leads(target_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_sell(target_project, 'VIEW') or exists(select 1 from projects p where p.id = target_project
    and public.has_effective_permission(p.organization_id, p.id, 'CUSTOMERS', 'VIEW'));
$$;

-- ---------------------------------------------------------------- tables

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  lead_no text not null,
  full_name text not null,
  phone text,
  email text,
  line_id text,
  source text not null default 'OTHER'
    check (source in ('WALK_IN','FACEBOOK','LINE','WEBSITE','REFERRAL','AGENT','EVENT','OTHER')),
  campaign text,
  budget numeric(18,2),
  interested_unit_id uuid references public.units(id) on delete set null,
  stage text not null default 'NEW'
    check (stage in ('NEW','CONTACTED','QUALIFIED','VIEWING','NEGOTIATION','BOOKED','LOST')),
  lost_reason text,
  assigned_to uuid references public.profiles(id),
  customer_id uuid references public.customers(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  unique (organization_id, lead_no)
);
create index if not exists leads_project_stage_idx on public.leads(project_id, stage);

create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  kind text not null check (kind in ('CREATED','CALL','LINE','EMAIL','MEETING','NOTE','STAGE','VIEWING','HOLD','BOOKING')),
  note text,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists lead_activities_lead_idx on public.lead_activities(lead_id, occurred_at desc);

create table if not exists public.viewings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  scheduled_at timestamptz not null,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','DONE','NO_SHOW','CANCELLED')),
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists viewings_project_idx on public.viewings(project_id, scheduled_at);

create table if not exists public.unit_holds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  expires_at timestamptz not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RELEASED','EXPIRED','CONVERTED')),
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references public.profiles(id)
);
create unique index if not exists unit_holds_one_active_idx on public.unit_holds(unit_id) where status = 'ACTIVE';

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid not null references public.customers(id),
  booking_no text not null,
  booking_date date not null default current_date,
  list_price numeric(18,2),
  agreed_price numeric(18,2) not null check (agreed_price > 0),
  booking_amount numeric(18,2) not null default 0 check (booking_amount >= 0),
  discount_reason text,
  status text not null check (status in ('PENDING_APPROVAL','CONFIRMED','CANCELLED')),
  requested_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  unique (organization_id, booking_no)
);
-- The rule that prevents conflicting commitments on one unit.
create unique index if not exists bookings_one_active_idx on public.bookings(unit_id)
  where status in ('PENDING_APPROVAL','CONFIRMED');

alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;
alter table public.viewings enable row level security;
alter table public.unit_holds enable row level security;
alter table public.bookings enable row level security;

create policy leads_sales_select on public.leads for select to authenticated using (public.can_see_leads(project_id));
create policy lead_activities_sales_select on public.lead_activities for select to authenticated using (public.can_see_leads(project_id));
create policy viewings_sales_select on public.viewings for select to authenticated using (public.can_see_leads(project_id));
-- Inventory commitments are visible to everyone working on the project.
create policy unit_holds_project_select on public.unit_holds for select to authenticated using (public.can_access_project(project_id));
create policy bookings_project_select on public.bookings for select to authenticated using (public.can_access_project(project_id));

-- ---------------------------------------------------------------- helpers

create or replace function public.log_timeline(target_org uuid, target_project uuid, target_unit uuid,
  kind text, entity_kind text, entity_ref uuid, title text, meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into timeline_events (organization_id, project_id, unit_id, event_type, entity_type, entity_id, title, metadata, actor_user_id)
  values (target_org, target_project, target_unit, kind, entity_kind, entity_ref, title, coalesce(meta, '{}'::jsonb), auth.uid());
$$;
revoke all on function public.log_timeline(uuid, uuid, uuid, text, text, uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.lead_log(target_lead uuid, kind text, note text)
returns void language sql security definer set search_path = public as $$
  insert into lead_activities (organization_id, project_id, lead_id, kind, note, created_by)
  select l.organization_id, l.project_id, l.id, kind, note, auth.uid() from leads l where l.id = target_lead;
  update leads set last_activity_at = now(), updated_at = now() where id = target_lead;
$$;
revoke all on function public.lead_log(uuid, text, text) from public, anon, authenticated;

-- Expired holds stop blocking the unit (the unit goes back to AVAILABLE if nothing else holds it).
create or replace function public.expire_unit_holds(target_project uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.can_access_project(target_project) then raise exception 'Not authorized'; end if;
  with expired as (
    update unit_holds set status = 'EXPIRED', closed_at = now()
     where project_id = target_project and status = 'ACTIVE' and expires_at < now()
    returning unit_id)
  update units u set status = 'AVAILABLE', updated_at = now()
    from expired e
   where u.id = e.unit_id and u.status = 'HOLD'
     and not exists(select 1 from bookings b where b.unit_id = u.id and b.status in ('PENDING_APPROVAL','CONFIRMED'));
  get diagnostics n = row_count;
  return n;
end $$;

-- Stage moves forward on viewing / hold but never backwards automatically.
create or replace function public.advance_lead_stage(target_lead uuid, to_stage text)
returns void language sql security definer set search_path = public as $$
  update leads set stage = to_stage, updated_at = now()
   where id = target_lead and stage not in ('BOOKED','LOST')
     and array_position(array['NEW','CONTACTED','QUALIFIED','VIEWING','NEGOTIATION'], stage)
       < array_position(array['NEW','CONTACTED','QUALIFIED','VIEWING','NEGOTIATION'], to_stage);
$$;
revoke all on function public.advance_lead_stage(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- lead RPCs

-- data: {full_name, phone, email, line_id, source, campaign, budget, interested_unit_id, assigned_to, notes}
create or replace function public.create_lead(target_project uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p projects;
  new_id uuid;
  assignee uuid := coalesce(nullif(data->>'assigned_to', '')::uuid, auth.uid());
begin
  select * into p from projects where id = target_project;
  if not found or not public.can_edit_sales(target_project) then raise exception 'Not authorized'; end if;
  if coalesce(trim(data->>'full_name'), '') = '' then raise exception 'Name required'; end if;
  if coalesce(trim(data->>'phone'), '') = '' and coalesce(trim(data->>'email'), '') = '' and coalesce(trim(data->>'line_id'), '') = '' then
    raise exception 'Contact required';
  end if;
  if not exists(select 1 from organization_memberships m where m.organization_id = p.organization_id and m.user_id = assignee and m.status = 'ACTIVE') then
    raise exception 'Invalid assignee';
  end if;
  insert into leads (organization_id, project_id, lead_no, full_name, phone, email, line_id, source, campaign, budget,
    interested_unit_id, assigned_to, notes, created_by)
  values (p.organization_id, p.id, public.next_document_no(p.organization_id, 'LD'), trim(data->>'full_name'),
    nullif(trim(data->>'phone'), ''), nullif(lower(trim(data->>'email')), ''), nullif(trim(data->>'line_id'), ''),
    coalesce(nullif(data->>'source', ''), 'OTHER'), nullif(trim(data->>'campaign'), ''),
    nullif(data->>'budget', '')::numeric,
    (select u.id from units u where u.id = nullif(data->>'interested_unit_id', '')::uuid and u.project_id = p.id),
    assignee, nullif(trim(data->>'notes'), ''), auth.uid())
  returning id into new_id;
  perform public.lead_log(new_id, 'CREATED', null);
  perform public.log_timeline(p.organization_id, p.id, null, 'LEAD_CREATED', 'lead', new_id, trim(data->>'full_name'),
    jsonb_build_object('source', coalesce(nullif(data->>'source', ''), 'OTHER')));
  return new_id;
end $$;

create or replace function public.update_lead(target_lead uuid, data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare l leads; assignee uuid;
begin
  select * into l from leads where id = target_lead;
  if not found or not public.can_edit_sales(l.project_id) then raise exception 'Not authorized'; end if;
  if coalesce(trim(data->>'full_name'), '') = '' then raise exception 'Name required'; end if;
  assignee := coalesce(nullif(data->>'assigned_to', '')::uuid, l.assigned_to);
  if assignee is not null and not exists(select 1 from organization_memberships m
      where m.organization_id = l.organization_id and m.user_id = assignee and m.status = 'ACTIVE') then
    raise exception 'Invalid assignee';
  end if;
  update leads set full_name = trim(data->>'full_name'), phone = nullif(trim(data->>'phone'), ''),
    email = nullif(lower(trim(data->>'email')), ''), line_id = nullif(trim(data->>'line_id'), ''),
    source = coalesce(nullif(data->>'source', ''), source), campaign = nullif(trim(data->>'campaign'), ''),
    budget = nullif(data->>'budget', '')::numeric,
    interested_unit_id = (select u.id from units u where u.id = nullif(data->>'interested_unit_id', '')::uuid and u.project_id = l.project_id),
    assigned_to = assignee, notes = nullif(trim(data->>'notes'), ''), updated_at = now()
   where id = l.id;
end $$;

-- BOOKED is set only by create_booking. LOST needs a reason.
create or replace function public.set_lead_stage(target_lead uuid, new_stage text, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare l leads;
begin
  select * into l from leads where id = target_lead;
  if not found or not public.can_edit_sales(l.project_id) then raise exception 'Not authorized'; end if;
  if new_stage not in ('NEW','CONTACTED','QUALIFIED','VIEWING','NEGOTIATION','LOST') then raise exception 'Invalid stage'; end if;
  if l.stage = 'BOOKED' then raise exception 'Lead is booked'; end if;
  if new_stage = 'LOST' and coalesce(trim(reason), '') = '' then raise exception 'Reason required'; end if;
  update leads set stage = new_stage, lost_reason = case when new_stage = 'LOST' then trim(reason) end, updated_at = now()
   where id = l.id;
  perform public.lead_log(l.id, 'STAGE', l.stage || ' → ' || new_stage || coalesce(' · ' || nullif(trim(reason), ''), ''));
end $$;

create or replace function public.add_lead_activity(target_lead uuid, kind text, note text, occurred_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare l leads;
begin
  select * into l from leads where id = target_lead;
  if not found or not public.can_edit_sales(l.project_id) then raise exception 'Not authorized'; end if;
  if kind not in ('CALL','LINE','EMAIL','MEETING','NOTE') then raise exception 'Invalid activity'; end if;
  if coalesce(trim(note), '') = '' then raise exception 'Note required'; end if;
  insert into lead_activities (organization_id, project_id, lead_id, kind, note, occurred_at, created_by)
  values (l.organization_id, l.project_id, l.id, kind, trim(note), coalesce(occurred_at, now()), auth.uid());
  update leads set last_activity_at = now(), updated_at = now() where id = l.id;
  if l.stage = 'NEW' then perform public.advance_lead_stage(l.id, 'CONTACTED'); end if;
end $$;

create or replace function public.schedule_viewing(target_lead uuid, target_unit uuid, scheduled_at timestamptz, note text)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare l leads; v uuid;
begin
  select * into l from leads where id = target_lead;
  if not found or not public.can_edit_sales(l.project_id) then raise exception 'Not authorized'; end if;
  if scheduled_at is null then raise exception 'Date required'; end if;
  insert into viewings (organization_id, project_id, lead_id, unit_id, scheduled_at, note, created_by)
  values (l.organization_id, l.project_id, l.id,
    (select u.id from units u where u.id = target_unit and u.project_id = l.project_id), scheduled_at, nullif(trim(note), ''), auth.uid())
  returning id into v;
  perform public.lead_log(l.id, 'VIEWING', to_char(scheduled_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI'));
  return v;
end $$;

create or replace function public.set_viewing_status(target_viewing uuid, new_status text, note text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare v viewings;
begin
  select * into v from viewings where id = target_viewing;
  if not found or not public.can_edit_sales(v.project_id) then raise exception 'Not authorized'; end if;
  if new_status not in ('SCHEDULED','DONE','NO_SHOW','CANCELLED') then raise exception 'Invalid status'; end if;
  update viewings set status = new_status, note = coalesce(nullif(trim(note), ''), viewings.note), updated_at = now() where id = v.id;
  if new_status = 'DONE' then perform public.advance_lead_stage(v.lead_id, 'VIEWING'); end if;
  perform public.lead_log(v.lead_id, 'VIEWING', new_status || coalesce(' · ' || nullif(trim(note), ''), ''));
end $$;

-- ---------------------------------------------------------------- inventory RPCs

create or replace function public.hold_unit(target_lead uuid, target_unit uuid, expires_at timestamptz, note text)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare l leads; u units; h uuid;
begin
  select * into l from leads where id = target_lead;
  if not found or not public.can_edit_sales(l.project_id) then raise exception 'Not authorized'; end if;
  if l.stage in ('BOOKED','LOST') then raise exception 'Lead is closed'; end if;
  perform public.expire_unit_holds(l.project_id);
  select * into u from units where id = target_unit and project_id = l.project_id for update;
  if not found then raise exception 'Unit not found'; end if;
  if u.status <> 'AVAILABLE' then raise exception 'Unit is not available'; end if;
  if expires_at is null or expires_at <= now() or expires_at > now() + interval '30 days' then raise exception 'Invalid expiry'; end if;
  insert into unit_holds (organization_id, project_id, unit_id, lead_id, expires_at, note, created_by)
  values (l.organization_id, l.project_id, u.id, l.id, expires_at, nullif(trim(note), ''), auth.uid())
  returning id into h;
  update units set status = 'HOLD', updated_at = now() where id = u.id;
  perform public.advance_lead_stage(l.id, 'NEGOTIATION');
  perform public.lead_log(l.id, 'HOLD', u.code);
  perform public.log_timeline(l.organization_id, l.project_id, u.id, 'UNIT_HELD', 'unit_hold', h, u.code || ' · ' || l.full_name,
    jsonb_build_object('expires_at', expires_at));
  return h;
end $$;

create or replace function public.release_hold(target_hold uuid, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare h unit_holds;
begin
  select * into h from unit_holds where id = target_hold for update;
  if not found or not public.can_edit_sales(h.project_id) then raise exception 'Not authorized'; end if;
  if h.status <> 'ACTIVE' then raise exception 'Hold is not active'; end if;
  update unit_holds set status = 'RELEASED', closed_at = now(), closed_by = auth.uid(), note = coalesce(nullif(trim(reason), ''), note)
   where id = h.id;
  update units set status = 'AVAILABLE', updated_at = now() where id = h.unit_id and status = 'HOLD';
  perform public.lead_log(h.lead_id, 'HOLD', 'released' || coalesce(' · ' || nullif(trim(reason), ''), ''));
  perform public.log_timeline(h.organization_id, h.project_id, h.unit_id, 'HOLD_RELEASED', 'unit_hold', h.id, 'Hold released', '{}'::jsonb);
end $$;

-- Booking: the unit must be available or held by this lead; creates the customer from the lead,
-- links customer and unit (unit_sales), reserves the unit and closes the lead as BOOKED.
create or replace function public.create_booking(target_lead uuid, target_unit uuid, agreed_price numeric,
  booking_amount numeric, booking_date date, discount_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  l leads; u units; cust uuid; b uuid; st text; no text;
begin
  select * into l from leads where id = target_lead for update;
  if not found or not public.can_edit_sales(l.project_id) then raise exception 'Not authorized'; end if;
  if l.stage in ('BOOKED','LOST') then raise exception 'Lead is closed'; end if;
  perform public.expire_unit_holds(l.project_id);
  select * into u from units where id = target_unit and project_id = l.project_id for update;
  if not found then raise exception 'Unit not found'; end if;
  if not (u.status = 'AVAILABLE' or (u.status = 'HOLD' and exists(
      select 1 from unit_holds h where h.unit_id = u.id and h.status = 'ACTIVE' and h.lead_id = l.id))) then
    raise exception 'Unit is not available';
  end if;
  if agreed_price is null or agreed_price <= 0 or booking_amount is null or booking_amount < 0 or booking_amount > agreed_price then
    raise exception 'Invalid amount';
  end if;
  st := case when u.list_price is not null and agreed_price < u.list_price then 'PENDING_APPROVAL' else 'CONFIRMED' end;
  if st = 'PENDING_APPROVAL' and coalesce(trim(discount_reason), '') = '' then raise exception 'Discount reason required'; end if;

  cust := l.customer_id;
  if cust is null then
    insert into customers (organization_id, full_name, phone, email, notes)
    values (l.organization_id, l.full_name, l.phone, l.email, 'From lead ' || l.lead_no)
    returning id into cust;
  end if;

  no := public.next_document_no(l.organization_id, 'BK');
  insert into bookings (organization_id, project_id, unit_id, lead_id, customer_id, booking_no, booking_date, list_price,
    agreed_price, booking_amount, discount_reason, status, requested_by, approved_by, approved_at)
  values (l.organization_id, l.project_id, u.id, l.id, cust, no, coalesce(booking_date, current_date), u.list_price,
    agreed_price, booking_amount, nullif(trim(discount_reason), ''), st, auth.uid(),
    case when st = 'CONFIRMED' then auth.uid() end, case when st = 'CONFIRMED' then now() end)
  returning id into b;

  update unit_holds set status = 'CONVERTED', closed_at = now(), closed_by = auth.uid()
   where unit_id = u.id and status = 'ACTIVE';
  update units set status = 'RESERVED', updated_at = now() where id = u.id;
  insert into unit_sales (unit_id, customer_id, status, agreed_price, reservation_date, updated_at)
  values (u.id, cust, 'RESERVED', agreed_price, coalesce(booking_date, current_date), now())
  on conflict (unit_id) do update set customer_id = excluded.customer_id, status = 'RESERVED',
    agreed_price = excluded.agreed_price, reservation_date = excluded.reservation_date, updated_at = now();
  update leads set stage = 'BOOKED', customer_id = cust, updated_at = now() where id = l.id;
  perform public.lead_log(l.id, 'BOOKING', no || ' · ' || u.code);
  perform public.log_timeline(l.organization_id, l.project_id, u.id, 'BOOKING_CREATED', 'booking', b, no || ' · ' || l.full_name,
    jsonb_build_object('status', st, 'agreed_price', agreed_price, 'lead_source', l.source));
  return b;
end $$;

-- Shared by cancel and reject: free the unit unless money has been received for it.
create or replace function public.close_booking(target_booking uuid, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare bk bookings;
begin
  select * into bk from bookings where id = target_booking for update;
  if bk.status = 'CANCELLED' then raise exception 'Booking already cancelled'; end if;
  if exists(select 1 from payments pm where pm.unit_id = bk.unit_id and pm.status = 'VALID') then
    raise exception 'Booking has payments';
  end if;
  update bookings set status = 'CANCELLED', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = trim(reason)
   where id = bk.id;
  update units set status = 'AVAILABLE', updated_at = now() where id = bk.unit_id;
  update unit_sales set status = 'AVAILABLE', customer_id = null, agreed_price = null, reservation_date = null, updated_at = now()
   where unit_id = bk.unit_id;
  update payment_schedules set status = 'CANCELLED', updated_at = now() where unit_id = bk.unit_id and status = 'ACTIVE';
  if bk.lead_id is not null then
    update leads set stage = 'NEGOTIATION', updated_at = now() where id = bk.lead_id and stage = 'BOOKED';
    perform public.lead_log(bk.lead_id, 'BOOKING', bk.booking_no || ' cancelled · ' || trim(reason));
  end if;
  perform public.log_timeline(bk.organization_id, bk.project_id, bk.unit_id, 'BOOKING_CANCELLED', 'booking', bk.id,
    bk.booking_no, jsonb_build_object('reason', trim(reason)));
end $$;
revoke all on function public.close_booking(uuid, text) from public, anon, authenticated;

-- Discount approval by a different person with SALES.APPROVE (or the owner).
create or replace function public.decide_booking(target_booking uuid, approve boolean, note text)
returns void language plpgsql security definer set search_path = public as $$
declare bk bookings;
begin
  select * into bk from bookings where id = target_booking for update;
  if not found or not public.can_sell(bk.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if bk.status <> 'PENDING_APPROVAL' then raise exception 'Booking is not pending'; end if;
  if bk.requested_by = auth.uid() then raise exception 'Requester cannot approve their own booking'; end if;
  if approve then
    update bookings set status = 'CONFIRMED', approved_by = auth.uid(), approved_at = now() where id = bk.id;
    perform public.log_timeline(bk.organization_id, bk.project_id, bk.unit_id, 'BOOKING_APPROVED', 'booking', bk.id, bk.booking_no, '{}'::jsonb);
  else
    if coalesce(trim(note), '') = '' then raise exception 'Reason required'; end if;
    perform public.close_booking(bk.id, 'Discount rejected: ' || trim(note));
  end if;
end $$;

create or replace function public.cancel_booking(target_booking uuid, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare bk bookings;
begin
  select * into bk from bookings where id = target_booking;
  if not found or not public.can_sell(bk.project_id, 'APPROVE') then raise exception 'Not authorized'; end if;
  if coalesce(trim(reason), '') = '' then raise exception 'Reason required'; end if;
  perform public.close_booking(bk.id, reason);
end $$;

-- ---------------------------------------------------------------- grants

do $$
declare f text;
begin
  foreach f in array array[
    'can_sell(uuid, text)', 'can_edit_sales(uuid)', 'can_see_leads(uuid)', 'expire_unit_holds(uuid)',
    'create_lead(uuid, jsonb)', 'update_lead(uuid, jsonb)', 'set_lead_stage(uuid, text, text)',
    'add_lead_activity(uuid, text, text, timestamptz)', 'schedule_viewing(uuid, uuid, timestamptz, text)',
    'set_viewing_status(uuid, text, text)', 'hold_unit(uuid, uuid, timestamptz, text)', 'release_hold(uuid, text)',
    'create_booking(uuid, uuid, numeric, numeric, date, text)', 'decide_booking(uuid, boolean, text)',
    'cancel_booking(uuid, text)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
