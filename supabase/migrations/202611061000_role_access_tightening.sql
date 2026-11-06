-- Role access tightening (audit 2026-11-06).
--
-- 1. Customer money (installments, payments, slips, bookings, sale prices) was readable by every
--    staff role on the project. It is now limited to people who work with it: finance/cost viewers,
--    sales/CRM, payment verifiers and installment managers. The owner keeps full access.
-- 2. Contractor contracts are limited to procurement, cost control and finance.
-- 3. A suspended membership now also cuts customer and contractor portal access, which is keyed
--    on customers.primary_profile_id and partner_contacts.profile_id rather than the membership.

-- True when the signed-in user's membership in the organisation is not ACTIVE (suspended).
-- No membership row at all is not "suspended": older customer links may have none.
create or replace function public.is_suspended(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists(
    select 1 from organization_memberships om
     where om.organization_id = target_org and om.user_id = auth.uid() and om.status <> 'ACTIVE');
$$;

-- Who may read a project's customer money: installments, payments, slips, bookings, sale prices.
create or replace function public.can_see_unit_money(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.can_view_finance(target_project)
      or public.can_see_leads(target_project)
      or public.can_verify_payments(target_project)
      or public.can_manage_payment_schedule(target_project);
$$;

revoke all on function public.is_suspended(uuid) from public, anon;
revoke all on function public.can_see_unit_money(uuid) from public, anon;
grant execute on function public.is_suspended(uuid) to authenticated;
grant execute on function public.can_see_unit_money(uuid) to authenticated;

-- 1. Customer money -----------------------------------------------------------------------------
drop policy if exists payments_project_select on public.payments;
create policy payments_project_select on public.payments
  for select to authenticated using (public.can_see_unit_money(project_id));

drop policy if exists payment_schedules_project_select on public.payment_schedules;
create policy payment_schedules_project_select on public.payment_schedules
  for select to authenticated using (public.can_see_unit_money(project_id));

drop policy if exists payment_evidence_project_select on public.payment_evidence;
create policy payment_evidence_project_select on public.payment_evidence
  for select to authenticated using (public.can_see_unit_money(project_id));

drop policy if exists online_payments_select on public.online_payments;
create policy online_payments_select on public.online_payments
  for select to authenticated
  using (public.is_unit_customer(unit_id) or public.can_see_unit_money(project_id));

drop policy if exists bookings_project_select on public.bookings;
create policy bookings_project_select on public.bookings
  for select to authenticated using (public.can_see_unit_money(project_id));

drop policy if exists unit_holds_project_select on public.unit_holds;
create policy unit_holds_project_select on public.unit_holds
  for select to authenticated using (public.can_see_leads(project_id));

drop policy if exists us_select on public.unit_sales;
create policy us_select on public.unit_sales
  for select to authenticated
  using (exists(select 1 from units u where u.id = unit_sales.unit_id
                  and public.can_see_unit_money(u.project_id)));

-- Slip files in storage follow the same rule as the slip rows.
create or replace function public.can_read_payment_evidence(object_name text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists(
    select 1 from payment_evidence e
     where e.file_path = object_name
       and (public.can_see_unit_money(e.project_id) or public.is_unit_customer(e.unit_id)));
$$;

-- 2. Contractor contracts -----------------------------------------------------------------------
drop policy if exists procurement_contracts_select on public.procurement_contracts;
create policy procurement_contracts_select on public.procurement_contracts
  for select to authenticated
  using (public.can_procure(project_id, 'VIEW')
      or public.can_cost(project_id, 'VIEW')
      or public.can_view_finance(project_id));

-- 3. Suspended accounts lose portal access ------------------------------------------------------
-- The customer and contractor checks are spread over several functions; each gets the same extra
-- condition next to its "this is me" test. The block fails if any function no longer matches, so a
-- later rewrite of one of them cannot silently skip the check.
do $$
declare
  fixes constant text[][] := array[
    ['is_unit_customer', 'c.primary_profile_id = auth.uid()',
       'c.primary_profile_id = auth.uid() and not public.is_suspended(c.organization_id)'],
    ['can_see_customer', 'c.primary_profile_id = auth.uid()',
       'c.primary_profile_id = auth.uid() and not public.is_suspended(c.organization_id)'],
    ['customer_can_view_photo', 'c.primary_profile_id = auth.uid()',
       'c.primary_profile_id = auth.uid() and not public.is_suspended(c.organization_id)'],
    ['get_customer_portal', 'c.primary_profile_id = auth.uid()',
       'c.primary_profile_id = auth.uid() and not public.is_suspended(c.organization_id)'],
    ['get_customer_payments', 'c.primary_profile_id = auth.uid()',
       'c.primary_profile_id = auth.uid() and not public.is_suspended(c.organization_id)'],
    ['get_customer_bank_accounts', 'cu.primary_profile_id = auth.uid()',
       'cu.primary_profile_id = auth.uid() and not public.is_suspended(cu.organization_id)'],
    ['my_partner_ids', 'c.profile_id = auth.uid()',
       'c.profile_id = auth.uid() and not public.is_suspended(p.organization_id)']
  ];
  i int;
  fn regprocedure;
  def text;
begin
  for i in 1 .. array_length(fixes, 1) loop
    select p.oid::regprocedure into strict fn
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = fixes[i][1];
    def := pg_get_functiondef(fn);
    if position('is_suspended' in def) > 0 then
      continue; -- already applied
    end if;
    if position(fixes[i][2] in def) = 0 then
      raise exception 'role_access_tightening: % no longer contains "%"', fixes[i][1], fixes[i][2];
    end if;
    execute replace(def, fixes[i][2], fixes[i][3]);
  end loop;
end $$;
