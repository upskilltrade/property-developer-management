-- Money and audit tables are written only through RPCs; even an owner can't write them directly.
do $$
declare
  p uuid := pg_temp.t_project(1);
  u uuid := pg_temp.t_unit(p, 'T-01');
  org uuid := pg_temp.t_org();
  owner uuid := pg_temp.t_user('owner');
  cust uuid := pg_temp.t_user('customer');
  s uuid;
begin
  perform pg_temp.t_grant(owner, 'OWNER');
  perform pg_temp.t_customer(cust, u);
  perform pg_temp.t_as(owner);
  perform public.set_payment_schedule(u, '[{"amount":1000,"due_date":"2027-01-01"}]');
  select id into s from payment_schedules where unit_id = u and status = 'ACTIVE';

  perform pg_temp.t_refused(format('insert into payments (organization_id, project_id, unit_id, schedule_id, amount, paid_on, method, receipt_no) values (%L, %L, %L, %L, 1000, current_date, ''CASH'', ''FAKE-1'')', org, p, u, s),
    'row-level security|permission denied', 'direct insert into payments');
  -- Without an update policy RLS silently matches no rows, so check the value instead.
  begin
    execute format('update payment_schedules set amount = 1 where id = %L', s);
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.t_ok((select amount from payment_schedules where id = s) = 1000, 'direct update of an installment has no effect');
  perform pg_temp.t_refused(format('insert into payment_schedules (organization_id, project_id, unit_id, sequence, kind, label_th, label_en, amount, due_date) values (%L, %L, %L, 9, ''OTHER'', ''x'', ''x'', 1, current_date)', org, p, u),
    'row-level security|permission denied', 'direct insert into payment_schedules');
  perform pg_temp.t_refused(format('insert into import_batches (organization_id, project_id, kind, row_count) values (%L, %L, ''UNITS'', 1)', org, p),
    'row-level security|permission denied', 'direct insert into import_batches');
  perform pg_temp.t_refused(format('insert into timeline_events (organization_id, project_id, event_type, entity_type, title) values (%L, %L, ''X'', ''x'', ''forged'')', org, p),
    'row-level security|permission denied', 'forging a timeline event');
  perform pg_temp.t_as(null);
end $$;
