-- Weekly reminder: a signed land lease longer than 3 years must be registered at the Land Office
-- (Civil and Commercial Code s.538). Owners and sales approvers of the project get a notification for
-- each signed land-lease part that still has no registration number a week after signing.
create or replace function public.notify_unregistered_leases()
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  total int := 0;
  wk text := to_char(current_date, 'IYYY-IW');
begin
  for r in
    select cp.id part_id, cp.label, cp.lease_years, sc.id contract_id, sc.contract_no, sc.organization_id,
           sc.project_id, sc.unit_id, sc.signed_on, u.code unit_code
      from contract_parts cp
      join sales_contracts sc on sc.id = cp.contract_id
      join units u on u.id = sc.unit_id
     where cp.kind = 'LAND_LEASE' and cp.removed_at is null and coalesce(cp.lease_years, 0) > 3
       and nullif(trim(cp.land_office_no), '') is null
       and sc.status = 'SIGNED' and sc.signed_on <= current_date - 7
  loop
    total := total + public.notify_many(array(select public.audience(r.project_id, 'SALES')), null,
      r.organization_id, r.project_id, r.unit_id, 'LEASE_REGISTRATION', 'WARNING',
      'สัญญาเช่ายังไม่จดทะเบียน · ' || r.unit_code,
      'Lease not registered yet · ' || r.unit_code,
      r.contract_no || ' · ' || r.label || ' (' || r.lease_years || ' ปี) ลงนาม ' || to_char(r.signed_on, 'DD/MM/') ||
        (extract(year from r.signed_on)::int + 543) || ' — เช่าเกิน 3 ปีต้องจดทะเบียนที่สำนักงานที่ดิน',
      r.contract_no || ' · ' || r.label || ' (' || r.lease_years || ' years) signed ' || to_char(r.signed_on, 'YYYY-MM-DD') ||
        ' — leases over 3 years must be registered at the Land Office',
      '/app/sales/contracts/' || r.contract_id,
      'lease-reg:' || r.part_id || ':' || wk);
  end loop;
  return total;
end $$;
revoke all on function public.notify_unregistered_leases() from public, anon, authenticated;

-- Mondays 02:15 UTC (09:15 Bangkok).
select cron.unschedule('pdm-lease-registration') where exists(select 1 from cron.job where jobname = 'pdm-lease-registration');
select cron.schedule('pdm-lease-registration', '15 2 * * 1', 'select public.notify_unregistered_leases()');
