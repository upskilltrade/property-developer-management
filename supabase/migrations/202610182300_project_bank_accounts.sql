-- Project bank accounts: a project can hold several bank accounts (customer receipts, construction
-- spending, escrow, loan drawdown...). They live in cash_accounts, so the posting engine and
-- the finance documents keep working unchanged; project_id null means an org-wide account.
-- Accounts are never deleted: closing one sets active = false.

alter table public.cash_accounts add column if not exists project_id uuid references public.projects(id);
alter table public.cash_accounts add column if not exists account_name text;
alter table public.cash_accounts add column if not exists account_number text;
alter table public.cash_accounts add column if not exists branch text;
alter table public.cash_accounts add column if not exists account_type text
  check (account_type in ('SAVINGS','CURRENT','FIXED'));
alter table public.cash_accounts add column if not exists purpose text not null default 'GENERAL'
  check (purpose in ('GENERAL','CUSTOMER_RECEIPTS','CONSTRUCTION','ESCROW','LOAN'));
alter table public.cash_accounts add column if not exists promptpay_id text;
alter table public.cash_accounts add column if not exists show_to_customers boolean not null default false;
alter table public.cash_accounts add column if not exists is_default_receipt boolean not null default false;
alter table public.cash_accounts add column if not exists notes text;
alter table public.cash_accounts add column if not exists created_by uuid references public.profiles(id);
alter table public.cash_accounts add column if not exists updated_at timestamptz not null default now();

create index if not exists cash_accounts_project_idx on public.cash_accounts(project_id);
-- One default receiving account per project.
create unique index if not exists cash_accounts_default_receipt_uq
  on public.cash_accounts(project_id) where is_default_receipt and active;

-- Finance viewers of a project see its accounts; org-wide accounts stay with org finance.
alter policy cash_accounts_select on public.cash_accounts
  using (public.can_view_org_finance(organization_id)
         or (project_id is not null and public.can_view_finance(project_id)));
-- Writes go through the RPCs below so project, ledger and defaults stay consistent.
alter policy cash_accounts_insert on public.cash_accounts with check (false);
alter policy cash_accounts_update on public.cash_accounts using (false) with check (false);

