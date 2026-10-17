-- Release 9: Automation & notifications (vendor-neutral core).
--   * notifications: per-user inbox, written only by the database (workflow events + daily rules).
--   * notification_preferences / notification_outbox: optional email (Resend) and LINE delivery.
--     Provider keys live in Supabase Vault (resend_api_key, notify_email_from,
--     line_channel_access_token, app_base_url); without them nothing is sent and the outbox
--     records why. pg_net posts the requests, pg_cron runs the jobs.
--   * run_automation: daily reminders (instalments, aging approvals, overdue RFIs / defects /
--     service requests / deliveries, inspection appointments) and the Monday digest for owners.
--   * calendar_events: private ICS feed per user (token), scoped to what that user may see.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------- tables

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  unit_id uuid references public.units(id) on delete cascade,
  kind text not null,
  severity text not null default 'INFO' check (severity in ('INFO','WARNING','CRITICAL')),
  title_th text not null,
  title_en text not null,
  body_th text,
  body_en text,
  -- App path without the locale prefix, e.g. /app/projects/<id>/changes
  link text,
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications(user_id) where read_at is null;

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_enabled boolean not null default false,
  line_enabled boolean not null default false,
  line_user_id text,
  digest_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel text not null check (channel in ('EMAIL','LINE')),
  recipient text not null,
  status text not null default 'PENDING' check (status in ('PENDING','SENT','FAILED','SKIPPED')),
  attempts int not null default 0,
  last_error text,
  request_id bigint,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notification_outbox_pending_idx on public.notification_outbox(created_at) where status = 'PENDING';

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  notifications int not null default 0,
  note text
);

