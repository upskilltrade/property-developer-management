-- Raw project data for the AI plan: the brief on the plan and PROJECT_DATA files.
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
  insert into marketing_plans (organization_id, project_id, raw_brief) values (org, p, 'Pool villas for retirees');
  insert into marketing_assets (organization_id, project_id, category, title) values (org, p, 'PROJECT_DATA', 'Project deck');
  update marketing_plans set ai_summary = 'Read the deck', ai_drafted_at = now() where project_id = p;
  get diagnostics n = row_count;
  perform pg_temp.t_ok(n = 1, 'marketing records the AI draft');
  perform pg_temp.t_refused(format('insert into marketing_assets (organization_id, project_id, category, title) values (%L, %L, %L, %L)',
    org, p, 'NOT_A_CATEGORY', 'x'), 'check constraint', 'unknown categories still refused');

  perform pg_temp.t_as(sales);
  perform pg_temp.t_ok((select raw_brief from marketing_plans where project_id = p) = 'Pool villas for retirees',
    'sales can read the brief');
  update marketing_plans set raw_brief = 'x' where project_id = p;
  get diagnostics n = row_count;
  perform pg_temp.t_ok(n = 0, 'sales cannot change the brief');
  perform pg_temp.t_as(null);
end $$;
