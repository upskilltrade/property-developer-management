-- Project bank accounts: validation, one main account, customer visibility.
do $$
declare
  p uuid := pg_temp.t_project(1);
  other uuid := pg_temp.t_project(1);
  owner uuid := pg_temp.t_user('owner');
  cust uuid := pg_temp.t_user('customer');
  a1 uuid; a2 uuid; a3 uuid; n int; j jsonb;
begin
  perform pg_temp.t_grant(owner, 'OWNER');
  perform pg_temp.t_customer(cust, pg_temp.t_unit(p, 'T-01'));

  perform pg_temp.t_as(owner);
  a1 := public.save_project_bank_account(p, '{"bank_name":"ธนาคารกสิกรไทย","account_name":"บจก. ทดสอบ","account_number":"123-4-56789-0","is_default_receipt":true}');
  a2 := public.save_project_bank_account(p, '{"bank_name":"ธนาคารไทยพาณิชย์","account_name":"บจก. ทดสอบ","account_number":"9876543210","show_to_customers":true}');
  a3 := public.save_project_bank_account(p, '{"bank_name":"ธนาคารกรุงเทพ","account_name":"บจก. ทดสอบ","account_number":"1112223334","purpose":"CONSTRUCTION"}');
  perform public.save_project_bank_account(other, '{"bank_name":"ธนาคารออมสิน","account_name":"x","account_number":"555555555555","is_default_receipt":true}');

  perform pg_temp.t_ok((select account_number = '1234567890' and account_number_masked = 'xxx-7890' and show_to_customers
                          from cash_accounts where id = a1), 'number normalised, masked, main account shown to customers');
  perform pg_temp.t_refused(format('select public.save_project_bank_account(%L, ''{"bank_name":"x","account_name":"y","account_number":"123"}'')', p),
    'Invalid bank account', 'too-short account number');
  perform pg_temp.t_refused(format('select public.save_project_bank_account(%L, ''{"bank_name":"x","account_name":"y","account_number":"1234567890","promptpay_id":"12345"}'')', p),
    'Invalid bank account', 'bad PromptPay id');
  perform pg_temp.t_refused(format('select public.save_project_bank_account(%L, ''{"bank_name":"x","account_name":"y","account_number":"9876543210"}'')', p),
    'Duplicate', 'duplicate account number in the project');
  perform pg_temp.t_refused(format('insert into cash_accounts (organization_id, code, name, account_kind, ledger_account_id) select organization_id, ''X'', ''x'', ''BANK'', ledger_account_id from cash_accounts where id = %L', a1),
    'row-level security', 'direct insert bypassing the RPC');

  perform public.set_project_default_bank_account(a2);
  select count(*) into n from cash_accounts where project_id = p and is_default_receipt;
  perform pg_temp.t_ok(n = 1 and (select is_default_receipt from cash_accounts where id = a2), 'exactly one main account per project');
  perform public.set_project_bank_account_active(a2, false);
  perform pg_temp.t_ok((select not active and not is_default_receipt from cash_accounts where id = a2), 'closing removes the main flag');

  perform pg_temp.t_as(cust);
  perform pg_temp.t_refused(format('select public.save_project_bank_account(%L, ''{"bank_name":"x","account_name":"y","account_number":"5555555555"}'')', p),
    'Not authorized', 'customer adding an account');
  j := public.get_customer_bank_accounts();
  perform pg_temp.t_ok(jsonb_array_length(j) = 1 and j->0->>'account_number' = '1234567890',
    'customer sees only active, customer-visible accounts of their own project: ' || j::text);
  perform pg_temp.t_as(null);
end $$;
