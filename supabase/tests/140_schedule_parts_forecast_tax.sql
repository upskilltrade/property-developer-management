-- Instalments can be tied to a part of the house's own live contract (not another house's), and the
-- financial plan stores the lease / construction rates without touching the others when omitted.
do $$
declare
  p uuid := pg_temp.t_project(2);
  org uuid := pg_temp.t_org();
  owner uuid := pg_temp.t_user('owner');
  buyer uuid := pg_temp.t_user('buyer');
  buyer2 uuid := pg_temp.t_user('buyer2');
  u1 uuid := pg_temp.t_unit(p, 'T-01');
  u2 uuid := pg_temp.t_unit(p, 'T-02');
  c1 uuid; c2 uuid; bk1 uuid; bk2 uuid; k1 uuid; k2 uuid; lease1 uuid; lease2 uuid;
begin
  perform pg_temp.t_grant(owner, 'OWNER');
  c1 := pg_temp.t_customer(buyer, u1);
  c2 := pg_temp.t_customer(buyer2, u2);
  insert into bookings (organization_id, project_id, unit_id, customer_id, booking_no, agreed_price, status)
  values (org, p, u1, c1, 'BK-1', 9000000, 'CONFIRMED') returning id into bk1;
  insert into bookings (organization_id, project_id, unit_id, customer_id, booking_no, agreed_price, status)
  values (org, p, u2, c2, 'BK-2', 9000000, 'CONFIRMED') returning id into bk2;

  perform pg_temp.t_as(owner);
  k1 := public.create_contract(bk1, '{}');
  k2 := public.create_contract(bk2, '{}');
  perform public.set_contract_ownership(k1, 'SPLIT');
  perform public.set_contract_ownership(k2, 'SPLIT');
  select id into lease1 from contract_parts where contract_id = k1 and kind = 'LAND_LEASE';
  select id into lease2 from contract_parts where contract_id = k2 and kind = 'LAND_LEASE';

  perform public.set_payment_schedule(u1, jsonb_build_array(
    jsonb_build_object('kind', 'BOOKING', 'amount', 100000, 'due_date', current_date::text, 'contract_part_id', lease1),
    jsonb_build_object('kind', 'INSTALLMENT', 'amount', 8900000, 'due_date', (current_date + 30)::text)));
  perform pg_temp.t_ok((select count(*) = 1 from payment_schedule_status where unit_id = u1 and status = 'ACTIVE'
    and contract_part_id = lease1), 'instalment tied to the land lease part');
  perform pg_temp.t_refused(format('select public.set_payment_schedule(%L, %L)', u1, jsonb_build_array(
    jsonb_build_object('amount', 100000, 'due_date', current_date::text, 'contract_part_id', lease2))),
    'Invalid schedule', 'tying an instalment to another house''s contract');

  perform public.save_forecast_plan(p, '{"business_tax_pct":"3.3","lease_tax_pct":"5","construction_tax_pct":"7"}');
  perform pg_temp.t_ok((select lease_tax_pct = 5 and construction_tax_pct = 7 and lease_fee_pct is null
    from forecast_plans where project_id = p), 'lease and construction rates saved');
  perform public.save_forecast_plan(p, '{"business_tax_pct":"3.3"}');
  perform pg_temp.t_ok((select lease_tax_pct = 5 from forecast_plans where project_id = p), 'omitted rates are kept');
  perform pg_temp.t_refused(format('select public.save_forecast_plan(%L, %L)', p, '{"lease_fee_pct":"120"}'), 'Invalid plan', 'rate over 100%');
  perform pg_temp.t_as(null);
end $$;