create table if not exists public.calendar_feeds (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.automation_runs enable row level security;
alter table public.calendar_feeds enable row level security;

create policy notifications_own_select on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy notification_preferences_own_select on public.notification_preferences
  for select to authenticated using (user_id = auth.uid());
create policy notification_outbox_owner_select on public.notification_outbox
  for select to authenticated using (exists(select 1 from public.notifications n
    where n.id = notification_outbox.notification_id and public.can_manage_access(n.organization_id)));
create policy automation_runs_owner_select on public.automation_runs
  for select to authenticated using (exists(select 1 from public.organizations o
    where public.can_manage_access(o.id)));
create policy calendar_feeds_own_select on public.calendar_feeds
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------- recipients
-- The permission helpers read auth.uid(); jobs and triggers need the same answers for other users.

create or replace function public.user_has_permission(target_user uuid, target_org uuid,
  target_project uuid, target_module text, target_action text)
returns boolean language sql stable security definer set search_path = public as $$
  with me as (select id from organization_memberships
               where organization_id = target_org and user_id = target_user and status = 'ACTIVE'),
  deny as (select 1 from membership_permission_overrides o join me on me.id = o.membership_id
            where o.module_code = target_module and o.action_code = target_action and o.effect = 'DENY'
              and (o.scope_type = 'ORGANIZATION' or (o.scope_type = 'PROJECT' and o.scope_id = target_project))),
  allow_override as (select 1 from membership_permission_overrides o join me on me.id = o.membership_id
            where o.module_code = target_module and o.action_code = target_action and o.effect = 'ALLOW'
              and (o.scope_type = 'ORGANIZATION' or (o.scope_type = 'PROJECT' and o.scope_id = target_project))),
  role_allow as (select 1 from me join membership_roles mr on mr.membership_id = me.id
                   join role_permissions rp on rp.role_id = mr.role_id
                  where rp.module_code = target_module and rp.action_code = target_action
                    and (mr.scope_type = 'ORGANIZATION' or (mr.scope_type = 'PROJECT' and mr.scope_id = target_project)))
  select not exists(select 1 from deny) and (exists(select 1 from allow_override) or exists(select 1 from role_allow));
$$;

create or replace function public.user_is_owner(target_user uuid, target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from organization_memberships om
    join membership_roles mr on mr.membership_id = om.id join roles r on r.id = mr.role_id
   where om.organization_id = target_org and om.user_id = target_user and om.status = 'ACTIVE'
     and r.code = 'OWNER' and r.is_system and mr.scope_type = 'ORGANIZATION');
$$;

create or replace function public.user_can_access_project(target_user uuid, target_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from projects p
    join organization_memberships om on om.organization_id = p.organization_id
    join membership_roles mr on mr.membership_id = om.id join roles r on r.id = mr.role_id
   where p.id = target_project and om.user_id = target_user and om.status = 'ACTIVE'
     and r.code not in ('CUSTOMER','CONTRACTOR','INVESTOR')
     and (mr.scope_type = 'ORGANIZATION' or (mr.scope_type = 'PROJECT' and mr.scope_id = target_project)));
$$;

-- Who acts on a kind of work in a project. Owners are always included.
create or replace function public.audience(target_project uuid, grp text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct om.user_id
    from projects p
    join organization_memberships om on om.organization_id = p.organization_id and om.status = 'ACTIVE'
   where p.id = target_project
     and (public.user_is_owner(om.user_id, p.organization_id)
       or (grp = 'FINANCE' and (public.user_has_permission(om.user_id, p.organization_id, p.id, 'FINANCE', 'APPROVE')
                              or public.user_has_permission(om.user_id, p.organization_id, p.id, 'FINANCE', 'POST')))
       or (grp = 'SALES' and public.user_has_permission(om.user_id, p.organization_id, p.id, 'SALES', 'APPROVE'))
       or (grp = 'CONSTRUCTION' and public.user_has_permission(om.user_id, p.organization_id, p.id, 'CONSTRUCTION', 'APPROVE'))
       or (grp = 'PROCUREMENT' and public.user_has_permission(om.user_id, p.organization_id, p.id, 'PROCUREMENT', 'APPROVE'))
       or (grp = 'DESIGN' and (public.user_has_permission(om.user_id, p.organization_id, p.id, 'PROJECTS', 'APPROVE')
                             or public.user_has_permission(om.user_id, p.organization_id, p.id, 'CONSTRUCTION', 'APPROVE'))));
$$;

create or replace function public.unit_customers(target_unit uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select c.primary_profile_id from unit_sales us join customers c on c.id = us.customer_id
   where us.unit_id = target_unit and c.primary_profile_id is not null;
$$;

-- Inserts one notification (once per dedupe key) and queues delivery per the user's preferences.
create or replace function public.notify(target_org uuid, target_user uuid, target_project uuid,
  target_unit uuid, n_kind text, n_severity text, t_th text, t_en text, b_th text, b_en text,
  n_link text, n_key text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  pref notification_preferences;
  mail text;
begin
  if target_user is null or target_org is null then return false; end if;
  insert into notifications (organization_id, user_id, project_id, unit_id, kind, severity,
                             title_th, title_en, body_th, body_en, link, dedupe_key)
  values (target_org, target_user, target_project, target_unit, n_kind, coalesce(n_severity, 'INFO'),
          t_th, t_en, b_th, b_en, n_link, n_key)
  on conflict (user_id, dedupe_key) do nothing
  returning id into new_id;
  if new_id is null then return false; end if;

  select * into pref from notification_preferences where user_id = target_user;
  if found then
    if pref.email_enabled then
      select email into mail from auth.users where id = target_user;
      if mail is not null then
        insert into notification_outbox (notification_id, channel, recipient) values (new_id, 'EMAIL', mail);
      end if;
    end if;
    if pref.line_enabled and coalesce(pref.line_user_id, '') <> '' then
      insert into notification_outbox (notification_id, channel, recipient) values (new_id, 'LINE', pref.line_user_id);
    end if;
  end if;
  return true;
end $$;

-- Notify everyone in a set except the person who caused the event.
create or replace function public.notify_many(recipients uuid[], actor uuid, target_org uuid,
  target_project uuid, target_unit uuid, n_kind text, n_severity text, t_th text, t_en text,
  b_th text, b_en text, n_link text, n_key text)
returns int language plpgsql security definer set search_path = public as $$
declare
  r uuid;
  sent int := 0;
begin
  for r in select distinct x from unnest(recipients) x where x is not null and x is distinct from actor loop
    if public.notify(target_org, r, target_project, target_unit, n_kind, n_severity, t_th, t_en,
                     b_th, b_en, n_link, n_key) then
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end $$;

-- ---------------------------------------------------------------- workflow events

create or replace function public.notify_from_timeline()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  e timeline_events := new;
  p text := '/app/projects/' || e.project_id;
  aud uuid[];
  t_th text;
  t_en text;
  sev text := 'INFO';
  lnk text;
begin
  if e.project_id is null then return new; end if;
  case e.event_type
    when 'BOOKING_CREATED' then
      aud := array(select public.audience(e.project_id, 'SALES'));
      t_th := 'การจองใหม่รออนุมัติ'; t_en := 'New booking awaiting approval'; lnk := '/app/sales/bookings';
    when 'BOOKING_APPROVED' then
      aud := array(select requested_by from bookings where id = e.entity_id);
      t_th := 'การจองได้รับอนุมัติแล้ว'; t_en := 'Booking approved'; lnk := '/app/sales/bookings';
    when 'CONTRACT_SIGNED' then
      aud := array(select public.audience(e.project_id, 'OWNER'));
      t_th := 'ลงนามสัญญาแล้ว'; t_en := 'Contract signed'; lnk := '/app/sales/contracts/' || e.entity_id;
    when 'CHANGE_REQUESTED' then
      aud := array(select public.audience(e.project_id, 'CONSTRUCTION') union select public.audience(e.project_id, 'SALES'));
      t_th := 'มีคำขอเปลี่ยนแปลงใหม่'; t_en := 'New change request'; lnk := p || '/changes';
    when 'VO_SUBMITTED' then
      aud := array(select public.audience(e.project_id, 'CONSTRUCTION'));
      t_th := 'VO รออนุมัติภายใน'; t_en := 'Variation order awaiting approval'; lnk := p || '/changes/' || e.entity_id;
    when 'VO_OFFERED' then
      aud := array(select public.unit_customers(e.unit_id));
      t_th := 'มีรายการเปลี่ยนแปลงรอคุณตัดสินใจ'; t_en := 'A change offer is waiting for your decision'; lnk := '/app/customer';
    when 'VO_CUSTOMER_APPROVED', 'VO_CUSTOMER_REJECTED' then
      aud := array(select created_by from variation_orders where id = e.entity_id);
      t_th := case when e.event_type = 'VO_CUSTOMER_APPROVED' then 'ลูกค้าอนุมัติ VO แล้ว' else 'ลูกค้าไม่อนุมัติ VO' end;
      t_en := case when e.event_type = 'VO_CUSTOMER_APPROVED' then 'Customer approved the VO' else 'Customer rejected the VO' end;
      lnk := p || '/changes/' || e.entity_id;
    when 'RFI_RAISED' then
      aud := array(select public.audience(e.project_id, 'CONSTRUCTION'));
      t_th := 'มี RFI ใหม่รอตอบ'; t_en := 'New RFI awaiting an answer'; lnk := p || '/site/rfis/' || e.entity_id;
    when 'RFI_ANSWERED' then
      aud := array(select raised_by from rfis where id = e.entity_id);
      t_th := 'RFI ของคุณได้รับคำตอบแล้ว'; t_en := 'Your RFI was answered'; lnk := p || '/site/rfis/' || e.entity_id;
    when 'DEFECT_OPENED' then
      if not exists(select 1 from defects where id = e.entity_id and severity = 'HIGH') then return new; end if;
      aud := array(select public.audience(e.project_id, 'CONSTRUCTION'));
      t_th := 'พบข้อบกพร่องร้ายแรง'; t_en := 'High-severity defect opened'; sev := 'CRITICAL'; lnk := p || '/site?view=defects';
    when 'SELECTION_PUBLISHED' then
      aud := array(select public.unit_customers(e.unit_id));
      t_th := 'มีรายการวัสดุให้คุณเลือก'; t_en := 'Materials are ready for your selection'; lnk := '/app/customer';
    when 'CUSTOMER_APPROVED', 'CUSTOMER_CHANGE_REQUESTED', 'CUSTOMER_REJECTED' then
      aud := array(select public.audience(e.project_id, 'DESIGN'));
      t_th := case when e.event_type = 'CUSTOMER_APPROVED' then 'ลูกค้าอนุมัติแบบ/วัสดุแล้ว' else 'ลูกค้าขอแก้ไขแบบ/วัสดุ' end;
      t_en := case when e.event_type = 'CUSTOMER_APPROVED' then 'Customer approved a design item' else 'Customer requested design changes' end;
      lnk := p || '/design';
    when 'HANDOVER_READY' then
      aud := array(select public.audience(e.project_id, 'SALES'));
      t_th := 'ยูนิตพร้อมนัดลูกค้าตรวจบ้าน'; t_en := 'Unit ready for customer inspection'; lnk := p || '/handover/' || e.unit_id;
    when 'CUSTOMER_INSPECTION_SCHEDULED' then
      aud := array(select public.unit_customers(e.unit_id));
      t_th := 'นัดตรวจบ้านก่อนรับมอบแล้ว'; t_en := 'Your home inspection is scheduled'; lnk := '/app/customer';
    when 'HANDOVER_ACCEPTED' then
      aud := array(select public.audience(e.project_id, 'SALES'));
      t_th := 'ลูกค้ายืนยันรับบ้านแล้ว'; t_en := 'Customer accepted the home'; lnk := p || '/handover/' || e.unit_id;
    when 'HANDED_OVER' then
      aud := array(select public.unit_customers(e.unit_id));
      t_th := 'ยินดีต้อนรับสู่บ้านใหม่'; t_en := 'Welcome to your new home'; lnk := '/app/customer';
    when 'SERVICE_REQUESTED' then
      aud := array(select public.audience(e.project_id, 'CONSTRUCTION'));
      t_th := 'มีเรื่องแจ้งซ่อมใหม่'; t_en := 'New service request'; lnk := p || '/handover?view=service';
    when 'PO_APPROVED' then
      aud := array(select created_by from purchase_orders where id = e.entity_id);
      t_th := 'ใบสั่งซื้อได้รับอนุมัติ'; t_en := 'Purchase order approved'; lnk := p || '/procurement?view=orders';
    else
      return new;
  end case;

  perform public.notify_many(aud, e.actor_user_id, e.organization_id, e.project_id, e.unit_id,
    e.event_type, sev, t_th, t_en, e.title, e.title, lnk, 'tl:' || e.id);
  return new;
exception when others then
  -- Notifications must never block the workflow that raised the event.
  raise warning 'notify_from_timeline failed: %', sqlerrm;
  return new;
end $$;

create or replace trigger timeline_notify after insert on public.timeline_events
  for each row execute function public.notify_from_timeline();

-- Payment evidence: finance hears about new slips; the customer hears the outcome.
create or replace function public.notify_payment_evidence()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  u text;
begin
  select code into u from units where id = new.unit_id;
  if tg_op = 'INSERT' then
    perform public.notify_many(array(select public.audience(new.project_id, 'FINANCE')), new.submitted_by,
      new.organization_id, new.project_id, new.unit_id, 'EVIDENCE_SUBMITTED', 'INFO',
      'มีหลักฐานการชำระรอตรวจ · ' || u, 'Payment evidence to verify · ' || u,
      to_char(new.amount, 'FM999,999,999,990.00') || ' THB', to_char(new.amount, 'FM999,999,999,990.00') || ' THB',
      '/app/projects/' || new.project_id || '/units/' || new.unit_id || '/payments', 'ev:' || new.id);
  elsif new.status <> old.status and new.status in ('VERIFIED', 'REJECTED') and new.submitted_by_customer then
    perform public.notify(new.organization_id, new.submitted_by, new.project_id, new.unit_id,
      'EVIDENCE_' || new.status, case when new.status = 'REJECTED' then 'WARNING' else 'INFO' end,
      case when new.status = 'VERIFIED' then 'ยืนยันรับชำระเงินแล้ว' else 'หลักฐานการชำระไม่ผ่านการตรวจ' end,
      case when new.status = 'VERIFIED' then 'Payment confirmed' else 'Payment evidence rejected' end,
      new.review_note, new.review_note, '/app/customer', 'ev-' || lower(new.status) || ':' || new.id);
  end if;
  return new;
exception when others then
  raise warning 'notify_payment_evidence failed: %', sqlerrm;
  return new;
end $$;

create or replace trigger payment_evidence_notify after insert or update of status on public.payment_evidence
  for each row execute function public.notify_payment_evidence();

-- Service requests: the customer hears when a repair is done and needs confirming.
create or replace function public.notify_service_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'RESOLVED' and old.status <> 'RESOLVED' then
    perform public.notify_many(array(select public.unit_customers(new.unit_id)), null,
      new.organization_id, new.project_id, new.unit_id, 'SERVICE_RESOLVED', 'INFO',
      'งานซ่อมเสร็จแล้ว กรุณายืนยัน · ' || new.sr_no, 'Repair done, please confirm · ' || new.sr_no,
      new.resolution, new.resolution, '/app/customer', 'sr-resolved:' || new.id || ':' || new.reopen_count);
  end if;
  return new;
exception when others then
  raise warning 'notify_service_request failed: %', sqlerrm;
  return new;
end $$;

create or replace trigger service_request_notify after update of status on public.service_requests
  for each row execute function public.notify_service_request();

-- ---------------------------------------------------------------- daily automation

create or replace function public.run_automation()
returns int language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  today date := (now() at time zone 'Asia/Bangkok')::date;
  run uuid;
  total int := 0;
  r record;
  money text;
begin
  insert into automation_runs (job) values ('daily') returning id into run;

  -- 1. Instalments due within 3 days: remind the buyer.
  for r in select s.*, u.code unit_code from payment_schedule_status s join units u on u.id = s.unit_id
            where s.status = 'ACTIVE' and s.outstanding > 0 and s.due_date between today and today + 3 loop
    money := to_char(r.outstanding, 'FM999,999,999,990.00');
    total := total + public.notify_many(array(select public.unit_customers(r.unit_id)), null,
      r.organization_id, r.project_id, r.unit_id, 'INSTALMENT_DUE', 'INFO',
      r.label_th || ' ครบกำหนด ' || to_char(r.due_date, 'DD/MM/YYYY'),
      r.label_en || ' due ' || to_char(r.due_date, 'YYYY-MM-DD'),
      'ยอด ' || money || ' บาท', 'Amount THB ' || money, '/app/customer', 'inst-due:' || r.id);
  end loop;

  -- 2. Overdue instalments: weekly reminder to the buyer, once to finance, escalate to owners at 30 days.
  for r in select s.*, u.code unit_code, today - s.due_date days_over
             from payment_schedule_status s join units u on u.id = s.unit_id
            where s.status = 'ACTIVE' and s.payment_status = 'OVERDUE' and s.outstanding > 0 loop
    money := to_char(r.outstanding, 'FM999,999,999,990.00');
    total := total + public.notify_many(array(select public.unit_customers(r.unit_id)), null,
      r.organization_id, r.project_id, r.unit_id, 'INSTALMENT_OVERDUE', 'WARNING',
      r.label_th || ' เกินกำหนดชำระ ' || r.days_over || ' วัน', r.label_en || ' is ' || r.days_over || ' days overdue',
      'ยอดค้าง ' || money || ' บาท', 'Outstanding THB ' || money, '/app/customer',
      'inst-over:' || r.id || ':' || (r.days_over / 7));
    total := total + public.notify_many(array(select public.audience(r.project_id, 'FINANCE')), null,
      r.organization_id, r.project_id, r.unit_id, 'INSTALMENT_OVERDUE', 'WARNING',
      'งวดค้างชำระ · ' || r.unit_code || ' · ' || r.label_th, 'Overdue instalment · ' || r.unit_code || ' · ' || r.label_en,
      money || ' THB', money || ' THB',
      '/app/projects/' || r.project_id || '/units/' || r.unit_id || '/payments', 'inst-over-staff:' || r.id);
    if r.days_over > 30 then
      total := total + public.notify_many(array(select public.audience(r.project_id, 'OWNER')), null,
        r.organization_id, r.project_id, r.unit_id, 'INSTALMENT_ESCALATED', 'CRITICAL',
        'ค้างชำระเกิน 30 วัน · ' || r.unit_code, 'Instalment over 30 days overdue · ' || r.unit_code,
        money || ' THB', money || ' THB',
        '/app/projects/' || r.project_id || '/units/' || r.unit_id || '/payments', 'inst-esc:' || r.id);
    end if;
  end loop;

  -- 3. Approvals waiting: remind the approvers after 2 days, escalate to owners after 5.
  for r in
    select 'BOOKING' k, b.id, b.organization_id org, b.project_id, b.unit_id, b.booking_no ref, b.created_at since,
           'SALES' grp, '/app/sales/bookings' lnk from bookings b where b.status = 'PENDING_APPROVAL'
    union all
    select 'DRAWING', r2.id, r2.organization_id, r2.project_id, null, r2.revision_code, r2.submitted_at,
           'DESIGN', '/app/projects/' || r2.project_id || '/design/drawings/' || r2.drawing_id
      from drawing_revisions r2 where r2.status = 'IN_REVIEW'
    union all
    select 'VO', v.id, v.organization_id, v.project_id, v.unit_id, v.vo_no, v.updated_at,
           'CONSTRUCTION', '/app/projects/' || v.project_id || '/changes/' || v.id
      from variation_orders v where v.status = 'PENDING_INTERNAL'
    union all
    select 'CR', c.id, c.organization_id, c.project_id, c.unit_id, c.cr_no, c.created_at,
           'CONSTRUCTION', '/app/projects/' || c.project_id || '/changes' from change_requests c where c.status = 'SUBMITTED'
    union all
    select 'PR', x.id, x.organization_id, x.project_id, x.unit_id, x.pr_no, x.created_at,
           'PROCUREMENT', '/app/projects/' || x.project_id || '/procurement/requests/' || x.id
      from purchase_requests x where x.status = 'SUBMITTED'
    union all
    select 'PO', o.id, o.organization_id, o.project_id, o.unit_id, o.po_no, o.created_at,
           'PROCUREMENT', '/app/projects/' || o.project_id || '/procurement?view=orders'
      from purchase_orders o where o.status = 'PENDING_APPROVAL'
    union all
    select 'CLAIM', cl.id, cl.organization_id, cl.project_id, null, cl.claim_no, cl.created_at,
           'PROCUREMENT', '/app/projects/' || cl.project_id || '/procurement?view=claims'
      from progress_claims cl where cl.status = 'SUBMITTED'
    union all
    select 'EVIDENCE', ev.id, ev.organization_id, ev.project_id, ev.unit_id, u.code, ev.submitted_at,
           'FINANCE', '/app/projects/' || ev.project_id || '/units/' || ev.unit_id || '/payments'
      from payment_evidence ev join units u on u.id = ev.unit_id where ev.status = 'SUBMITTED'
    union all
    select 'BUDGET', bv.id, bv.organization_id, bv.project_id, null, 'v' || bv.version, bv.submitted_at,
           'OWNER', '/app/projects/' || bv.project_id || '/procurement?view=boq'
      from budget_versions bv where bv.status = 'SUBMITTED'
  loop
    continue when r.since is null or r.since > now() - interval '2 days';
    total := total + public.notify_many(array(select public.audience(r.project_id, r.grp)), null,
      r.org, r.project_id, r.unit_id, 'APPROVAL_WAITING', 'WARNING',
      'รออนุมัติเกิน 2 วัน · ' || r.ref, 'Awaiting approval for over 2 days · ' || r.ref,
      null, null, r.lnk, 'appr:' || r.id);
    if r.since < now() - interval '5 days' then
      total := total + public.notify_many(array(select public.audience(r.project_id, 'OWNER')), null,
        r.org, r.project_id, r.unit_id, 'APPROVAL_ESCALATED', 'CRITICAL',
        'ค้างอนุมัติเกิน 5 วัน · ' || r.ref, 'Approval stuck for over 5 days · ' || r.ref,
        null, null, r.lnk, 'appr-esc:' || r.id);
    end if;
  end loop;

  -- 4. Overdue site work.
  for r in select x.*, today - x.due_date days_over from rfis x
            where x.status = 'OPEN' and x.due_date < today loop
    total := total + public.notify_many(
      array(select public.audience(r.project_id, 'CONSTRUCTION')) || r.raised_by, null,
      r.organization_id, r.project_id, r.unit_id, 'RFI_OVERDUE', case when r.days_over > 7 then 'CRITICAL' else 'WARNING' end,
      'RFI เกินกำหนด · ' || r.rfi_no, 'RFI overdue · ' || r.rfi_no, r.subject, r.subject,
      '/app/projects/' || r.project_id || '/site/rfis/' || r.id, 'rfi-over:' || r.id);
  end loop;
  for r in select d.* from defects d where d.status = 'OPEN' and d.due_date < today loop
    total := total + public.notify_many(array(select public.audience(r.project_id, 'CONSTRUCTION')), null,
      r.organization_id, r.project_id, r.unit_id, 'DEFECT_OVERDUE', case when r.severity = 'HIGH' then 'CRITICAL' else 'WARNING' end,
      'ข้อบกพร่องเกินกำหนดแก้ · ' || r.defect_no, 'Defect past due · ' || r.defect_no, r.title, r.title,
      '/app/projects/' || r.project_id || '/site?view=defects', 'defect-over:' || r.id);
  end loop;
  for r in select s.* from service_requests s where s.status in ('OPEN','ASSIGNED') and s.due_date < today loop
    total := total + public.notify_many(array(select public.audience(r.project_id, 'CONSTRUCTION')), null,
      r.organization_id, r.project_id, r.unit_id, 'SERVICE_OVERDUE', 'WARNING',
      'แจ้งซ่อมเกินกำหนด · ' || r.sr_no, 'Service request overdue · ' || r.sr_no, r.title, r.title,
      '/app/projects/' || r.project_id || '/handover/' || r.unit_id, 'sr-over:' || r.id);
  end loop;
  for r in select o.* from purchase_orders o
            where o.status in ('APPROVED','PARTIALLY_RECEIVED') and o.delivery_due < today loop
    total := total + public.notify_many(
      array(select public.audience(r.project_id, 'PROCUREMENT')) || r.created_by, null,
      r.organization_id, r.project_id, r.unit_id, 'DELIVERY_OVERDUE', 'WARNING',
      'ส่งของล่าช้า · ' || r.po_no, 'Delivery overdue · ' || r.po_no, null, null,
      '/app/projects/' || r.project_id || '/procurement?view=orders', 'po-late:' || r.id);
  end loop;

  -- 5. Customer inspection appointments tomorrow.
  for r in select h.*, u.code unit_code from unit_handovers h join units u on u.id = h.unit_id
            where h.status = 'CUSTOMER_INSPECTION'
              and (h.inspection_scheduled_at at time zone 'Asia/Bangkok')::date = today + 1 loop
    total := total + public.notify_many(array(select public.unit_customers(r.unit_id)), null,
      r.organization_id, r.project_id, r.unit_id, 'INSPECTION_TOMORROW', 'INFO',
      'พรุ่งนี้นัดตรวจบ้าน ' || to_char(r.inspection_scheduled_at at time zone 'Asia/Bangkok', 'HH24:MI') || ' น.',
      'Home inspection tomorrow at ' || to_char(r.inspection_scheduled_at at time zone 'Asia/Bangkok', 'HH24:MI'),
      r.unit_code, r.unit_code, '/app/customer', 'insp:' || r.unit_id || ':' || today);
  end loop;

  -- 6. Monday digest for owners (scheduled report).
  if extract(isodow from today) = 1 then
    total := total + public.send_weekly_digest(today);
  end if;

  update automation_runs set finished_at = now(), notifications = total where id = run;
  return total;
end $$;

create or replace function public.send_weekly_digest(for_day date)
returns int language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  o record;
  v_owner uuid;
  total int := 0;
  sold int; collected numeric; overdue numeric; critical int; waiting int;
  b_th text; b_en text;
begin
  for o in select id from organizations loop
    select count(*) into sold from units u join projects p on p.id = u.project_id
     where p.organization_id = o.id and u.status in ('CONTRACTED','SOLD','TRANSFERRED');
    select coalesce(sum(amount), 0) into collected from payments
     where organization_id = o.id and status = 'VALID' and verified_at >= now() - interval '7 days';
    select coalesce(sum(outstanding), 0) into overdue from payment_schedule_status
     where organization_id = o.id and status = 'ACTIVE' and payment_status = 'OVERDUE';
    select count(*) into critical from defects
     where organization_id = o.id and status = 'OPEN' and severity = 'HIGH';
    select (select count(*) from bookings where organization_id = o.id and status = 'PENDING_APPROVAL')
         + (select count(*) from purchase_orders where organization_id = o.id and status = 'PENDING_APPROVAL')
         + (select count(*) from variation_orders where organization_id = o.id and status = 'PENDING_INTERNAL')
         + (select count(*) from payment_evidence where organization_id = o.id and status = 'SUBMITTED')
      into waiting;
    b_th := format('ขายแล้ว %s ยูนิต · รับเงิน 7 วัน %s บาท · ค้างเกินกำหนด %s บาท · ข้อบกพร่องร้ายแรง %s · รออนุมัติ %s',
                   sold, to_char(collected, 'FM999,999,999,990'), to_char(overdue, 'FM999,999,999,990'), critical, waiting);
    b_en := format('Sold %s units · Collected (7 days) THB %s · Overdue THB %s · High defects %s · Awaiting approval %s',
                   sold, to_char(collected, 'FM999,999,999,990'), to_char(overdue, 'FM999,999,999,990'), critical, waiting);
    for v_owner in select distinct om.user_id from organization_memberships om
                  where om.organization_id = o.id and om.status = 'ACTIVE' and public.user_is_owner(om.user_id, o.id)
                    and coalesce((select digest_enabled from notification_preferences where user_id = om.user_id), true) loop
      if public.notify(o.id, v_owner, null, null, 'WEEKLY_DIGEST', 'INFO',
                       'สรุปประจำสัปดาห์', 'Weekly summary', b_th, b_en, '/app/control',
                       'digest:' || o.id || ':' || to_char(for_day, 'IYYY-IW')) then
        total := total + 1;
      end if;
    end loop;
  end loop;
  return total;
end $$;

-- ---------------------------------------------------------------- delivery (email / LINE)

create or replace function public.vault_secret(secret_name text)
returns text language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = secret_name limit 1;
$$;

create or replace function public.deliver_outbox()
returns int language plpgsql security definer set search_path = public, extensions as $$
declare
  api_key text := public.vault_secret('resend_api_key');
  sender text := public.vault_secret('notify_email_from');
  line_token text := public.vault_secret('line_channel_access_token');
  base text := rtrim(coalesce(public.vault_secret('app_base_url'), ''), '/');
  r record;
  req bigint;
  msg text;
  sent int := 0;
begin
  -- Requests the provider rejected (pg_net keeps responses for a few hours).
  update notification_outbox o set status = 'FAILED', last_error = left(coalesce(h.content, h.error_msg, ''), 500)
    from net._http_response h
   where o.request_id = h.id and o.status = 'SENT' and (h.status_code is null or h.status_code >= 300)
     and h.created > now() - interval '1 day';

  for r in select o.id, o.channel, o.recipient, o.created_at, n.title_th, n.body_th, n.link
             from notification_outbox o join notifications n on n.id = o.notification_id
            where o.status = 'PENDING' order by o.created_at limit 100
            for update of o skip locked loop
    msg := concat_ws(E'\n', r.title_th, r.body_th,
                     case when base <> '' and r.link is not null then base || '/th' || r.link end);
    if r.channel = 'EMAIL' and api_key is not null and sender is not null then
      select net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json'),
        body := jsonb_build_object('from', sender, 'to', jsonb_build_array(r.recipient),
                                   'subject', r.title_th, 'text', msg)) into req;
    elsif r.channel = 'LINE' and line_token is not null then
      select net.http_post(
        url := 'https://api.line.me/v2/bot/message/push',
        headers := jsonb_build_object('Authorization', 'Bearer ' || line_token, 'Content-Type', 'application/json'),
        body := jsonb_build_object('to', r.recipient,
                                   'messages', jsonb_build_array(jsonb_build_object('type', 'text', 'text', left(msg, 4900))))) into req;
    else
      update notification_outbox
         set attempts = attempts + 1, last_error = r.channel || ' provider not configured',
             status = case when r.created_at < now() - interval '3 days' then 'SKIPPED' else 'PENDING' end
       where id = r.id;
      continue;
    end if;
    update notification_outbox set status = 'SENT', request_id = req, sent_at = now(), attempts = attempts + 1,
                                   last_error = null
     where id = r.id;
    sent := sent + 1;
  end loop;
  return sent;
end $$;

-- ---------------------------------------------------------------- client RPCs

create or replace function public.mark_notifications_read(target_ids uuid[] default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (target_ids is null or id = any(target_ids));
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.save_notification_preferences(email_on boolean, line_on boolean,
  line_id text, digest_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  if line_on and coalesce(trim(line_id), '') = '' then raise exception 'LINE user ID required'; end if;
  insert into notification_preferences (user_id, email_enabled, line_enabled, line_user_id, digest_enabled, updated_at)
  values (auth.uid(), coalesce(email_on, false), coalesce(line_on, false), nullif(trim(line_id), ''),
          coalesce(digest_on, true), now())
  on conflict (user_id) do update set email_enabled = excluded.email_enabled, line_enabled = excluded.line_enabled,
    line_user_id = excluded.line_user_id, digest_enabled = excluded.digest_enabled, updated_at = now();
end $$;

create or replace function public.rotate_calendar_token()
returns text language plpgsql security definer set search_path = public, extensions as $$
declare tok text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  insert into calendar_feeds (user_id, token) values (auth.uid(), tok)
  on conflict (user_id) do update set token = excluded.token, created_at = now();
  return tok;
end $$;

-- Which delivery channels are configured. Booleans only; secrets never leave the database.
create or replace function public.integration_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'email', public.vault_secret('resend_api_key') is not null and public.vault_secret('notify_email_from') is not null,
    'line', public.vault_secret('line_channel_access_token') is not null,
    'base_url', public.vault_secret('app_base_url') is not null,
    'scheduler', exists(select 1 from cron.job where jobname = 'pdm-daily-automation'));
$$;

create or replace function public.run_automation_now()
returns int language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from organizations o where public.can_manage_access(o.id)) then
    raise exception 'Not authorized';
  end if;
  return public.run_automation();
end $$;

-- Calendar feed: events the token's owner may see, from 30 days back to 180 days ahead.
create or replace function public.calendar_events(feed_token text)
returns table(uid text, starts_at timestamptz, all_day boolean, title text, description text, link text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  who uuid;
  from_d date := current_date - 30;
  to_d date := current_date + 180;
begin
  select f.user_id into who from calendar_feeds f where f.token = feed_token;
  if who is null or length(coalesce(feed_token, '')) < 32 then return; end if;

  -- Staff: inspections, viewings, milestones, deliveries and RFI due dates in their projects.
  return query
    select 'insp-' || h.unit_id, h.inspection_scheduled_at, false, 'ตรวจบ้าน · ' || u.code, p.code,
           '/app/projects/' || h.project_id || '/handover/' || h.unit_id
      from unit_handovers h join units u on u.id = h.unit_id join projects p on p.id = h.project_id
     where h.inspection_scheduled_at::date between from_d and to_d
       and (public.user_can_access_project(who, h.project_id) or who in (select public.unit_customers(h.unit_id)));
  return query
    select 'view-' || v.id, v.scheduled_at, false, 'นัดชมโครงการ · ' || l.full_name, p.code,
           '/app/sales/leads/' || v.lead_id
      from viewings v join leads l on l.id = v.lead_id join projects p on p.id = v.project_id
     where v.status = 'SCHEDULED' and v.scheduled_at::date between from_d and to_d
       and public.user_can_access_project(who, v.project_id);
  return query
    select 'ms-' || a.id, a.forecast_finish::timestamptz, true,
           '◆ ' || a.name_th || coalesce(' · ' || u.code, ''), p.code,
           '/app/projects/' || a.project_id || coalesce('/units/' || a.unit_id, '') || '/schedule'
      from schedule_activities a join projects p on p.id = a.project_id left join units u on u.id = a.unit_id
     where a.is_milestone and a.status <> 'COMPLETED' and a.forecast_finish between from_d and to_d
       and public.user_can_access_project(who, a.project_id);
  return query
    select 'po-' || o.id, o.delivery_due::timestamptz, true, 'ส่งของ · ' || o.po_no, p.code,
           '/app/projects/' || o.project_id || '/procurement?view=orders'
      from purchase_orders o join projects p on p.id = o.project_id
     where o.status in ('APPROVED','PARTIALLY_RECEIVED') and o.delivery_due between from_d and to_d
       and public.user_can_access_project(who, o.project_id);
  return query
    select 'rfi-' || r.id, r.due_date::timestamptz, true, 'RFI ครบกำหนด · ' || r.rfi_no, r.subject,
           '/app/projects/' || r.project_id || '/site/rfis/' || r.id
      from rfis r
     where r.status = 'OPEN' and r.due_date between from_d and to_d
       and public.user_can_access_project(who, r.project_id);
  -- Instalment due dates: the buyer, and staff with finance access.
  return query
    select 'inst-' || s.id, s.due_date::timestamptz, true, 'ครบกำหนดชำระ · ' || s.label_th || ' · ' || u.code,
           to_char(s.amount, 'FM999,999,999,990.00') || ' THB',
           case when who in (select public.unit_customers(s.unit_id)) then '/app/customer'
                else '/app/projects/' || s.project_id || '/units/' || s.unit_id || '/payments' end
      from payment_schedules s join units u on u.id = s.unit_id join projects p on p.id = s.project_id
     where s.status = 'ACTIVE' and s.due_date between from_d and to_d
       and (who in (select public.unit_customers(s.unit_id))
         or public.user_is_owner(who, s.organization_id)
         or (public.user_can_access_project(who, s.project_id)
             and public.user_has_permission(who, s.organization_id, s.project_id, 'FINANCE', 'VIEW')));
end $$;

-- ---------------------------------------------------------------- grants

do $$
declare f text;
begin
  foreach f in array array[
    'user_has_permission(uuid, uuid, uuid, text, text)', 'user_is_owner(uuid, uuid)',
    'user_can_access_project(uuid, uuid)', 'audience(uuid, text)', 'unit_customers(uuid)',
    'notify(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text)',
    'notify_many(uuid[], uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text)',
    'notify_from_timeline()', 'notify_payment_evidence()', 'notify_service_request()',
    'run_automation()', 'send_weekly_digest(date)', 'vault_secret(text)', 'deliver_outbox()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'mark_notifications_read(uuid[])', 'save_notification_preferences(boolean, boolean, text, boolean)',
    'rotate_calendar_token()', 'integration_status()', 'run_automation_now()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.calendar_events(text) from public;
grant execute on function public.calendar_events(text) to anon, authenticated;

-- ---------------------------------------------------------------- schedules (UTC)

select cron.schedule('pdm-daily-automation', '0 1 * * *', 'select public.run_automation()');
select cron.schedule('pdm-deliver-notifications', '*/5 * * * *', 'select public.deliver_outbox()');
