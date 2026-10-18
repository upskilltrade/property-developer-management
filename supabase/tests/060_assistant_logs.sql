-- Assistant logs: a customer's turns are attributed to the selling organization so the owner can
-- review them; other customers can't read them.
do $$
declare
  p uuid := pg_temp.t_project(2);
  owner uuid := pg_temp.t_user('owner');
  cust uuid := pg_temp.t_user('customer');
  other uuid := pg_temp.t_user('other-customer');
  n int;
begin
  perform pg_temp.t_grant(owner, 'OWNER');
  perform pg_temp.t_customer(cust, pg_temp.t_unit(p, 'T-01'));
  perform pg_temp.t_customer(other, pg_temp.t_unit(p, 'T-02'));

  perform pg_temp.t_as(cust);
  perform public.log_assistant_turn('งวดถัดไปเท่าไหร่', array['customer'], 100, 20, 'end_turn');
  select count(*) into n from assistant_logs where user_id = cust;
  perform pg_temp.t_ok(n = 1, 'customer reads their own log');

  perform pg_temp.t_as(other);
  select count(*) into n from assistant_logs where user_id = cust;
  perform pg_temp.t_ok(n = 0, 'another customer cannot read it');

  perform pg_temp.t_as(owner);
  select count(*) into n from assistant_logs where user_id = cust and organization_id = pg_temp.t_org();
  perform pg_temp.t_ok(n = 1, 'owner can review the customer''s log');
  perform pg_temp.t_as(null);
end $$;
