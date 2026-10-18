-- Legacy CSV import: all-or-nothing, dry runs, imported flags, no invented approvals.
do $$
declare
  p uuid := pg_temp.t_project(0);
  owner uuid := pg_temp.t_user('owner');
  manager uuid := pg_temp.t_user('pm');
  res jsonb; n int; errs text;
begin
  perform pg_temp.t_grant(owner, 'OWNER');
  perform pg_temp.t_grant(manager, 'PROJECT_MANAGER', p);

  perform pg_temp.t_as(manager);
  perform pg_temp.t_refused(format('select public.import_project_data(%L, ''UNITS'', ''[{"unit_code":"X"}]'')', p),
    'Not authorized', 'non-owner import');

  perform pg_temp.t_as(owner);
  res := public.import_project_data(p, 'UNITS',
    '[{"unit_code":"u-1","list_price":"4,500,000","target_completion_date":"31/12/2569"},{"unit_code":"U-1"},{"unit_code":"U-3","phase_code":"NOPE"},{"unit_code":"U-4","target_completion_date":"12-31"}]',
    'units.csv', null, false);
  select string_agg(coalesce(x->>'error', 'ok'), ',') into errs from jsonb_array_elements(res->'results') x;
  perform pg_temp.t_ok(errs = 'ok,duplicate_in_file:unit_code,not_found:phase_code,invalid_date:target_completion_date', 'row errors: ' || errs);
  select count(*) into n from units where project_id = p;
  perform pg_temp.t_ok(n = 0 and res->>'batch_id' is null, 'a batch with errors saves nothing');

  res := public.import_project_data(p, 'UNITS', '[{"unit_code":"u-1","list_price":"4,500,000","target_completion_date":"31/12/2569"},{"unit_code":"U-2"}]', 'units.csv', null, true);
  select count(*) into n from units where project_id = p;
  perform pg_temp.t_ok((res->>'ok')::boolean and n = 0, 'a dry run saves nothing');

  res := public.import_project_data(p, 'UNITS', '[{"unit_code":"u-1","list_price":"4,500,000","target_completion_date":"31/12/2569"},{"unit_code":"U-2"}]', 'units.csv', null, false);
  perform pg_temp.t_ok((select target_completion_date = '2026-12-31' and list_price = 4500000 and import_batch_id is not null
                          from units where project_id = p and code = 'U-1'), 'Buddhist-era date and separators parsed; row marked imported');

  res := public.import_project_data(p, 'SALES', '[{"unit_code":"U-1","customer_name":"คุณนำเข้า","phone":"081-000-0000","status":"contracted","agreed_price":"4400000","contract_date":"2026-08-15","legacy_contract_no":"OLD-1"}]', 's.csv', null, false);
  perform pg_temp.t_ok((select u.status = 'CONTRACTED' and us.legacy_contract_no = 'OLD-1' from units u join unit_sales us on us.unit_id = u.id
                          where u.project_id = p and u.code = 'U-1'), 'sale imported and unit status updated');
  select count(*) into n from bookings where project_id = p;
  perform pg_temp.t_ok(n = 0, 'no booking approvals are invented');

  res := public.import_project_data(p, 'SCHEDULES', '[{"unit_code":"U-1","sequence":"1","kind":"BOOKING","amount":"50000","due_date":"2026-08-01"},{"unit_code":"U-1","sequence":"2","amount":"4350000","due_date":"2027-03-01"},{"unit_code":"U-2","sequence":"1","amount":"1","due_date":"2027-03-01"}]', 'p.csv', null, true);
  perform pg_temp.t_ok(res->'results'->2->>'error' = 'no_customer', 'schedule needs a customer');

  res := public.import_project_data(p, 'SCHEDULES', '[{"unit_code":"U-1","sequence":"1","kind":"BOOKING","amount":"50000","due_date":"2026-08-01"},{"unit_code":"U-1","sequence":"2","amount":"4350000","due_date":"2027-03-01"}]', 'p.csv', null, false);
  res := public.import_project_data(p, 'PAYMENTS', '[{"unit_code":"U-1","sequence":"1","amount":"60000","paid_on":"2026-08-01"},{"unit_code":"U-1","sequence":"2","amount":"1","paid_on":"2999-01-01"}]', 'pay.csv', null, true);
  select string_agg(coalesce(x->>'error', 'ok'), ',') into errs from jsonb_array_elements(res->'results') x;
  perform pg_temp.t_ok(errs = 'exceeds_installment,future_date:paid_on', 'payment checks: ' || errs);

  res := public.import_project_data(p, 'PAYMENTS', '[{"unit_code":"U-1","sequence":"1","amount":"50000","paid_on":"01/08/2569","legacy_receipt_no":"OLD-RC-1"}]', 'pay.csv', null, false);
  perform pg_temp.t_ok((select imported and receipt_no = 'OLD-RC-1' and evidence_id is null from payments where project_id = p),
    'payment keeps the legacy receipt number, is flagged imported, and has no invented evidence review');
  perform pg_temp.t_ok((select (public.get_receipt(id)->>'imported')::boolean from payments where project_id = p), 'receipt says imported');
  res := public.import_project_data(p, 'PAYMENTS', '[{"unit_code":"U-1","sequence":"2","amount":"1","paid_on":"2026-08-01","legacy_receipt_no":"OLD-RC-1"}]', 'pay.csv', null, true);
  perform pg_temp.t_ok(res->'results'->0->>'error' = 'receipt_exists', 'duplicate receipt number refused');
  perform pg_temp.t_as(null);
end $$;
