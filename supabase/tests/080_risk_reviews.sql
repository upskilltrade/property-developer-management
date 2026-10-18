-- AI risk reviews: internal staff can save one; it's readable by its author and the owner only.
do $$
declare
  p uuid := pg_temp.t_project(1);
  org uuid := pg_temp.t_org();
  owner uuid := pg_temp.t_user('owner');
  pm uuid := pg_temp.t_user('pm');
  site uuid := pg_temp.t_user('site');
  cust uuid := pg_temp.t_user('customer');
  rid uuid; n int;
  review jsonb := '{"summary_th":"สรุป","summary_en":"summary","risks":[{"title_th":"x","evidence":[{"id":"I1","label":"x","link":"/th/app"}]}],"record_count":5}';
begin
  perform pg_temp.t_grant(owner, 'OWNER');
  perform pg_temp.t_grant(pm, 'PROJECT_MANAGER', p);
  perform pg_temp.t_grant(site, 'SITE_ENGINEER', p);
  perform pg_temp.t_customer(cust, pg_temp.t_unit(p, 'T-01'));

  perform pg_temp.t_as(pm);
  rid := public.save_risk_review(org, p, review);
  select count(*) into n from risk_reviews where id = rid;
  perform pg_temp.t_ok(n = 1, 'author reads their review');
  perform pg_temp.t_refused(format('select public.save_risk_review(%L, %L, %L)', org, p, '{"summary_th":"","risks":[]}'),
    'Invalid review', 'review without a summary');

  perform pg_temp.t_as(site);
  select count(*) into n from risk_reviews where id = rid;
  perform pg_temp.t_ok(n = 0, 'other staff cannot read someone else''s review');

  perform pg_temp.t_as(owner);
  select count(*) into n from risk_reviews where id = rid;
  perform pg_temp.t_ok(n = 1, 'owner reads every review');

  perform pg_temp.t_as(cust);
  perform pg_temp.t_refused(format('select public.save_risk_review(%L, %L, %L)', org, p, review),
    'Not authorized', 'customer saving a review');
  perform pg_temp.t_refused(format('insert into risk_reviews (organization_id, summary_th, summary_en, created_by) values (%L, ''x'', ''x'', %L)', org, cust),
    'row-level security|permission denied', 'direct insert');
  perform pg_temp.t_as(null);
end $$;
