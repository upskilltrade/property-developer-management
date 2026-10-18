-- Customer payments: evidence → verification → receipt, separation of duties, reversals.
do $$
declare
  p uuid := pg_temp.t_project(1);
  u uuid := pg_temp.t_unit(p, 'T-01');
  owner uuid := pg_temp.t_user('owner');
  cust uuid := pg_temp.t_user('customer');
  s1 uuid; s2 uuid; ev uuid; pay uuid; fpath text; st text; n int;
begin
  perform pg_temp.t_grant(owner, 'OWNER');
  perform pg_temp.t_customer(cust, u);

  perform pg_temp.t_as(owner);
  perform pg_temp.t_ok(public.set_payment_schedule(u,
    '[{"kind":"BOOKING","amount":50000,"due_date":"2026-01-01"},{"kind":"TRANSFER","amount":4950000,"due_date":"2027-01-01"}]') = 2,
    'owner sets a two-installment schedule');
  select id into s1 from payment_schedules where unit_id = u and sequence = 1 and status = 'ACTIVE';
  select id into s2 from payment_schedules where unit_id = u and sequence = 2 and status = 'ACTIVE';

  -- Customer must attach a slip uploaded under the installment's own folder.
  perform pg_temp.t_as(cust);
  perform pg_temp.t_refused(format('select public.submit_payment_evidence(%L, 50000, current_date, ''TRANSFER'', null, null, null)', s1),
    'Evidence file required', 'customer evidence without a slip');
  perform pg_temp.t_as(null);
  select organization_id || '/' || project_id || '/' || unit_id || '/' || id || '/slip.jpg' into fpath from payment_schedules where id = s1;
  insert into storage.objects (bucket_id, name) values ('payment-evidence', fpath);
  perform pg_temp.t_as(cust);
  perform pg_temp.t_refused(format('select public.submit_payment_evidence(%L, 50000, current_date + 1, ''TRANSFER'', null, null, %L)', s1, fpath),
    'Invalid date', 'evidence dated in the future');
  ev := public.submit_payment_evidence(s1, 50000, current_date, 'TRANSFER', 'KBANK', null, fpath);
  perform pg_temp.t_refused(format('select public.verify_payment_evidence(%L, 50000, null, null)', ev),
    'Not authorized', 'customer verifying their own payment');
  select count(*) into n from payment_schedule_status where id = s1;
  perform pg_temp.t_ok(n = 0, 'customer cannot read the internal installment view');

  perform pg_temp.t_as(owner);
  select payment_status into st from payment_schedule_status where id = s1;
  perform pg_temp.t_ok(st = 'SUBMITTED', 'evidence marks the installment SUBMITTED, not PAID (got ' || coalesce(st, 'null') || ')');
  pay := public.verify_payment_evidence(ev, 50000, null, null);
  select payment_status into st from payment_schedule_status where id = s1;
  perform pg_temp.t_ok(st = 'PAID', 'verified payment marks the installment PAID');
  perform pg_temp.t_ok((select receipt_no like 'RC-%' from payments where id = pay), 'verification issues an RC receipt number');
  perform pg_temp.t_refused(format('select public.verify_payment_evidence(%L, 50000, null, null)', ev),
    'already reviewed', 'verifying the same evidence twice');

  -- Staff can submit on a customer's behalf but not verify it themselves.
  ev := public.submit_payment_evidence(s2, 1000, current_date, 'CASH', null, null, null);
  perform pg_temp.t_refused(format('select public.verify_payment_evidence(%L, 1000, null, null)', ev),
    'own evidence', 'staff verifying evidence they submitted');

  perform pg_temp.t_refused(format('select public.set_payment_schedule(%L, ''[{"amount":1,"due_date":"2027-01-01"}]'')', u),
    'already has payments', 'replacing a schedule that has payments');
  perform pg_temp.t_refused(format('select public.record_payment(%L, 10, current_date + 1, ''CASH'', null)', s2),
    'Invalid date', 'recording a payment dated in the future');

  perform pg_temp.t_refused(format('select public.reverse_payment(%L, '' '')', pay), 'Reason required', 'reversal without a reason');
  perform public.reverse_payment(pay, 'bounced');
  select payment_status into st from payment_schedule_status where id = s1;
  perform pg_temp.t_ok(st <> 'PAID', 'a reversed payment no longer counts (got ' || coalesce(st, 'null') || ')');
  select count(*) into n from payments where id = pay and status = 'REVERSED';
  perform pg_temp.t_ok(n = 1, 'reversal keeps the payment row as REVERSED');
  perform pg_temp.t_as(null);
end $$;
