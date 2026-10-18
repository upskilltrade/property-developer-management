-- Scheduled monthly report: on the 1st of each month, owners get a notification (in-app, and
-- email/LINE through the existing outbox when they have it enabled) linking to last month's
-- report for each project. The report itself is computed when opened, through the reader's
-- own permissions, so the notice carries no figures.
create or replace function public.send_monthly_report_notice(for_month date default (date_trunc('month', current_date) - interval '1 month')::date)
returns int language plpgsql security definer set search_path = public as $$
declare
  p record;
  v_owner uuid;
  total int := 0;
  ym text := to_char(for_month, 'YYYY-MM');
  th_month text := to_char(for_month, 'MM') || '/' || (extract(year from for_month)::int + 543);
begin
  for p in select pr.id, pr.code, pr.name, pr.organization_id from projects pr order by pr.code loop
    for v_owner in select distinct om.user_id from organization_memberships om
                  where om.organization_id = p.organization_id and om.status = 'ACTIVE'
                    and public.user_is_owner(om.user_id, p.organization_id)
                    and coalesce((select digest_enabled from notification_preferences where user_id = om.user_id), true) loop
      if public.notify(p.organization_id, v_owner, p.id, null, 'MONTHLY_REPORT', 'INFO',
                       'รายงานประจำเดือน ' || th_month || ' · ' || p.code,
                       'Monthly report ' || ym || ' · ' || p.code,
                       p.name, p.name,
                       '/report/monthly?project=' || p.id || '&month=' || ym,
                       'monthly:' || p.id || ':' || ym) then
        total := total + 1;
      end if;
    end loop;
  end loop;
  return total;
end $$;
revoke all on function public.send_monthly_report_notice(date) from public, anon, authenticated;

-- 02:00 UTC (09:00 Bangkok) on the 1st, after the daily automation.
select cron.unschedule('pdm-monthly-report') where exists(select 1 from cron.job where jobname = 'pdm-monthly-report');
select cron.schedule('pdm-monthly-report', '0 2 1 * *', 'select public.send_monthly_report_notice()');
