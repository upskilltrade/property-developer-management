-- Financial plan: Owner/Admin edit, finance viewers read only, others see nothing.
do $$
declare
  p uuid := pg_temp.t_project(1);
  owner uuid := pg_temp.t_user('owner');
  admin uuid := pg_temp.t_user('admin');
  fin uuid := pg_temp.t_user('finance');
  site uuid := pg_temp.t_user('site');
  n int; lid uuid; land uuid; cat uuid;
begin
  perform pg_temp.t_grant(owner, 'OWNER');
  perform pg_temp.t_grant(admin, 'ADMIN');
  perform pg_temp.t_grant(fin, 'FINANCE_MANAGER');
  perform pg_temp.t_grant(site, 'SITE_ENGINEER', p);

  perform pg_temp.t_as(owner);
  perform public.init_project_forecast(p);
  perform public.init_project_forecast(p);
  select count(*) into n from forecast_lines where project_id = p and removed_at is null;
  perform pg_temp.t_ok(n = 25, 'init creates every category and the extra starter lines once (got ' || n || ')');
  select id, cost_category_id into land, cat from forecast_lines where project_id = p and category = 'LAND';
  perform pg_temp.t_ok(cat is not null, 'land line linked to the LAND cost category');
  perform pg_temp.t_ok((select rate is null and transfer_fee_pct is null from (select business_tax_pct rate, transfer_fee_pct from forecast_plans where project_id = p) x),
    'no tax rate is filled in by the system');

  perform pg_temp.t_as(admin);
  perform public.save_forecast_line(p, jsonb_build_object('id', land, 'kind', 'COST', 'category', 'LAND', 'label', 'ค่าที่ดิน',
    'method', 'LUMP', 'amount', '20000000', 'timing', 'START', 'cost_category_id', cat));
  perform public.save_forecast_plan(p, '{"sell_out_months":"36","sales_mode":"AGENT","agent_commission_pct":"3","business_tax_pct":"3.3"}');
  perform pg_temp.t_ok((select amount = 20000000 from forecast_lines where id = land), 'admin edits a line');
  perform pg_temp.t_ok((select sell_out_months = 36 and sales_mode = 'AGENT' from forecast_plans where project_id = p), 'admin edits the plan');
  perform pg_temp.t_refused(format('select public.save_forecast_plan(%L, ''{"business_tax_pct":"150"}'')', p), 'Invalid plan', 'rate over 100%');
  perform public.save_forecast_plan(p, '{"loan_rate_pct":"6.5","equity_amount":"10000000","land_area_sqm":"8000"}');
  perform pg_temp.t_ok((select loan_rate_pct = 6.5 and equity_amount = 10000000 and land_area_sqm = 8000
    from forecast_plans where project_id = p), 'loan rate, equity and land area saved');
  perform public.save_forecast_plan(p, '{"business_tax_pct":"3.3"}');
  perform pg_temp.t_ok((select loan_rate_pct = 6.5 from forecast_plans where project_id = p), 'omitted loan fields are kept');
  perform pg_temp.t_refused(format('select public.save_forecast_plan(%L, ''{"land_area_sqm":"-1"}'')', p), 'Invalid plan', 'negative land area');
  perform pg_temp.t_ok((select count(*) = 1 from forecast_lines where project_id = p and category = 'SALES_TEAM'
    and method = 'PCT_REVENUE' and self_sales_only), 'in-house sales commission line as % of revenue');
  perform pg_temp.t_refused(format('select public.save_forecast_line(%L, %L)', p,
    jsonb_build_object('kind', 'COST', 'category', 'OTHER', 'label', 'dup', 'method', 'LUMP', 'cost_category_id', cat)),
    'duplicate key|unique', 'linking one cost category to two lines');
  perform pg_temp.t_refused(format('select public.save_forecast_line(%L, %L)', p,
    jsonb_build_object('kind', 'REVENUE', 'category', 'LAND', 'label', 'x', 'method', 'LUMP')), 'Invalid line', 'revenue line in a cost category');
  lid := public.save_forecast_line(p, '{"kind":"COST","category":"CONSTRUCTION","label":"บ้านแบบ A","method":"PER_SQM","rate":"18000","quantity":"120"}');
  perform public.remove_forecast_line(lid);
  perform pg_temp.t_ok((select removed_at is not null from forecast_lines where id = lid), 'removing keeps the row (soft remove)');

  perform pg_temp.t_as(fin);
  select count(*) into n from forecast_lines where project_id = p and removed_at is null;
  perform pg_temp.t_ok(n = 25, 'finance can read the plan');
  perform pg_temp.t_refused(format('select public.save_forecast_plan(%L, ''{"sell_out_months":"12"}'')', p), 'Not authorized', 'finance editing the plan');

  perform pg_temp.t_as(site);
  select count(*) into n from forecast_lines where project_id = p;
  perform pg_temp.t_ok(n = 0, 'site engineer sees nothing');
  perform pg_temp.t_refused(format('select public.init_project_forecast(%L)', p), 'Not authorized', 'site engineer starting a plan');
  perform pg_temp.t_as(null);
end $$;
