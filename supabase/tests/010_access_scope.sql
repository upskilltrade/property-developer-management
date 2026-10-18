-- Who can see what: project scope, outsiders, customers.
do $$
declare
  p1 uuid := pg_temp.t_project(2);
  p2 uuid := pg_temp.t_project(1);
  owner uuid := pg_temp.t_user('owner');
  site uuid := pg_temp.t_user('site');
  outsider uuid := pg_temp.t_user('outsider');
  cust uuid := pg_temp.t_user('customer');
  other_cust uuid := pg_temp.t_user('other-customer');
  n int;
  j jsonb;
begin
  perform pg_temp.t_grant(owner, 'OWNER');
  perform pg_temp.t_grant(site, 'SITE_ENGINEER', p1);
  perform pg_temp.t_customer(cust, pg_temp.t_unit(p1, 'T-01'));
  perform pg_temp.t_customer(other_cust, pg_temp.t_unit(p1, 'T-02'));

  perform pg_temp.t_as(owner);
  select count(*) into n from units where project_id in (p1, p2);
  perform pg_temp.t_ok(n = 3, 'owner sees every project''s units');

  perform pg_temp.t_as(site);
  select count(*) into n from units where project_id = p1;
  perform pg_temp.t_ok(n = 2, 'project-scoped engineer sees their project');
  select count(*) into n from units where project_id = p2;
  perform pg_temp.t_ok(n = 0, 'project-scoped engineer does not see another project');
  perform pg_temp.t_ok(not public.can_view_finance(p1), 'site engineer has no finance access');

  perform pg_temp.t_as(outsider);
  select count(*) into n from units where project_id in (p1, p2);
  perform pg_temp.t_ok(n = 0, 'outsider sees no units');
  select count(*) into n from customers where organization_id = pg_temp.t_org();
  perform pg_temp.t_ok(n = 0, 'outsider sees no customers');
  select count(*) into n from projects where id in (p1, p2);
  perform pg_temp.t_ok(n = 0, 'outsider sees no projects');

  perform pg_temp.t_as(cust);
  j := public.get_customer_portal();
  perform pg_temp.t_ok(jsonb_array_length(j) = 1 and j->0->>'unit_code' = 'T-01', 'customer portal lists only their own unit');
  select count(*) into n from customers where primary_profile_id = other_cust;
  perform pg_temp.t_ok(n = 0, 'customer cannot read another customer');
  select count(*) into n from cash_accounts;
  perform pg_temp.t_ok(n = 0, 'customer cannot read bank account rows directly');
  perform pg_temp.t_as(null);
end $$;
