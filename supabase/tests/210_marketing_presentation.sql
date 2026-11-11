-- The plan's presentation: marketing writes it, sales reads it.
do $$
declare
  p uuid := pg_temp.t_project(1);
  org uuid := (select organization_id from projects where id = p);
  mkt uuid := pg_temp.t_user('marketing');
  sales uuid := pg_temp.t_user('sales');
  n int;
begin
  perform pg_temp.t_grant(mkt, 'MARKETING_SALES', p);
  perform pg_temp.t_grant(sales, 'SALES', p);

  perform pg_temp.t_as(mkt);
  insert into marketing_plans (organization_id, project_id, presentation, presentation_at)
  values (org, p, '{"executive_summary":["Four villas"]}', now());
  perform pg_temp.t_refused(format('update marketing_plans set presentation = %L where project_id = %L', '[1,2]', p),
    'check constraint', 'presentation must be an object');

  perform pg_temp.t_as(sales);
  perform pg_temp.t_ok((select presentation->'executive_summary'->>0 from marketing_plans where project_id = p) = 'Four villas',
    'sales can read the presentation');
  update marketing_plans set presentation = '{}' where project_id = p;
  get diagnostics n = row_count;
  perform pg_temp.t_ok(n = 0, 'sales cannot change the presentation');
  perform pg_temp.t_as(null);
end $$;