-- Create or update a project bank account.
create or replace function public.save_project_bank_account(target_project uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  org uuid;
  aid uuid := public.try_uuid(nullif(data->>'id', ''));
  ledger uuid;
  acct text := regexp_replace(coalesce(data->>'account_number', ''), '[\s-]', '', 'g');
  pp text := nullif(regexp_replace(coalesce(data->>'promptpay_id', ''), '[\s-]', '', 'g'), '');
  bank text := nullif(trim(data->>'bank_name'), '');
  aname text := nullif(trim(data->>'account_name'), '');
  atype text := coalesce(nullif(data->>'account_type', ''), 'SAVINGS');
  purp text := coalesce(nullif(data->>'purpose', ''), 'GENERAL');
  dflt boolean := coalesce((data->>'is_default_receipt')::boolean, false);
  show boolean := coalesce((data->>'show_to_customers')::boolean, false);
  new_code text;
  n int;
begin
  select organization_id into org from projects where id = target_project;
  if org is null or not public.can_manage_payment_schedule(target_project) then
    raise exception 'Not authorized';
  end if;
  if bank is null or aname is null or acct !~ '^\d{10,15}$'
     or atype not in ('SAVINGS','CURRENT','FIXED')
     or purp not in ('GENERAL','CUSTOMER_RECEIPTS','CONSTRUCTION','ESCROW','LOAN')
     or (pp is not null and pp !~ '^(\d{10}|\d{13}|\d{15})$') then
    raise exception 'Invalid bank account';
  end if;
  -- The default receiving account is the one customers are told to pay into.
  if dflt then show := true; end if;

  if aid is not null and not exists(
       select 1 from cash_accounts where id = aid and project_id = target_project and active) then
    raise exception 'Invalid bank account';
  end if;
  if exists(select 1 from cash_accounts where project_id = target_project and active
              and account_number = acct and id is distinct from aid) then
    raise exception 'Duplicate bank account';
  end if;

  if dflt then
    update cash_accounts set is_default_receipt = false, updated_at = now()
     where project_id = target_project and is_default_receipt and id is distinct from aid;
  end if;

  if aid is null then
    select id into ledger from ledger_accounts where organization_id = org and code = '1100';
    if ledger is null then raise exception 'Cash ledger account 1100 missing'; end if;
    select count(*) + 1 into n from cash_accounts where organization_id = org;
    loop
      new_code := 'BANK-' || lpad(n::text, 3, '0');
      exit when not exists(select 1 from cash_accounts where organization_id = org and code = new_code);
      n := n + 1;
    end loop;
    insert into cash_accounts (organization_id, project_id, code, name, account_kind, bank_name, account_name,
      account_number, account_number_masked, branch, account_type, purpose, promptpay_id,
      show_to_customers, is_default_receipt, notes, currency_code, ledger_account_id,
      opening_balance, opening_date, created_by)
    values (org, target_project, new_code, bank || ' ' || right(acct, 4), 'BANK', bank, aname,
      acct, 'xxx-' || right(acct, 4), nullif(trim(data->>'branch'), ''), atype, purp, pp,
      show, dflt, nullif(trim(data->>'notes'), ''), 'THB', ledger,
      coalesce(nullif(data->>'opening_balance', '')::numeric, 0),
      coalesce(nullif(data->>'opening_date', '')::date, current_date), auth.uid())
    returning id into aid;
  else
    update cash_accounts set
      name = bank || ' ' || right(acct, 4), bank_name = bank, account_name = aname,
      account_number = acct, account_number_masked = 'xxx-' || right(acct, 4),
      branch = nullif(trim(data->>'branch'), ''), account_type = atype, purpose = purp,
      promptpay_id = pp, show_to_customers = show, is_default_receipt = dflt,
      notes = nullif(trim(data->>'notes'), ''), updated_at = now()
     where id = aid;
  end if;
  return aid;
end $$;

-- Close an account (kept for history and posted documents). Reopening is allowed.
create or replace function public.set_project_bank_account_active(account uuid, is_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare a cash_accounts;
begin
  select * into a from cash_accounts where id = account;
  if a.id is null or a.project_id is null or not public.can_manage_payment_schedule(a.project_id) then
    raise exception 'Not authorized';
  end if;
  update cash_accounts set active = is_active,
    is_default_receipt = case when is_active then is_default_receipt else false end,
    updated_at = now()
   where id = account;
end $$;

create or replace function public.set_project_default_bank_account(account uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a cash_accounts;
begin
  select * into a from cash_accounts where id = account;
  if a.id is null or a.project_id is null or not a.active
     or not public.can_manage_payment_schedule(a.project_id) then
    raise exception 'Not authorized';
  end if;
  update cash_accounts set is_default_receipt = false, updated_at = now()
   where project_id = a.project_id and is_default_receipt and id <> account;
  update cash_accounts set is_default_receipt = true, show_to_customers = true, updated_at = now()
   where id = account;
end $$;

-- Accounts a customer may pay into: active, marked for customers, on projects where they own a unit.
create or replace function public.get_customer_bank_accounts()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'project_id', c.project_id, 'bank_name', c.bank_name,
           'account_name', c.account_name, 'account_number', c.account_number, 'branch', c.branch,
           'account_type', c.account_type, 'promptpay_id', c.promptpay_id,
           'is_default', c.is_default_receipt)
         order by c.is_default_receipt desc, c.code), '[]'::jsonb)
    from cash_accounts c
   where c.active and c.show_to_customers and c.project_id in (
     select u.project_id from units u
      where exists(select 1 from unit_sales us join customers cu on cu.id = us.customer_id
                    where us.unit_id = u.id and cu.primary_profile_id = auth.uid()));
$$;

revoke all on function public.save_project_bank_account(uuid, jsonb) from public, anon;
revoke all on function public.set_project_bank_account_active(uuid, boolean) from public, anon;
revoke all on function public.set_project_default_bank_account(uuid) from public, anon;
revoke all on function public.get_customer_bank_accounts() from public, anon;
grant execute on function public.save_project_bank_account(uuid, jsonb) to authenticated;
grant execute on function public.set_project_bank_account_active(uuid, boolean) to authenticated;
grant execute on function public.set_project_default_bank_account(uuid) to authenticated;
grant execute on function public.get_customer_bank_accounts() to authenticated;
