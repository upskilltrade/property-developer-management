-- Weekly reminder for signed land leases (> 3 years) with no Land Office registration a week after
-- signing; once a registration number is recorded the reminder stops; one per part per week.
do $$
declare
  p uuid := pg_temp.t_project(1);
  org uuid := pg_temp.t_org();
  owner uuid := pg_temp.t_user('owner');
  buyer uuid := pg_temp.t_user('buyer');
  u uuid := pg_temp.t_unit(p, 'T-01');
  cust uuid; bk uuid; k uuid; lease uuid;
begin
  perform pg_temp.t_grant(owner, 'OWNER');
  cust := pg_temp.t_customer(buyer, u);
  insert into bookings (organization_id, project_id, unit_id, customer_id, booking_no, agreed_price, status)
  values (org, p, u, cust, 'BK-L1', 9000000, 'CONFIRMED') returning id into bk;
  insert into sales_contracts (organization_id, project_id, unit_id, booking_id, customer_id, contract_no, status,
    ownership_type, signed_on, signed_version, signed_file_path)
  values (org, p, u, bk, cust, 'CT-L1', 'SIGNED', 'SPLIT', current_date - 10, 1, 'x/ct.pdf') returning id into k;
  insert into contract_parts (organization_id, project_id, contract_id, kind, label, amount, lease_years)
  values (org, p, k, 'LAND_LEASE', 'สัญญาเช่าที่ดิน', 4000000, 30) returning id into lease;
  -- Already registered, and a short lease: neither should remind.
  insert into contract_parts (organization_id, project_id, contract_id, kind, label, amount, lease_years, land_office_no)
  values (org, p, k, 'LAND_LEASE', 'เช่าแปลงข้าง', 100000, 30, 'ทด.1/2569'),
         (org, p, k, 'LAND_LEASE', 'เช่าระยะสั้น', 10000, 3, null);

  perform public.notify_unregistered_leases();
  perform public.notify_unregistered_leases();
  perform pg_temp.t_ok((select count(*) = 1 from notifications where user_id = owner and kind = 'LEASE_REGISTRATION'
    and link = '/app/sales/contracts/' || k), 'owner reminded once this week, only for the unregistered lease over 3 years');
end $$;
