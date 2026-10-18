-- Omise PromptPay: reserve → attach charge → settle only with the server key and a matching charge;
-- settlement is idempotent and pays the installment once.
do $$
declare
  p uuid := pg_temp.t_project(1);
  u uuid := pg_temp.t_unit(p, 'T-01');
  owner uuid := pg_temp.t_user('owner');
  cust uuid := pg_temp.t_user('customer');
  stranger uuid := pg_temp.t_user('stranger');
  s uuid; op uuid; op2 uuid; key text; res text; n int; st text;
begin
  key := public.vault_secret('payment_settle_key');
  if key is null then
    key := 'test-settle-key-' || gen_random_uuid();
    perform vault.create_secret(key, 'payment_settle_key');
  end if;
  perform pg_temp.t_grant(owner, 'OWNER');
  perform pg_temp.t_customer(cust, u);
  perform pg_temp.t_as(owner);
  perform public.set_payment_schedule(u, '[{"amount":150000,"due_date":"2027-01-01"}]');
  select id into s from payment_schedules where unit_id = u and status = 'ACTIVE';

  perform pg_temp.t_as(cust);
  perform pg_temp.t_refused(format('select public.begin_online_payment(%L, 150000.01)', s), 'Invalid amount', 'more than outstanding');
  op := public.begin_online_payment(s, 150000);
  perform pg_temp.t_refused(format('select public.attach_online_charge(%L, ''not-a-charge'', null, null)', op), 'Invalid charge', 'bad charge id');
  perform pg_temp.t_as(stranger);
  perform pg_temp.t_refused(format('select public.begin_online_payment(%L, 1)', s), 'Not authorized', 'stranger starting a payment');
  perform pg_temp.t_refused(format('select public.attach_online_charge(%L, ''chrg_test_x'', null, null)', op), 'Not authorized', 'stranger attaching a charge');
  perform pg_temp.t_as(cust);
  perform public.attach_online_charge(op, 'chrg_test_5abc', 'https://api.omise.co/charges/chrg_test_5abc/documents/qr', now() + interval '1 day');

  perform pg_temp.t_refused(format('select public.settle_online_payment(''wrong'', %L, ''chrg_test_5abc'', ''successful'', 15000000, ''thb'', now(), null)', op),
    'Not authorized', 'settle without the server key');
  perform pg_temp.t_refused(format('select public.settle_online_payment(%L, %L, ''chrg_test_5abc'', ''successful'', 100, ''thb'', now(), null)', key, op),
    'does not match', 'settle with a different amount');
  perform pg_temp.t_refused(format('select public.settle_online_payment(%L, %L, ''chrg_other'', ''successful'', 15000000, ''thb'', now(), null)', key, op),
    'Unknown charge', 'settle a charge that is not attached');
  res := public.settle_online_payment(key, op, 'chrg_test_5abc', 'pending', 15000000, 'thb', null, null);
  perform pg_temp.t_ok(res = 'PENDING', 'pending charge leaves it pending: ' || res);
  res := public.settle_online_payment(key, op, 'chrg_test_5abc', 'successful', 15000000, 'thb', now(), null);
  res := public.settle_online_payment(key, op, 'chrg_test_5abc', 'successful', 15000000, 'thb', now(), null);
  perform pg_temp.t_ok(res = 'SUCCESSFUL', 'settled');

  perform pg_temp.t_as(owner);
  select count(*) into n from payments where schedule_id = s and status = 'VALID';
  perform pg_temp.t_ok(n = 1, 'exactly one payment recorded for repeated settlement');
  select payment_status into st from payment_schedule_status where id = s;
  perform pg_temp.t_ok(st = 'PAID', 'installment paid (' || coalesce(st, 'null') || ')');
  perform pg_temp.t_ok((select receipt_no like 'RC-%' and reference = 'Omise PromptPay chrg_test_5abc' from payments where online_payment_id = op),
    'receipt and Omise reference on the payment');
  perform pg_temp.t_refused(format('select public.begin_online_payment(%L, 1)', s), 'Invalid amount', 'nothing left to pay');
  perform pg_temp.t_as(null);
end $$;
