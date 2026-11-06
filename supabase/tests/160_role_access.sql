-- Role access tightening: customer money by role, suspended customer and contractor accounts.
do $$
declare
  p uuid := pg_temp.t_project(1);
  u uuid := pg_temp.t_unit(p, 'T-01');
  owner uuid := pg_temp.t_user('owner');
  site uuid := pg_temp.t_user('site');
  sales uuid := pg_temp.t_user('sales');
  fin uuid := pg_temp.t_user('finance');
  cust uuid := pg_temp.t_user('customer');
  sub uuid := pg_temp.t_user('contractor');
  partner uuid;
  n int;
  j jsonb;
begin
  perform pg_temp.t_grant(owner, 'OWNER');
  perform pg_temp.t_grant(site, 'SITE_ENGINEER', p);
  perform pg_temp.t_grant(sales, 'SALES', p);
  perform pg_temp.t_grant(fin, 'FINANCE_MANAGER');
  perform pg_temp.t_customer(cust, u);
  perform pg_temp.t_grant(cust, 'CUSTOMER');

  perform pg_temp.t_as(owner);
  perform public.set_payment_schedule(u, '[{"kind":"BOOKING","amount":50000,"due_date":"2026-01-01"}]');
  perform pg_temp.t_as(null);
  insert into procurement_contracts (organization_id, project_id, contract_no, contract_type, vendor_name, amount, status)
  values (pg_temp.t_org(), p, 'PC-T1', 'CONTRACT', 'Test builder', 1000000, 'DRAFT');

  -- Staff without finance or sales rights see the project but not the customer's money.
  perform pg_temp.t_as(site);
  select count(*) into n from units where project_id = p;
  perform pg_temp.t_ok(n = 1, 'site engineer still sees the project''s units');
  select count(*) into n from payment_schedules where project_id = p;
  perform pg_temp.t_ok(n = 0, 'site engineer cannot read installments');
  select count(*) into n from unit_sales where unit_id = u;
  perform pg_temp.t_ok(n = 0, 'site engineer cannot read the sale price');
  select count(*) into n from procurement_contracts where project_id = p;
  perform pg_temp.t_ok(n = 0, 'site engineer cannot read contractor contracts');

  perform pg_temp.t_as(sales);
  select count(*) into n from payment_schedules where project_id = p;
  perform pg_temp.t_ok(n = 1, 'sales reads installments of their project');
  select count(*) into n from unit_sales where unit_id = u;
  perform pg_temp.t_ok(n = 1, 'sales reads the sale');

  perform pg_temp.t_as(fin);
  select count(*) into n from payment_schedules where project_id = p;
  perform pg_temp.t_ok(n = 1, 'finance manager reads installments');
  select count(*) into n from procurement_contracts where project_id = p;
  perform pg_temp.t_ok(n = 1, 'finance manager reads contractor contracts');

  -- A suspended customer loses the portal.
  perform pg_temp.t_as(cust);
  j := public.get_customer_portal();
  perform pg_temp.t_ok(jsonb_array_length(j) = 1, 'active customer sees their unit');
  perform pg_temp.t_as(null);
  update organization_memberships set status = 'SUSPENDED' where user_id = cust;
  perform pg_temp.t_as(cust);
  j := public.get_customer_portal();
  perform pg_temp.t_ok(coalesce(jsonb_array_length(j), 0) = 0, 'suspended customer sees no unit');
  perform pg_temp.t_ok(not public.is_unit_customer(u), 'suspended customer is no longer the unit''s customer');

  -- A suspended contractor loses their partner scope.
  perform pg_temp.t_as(null);
  insert into partner_organizations (organization_id, partner_type, name)
  values (pg_temp.t_org(), 'CONTRACTOR', 'Test sub') returning id into partner;
  insert into partner_contacts (organization_id, partner_id, full_name, profile_id)
  values (pg_temp.t_org(), partner, 'Test foreman', sub);
  perform pg_temp.t_grant(sub, 'CONTRACTOR');
  perform pg_temp.t_as(sub);
  select count(*) into n from public.my_partner_ids();
  perform pg_temp.t_ok(n = 1, 'active contractor has their partner scope');
  perform pg_temp.t_as(null);
  update organization_memberships set status = 'SUSPENDED' where user_id = sub;
  perform pg_temp.t_as(sub);
  select count(*) into n from public.my_partner_ids();
  perform pg_temp.t_ok(n = 0, 'suspended contractor has no partner scope');
  perform pg_temp.t_as(null);
end $$;
