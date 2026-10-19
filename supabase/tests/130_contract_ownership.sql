-- Ownership structures: a split contract lays out a land lease + construction part, cannot be
-- signed until the parts add up to the price, keeps amounts fixed after signing while Land Office
-- registration can still be recorded; lease terms over 30 years are refused.
do $$
declare
  p uuid := pg_temp.t_project(1);
  org uuid := pg_temp.t_org();
  owner uuid := pg_temp.t_user('owner');
  site uuid := pg_temp.t_user('site');
  buyer uuid := pg_temp.t_user('buyer');
  u uuid := pg_temp.t_unit(p, 'T-01');
  cust uuid; bk uuid; k uuid; lease uuid; build uuid; file text;
begin
  perform pg_temp.t_grant(owner, 'OWNER');
  perform pg_temp.t_grant(site, 'SITE_ENGINEER', p);
  cust := pg_temp.t_customer(buyer, u);
  insert into bookings (organization_id, project_id, unit_id, customer_id, booking_no, agreed_price, status)
  values (org, p, u, cust, 'BK-T1', 10000000, 'CONFIRMED') returning id into bk;

  perform pg_temp.t_as(owner);
  k := public.create_contract(bk, '{"contract_price":"10000000"}');
  perform public.set_contract_ownership(k, 'SPLIT');
  perform pg_temp.t_ok((select count(*) = 2 from contract_parts where contract_id = k and removed_at is null), 'split lays out two parts');
  select id into lease from contract_parts where contract_id = k and kind = 'LAND_LEASE';
  select id into build from contract_parts where contract_id = k and kind = 'CONSTRUCTION';
  perform pg_temp.t_ok((select lease_years = 30 from contract_parts where id = lease), 'lease defaults to 30 years');
  perform pg_temp.t_refused(format('select public.save_contract_part(%L, %L)', k,
    jsonb_build_object('id', lease, 'kind', 'LAND_LEASE', 'label', 'เช่า', 'amount', '4000000', 'lease_years', '31')),
    'Lease term', 'lease longer than 30 years');
  perform public.save_contract_part(k, jsonb_build_object('id', lease, 'kind', 'LAND_LEASE', 'label', 'สัญญาเช่าที่ดิน', 'amount', '4000000', 'lease_years', '30'));
  perform public.save_contract_part(k, jsonb_build_object('id', build, 'kind', 'CONSTRUCTION', 'label', 'สัญญาจ้างก่อสร้าง', 'amount', '5000000'));

  perform pg_temp.t_as(null);
  file := org || '/' || p || '/' || u || '/' || k || '/signed.pdf';
  insert into storage.objects (bucket_id, name) values ('contract-files', file);
  perform pg_temp.t_as(owner);
  perform pg_temp.t_refused(format('select public.sign_contract(%L, current_date, %L)', k, file), 'do not add up', 'signing when parts are short');
  perform public.save_contract_part(k, jsonb_build_object('id', build, 'kind', 'CONSTRUCTION', 'label', 'สัญญาจ้างก่อสร้าง', 'amount', '6000000'));
  perform public.sign_contract(k, current_date, file);
  perform pg_temp.t_ok((select status = 'SIGNED' and ownership_type = 'SPLIT' from sales_contracts where id = k), 'signed as split');

  perform public.save_contract_part(k, jsonb_build_object('id', lease, 'amount', '1', 'lease_start', '2026-11-01',
    'land_office_no', 'ทด.123/2569', 'registered_on', current_date::text));
  perform pg_temp.t_ok((select amount = 4000000 and land_office_no = 'ทด.123/2569' and lease_start = '2026-11-01'
    from contract_parts where id = lease), 'after signing: registration saved, amount unchanged');
  perform pg_temp.t_refused(format('select public.remove_contract_part(%L)', build), 'cannot be changed', 'removing a part after signing');
  perform pg_temp.t_refused(format('select public.set_contract_ownership(%L, %L)', k, 'FREEHOLD'), 'cannot be changed', 'changing structure after signing');

  perform pg_temp.t_as(buyer);
  perform pg_temp.t_ok((select count(*) = 2 from contract_parts where contract_id = k), 'customer sees the parts of their signed contract');
  perform pg_temp.t_as(site);
  perform pg_temp.t_ok((select count(*) = 0 from contract_parts where contract_id = k), 'site engineer sees no contract parts');
  perform pg_temp.t_as(null);
end $$;
