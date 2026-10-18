-- Shared helpers for database tests. The runner loads this before every test file inside one
-- transaction that is always rolled back, so tests never leave data behind.
-- Fixtures live in pg_temp and disappear with the session.

-- A throwaway auth user (the auth trigger creates the profile).
create function pg_temp.t_user(label text) returns uuid language plpgsql as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    label || '.' || left(uid::text, 8) || '@test.invalid', '', now(), now(), '{}', jsonb_build_object('display_name', label));
  insert into public.profiles (id, display_name) values (uid, label) on conflict (id) do nothing;
  return uid;
end $$;

-- The organization the tests run in: the first one that has an owner.
create function pg_temp.t_org() returns uuid language sql as $$
  select om.organization_id from public.organization_memberships om
    join public.membership_roles mr on mr.membership_id = om.id
    join public.roles r on r.id = mr.role_id
   where r.code = 'OWNER' and om.status = 'ACTIVE'
   order by om.created_at limit 1;
$$;

-- A fresh project with `units` units (codes T-01, T-02, ...).
create function pg_temp.t_project(units int default 2) returns uuid language plpgsql as $$
declare pid uuid;
begin
  insert into public.projects (organization_id, code, name, status)
  values (pg_temp.t_org(), 'TEST-' || upper(left(gen_random_uuid()::text, 6)), 'Test project', 'ACTIVE')
  returning id into pid;
  insert into public.units (project_id, code, status, list_price, currency_code)
  select pid, 'T-' || lpad(g::text, 2, '0'), 'AVAILABLE', 5000000, 'THB' from generate_series(1, units) g;
  return pid;
end $$;

-- Grants a system role, org-wide (scope null) or on one project.
create function pg_temp.t_grant(uid uuid, role_code text, project uuid default null) returns void language plpgsql as $$
declare mid uuid;
begin
  select id into mid from public.organization_memberships where organization_id = pg_temp.t_org() and user_id = uid;
  if mid is null then
    insert into public.organization_memberships (organization_id, user_id, status)
    values (pg_temp.t_org(), uid, 'ACTIVE') returning id into mid;
  end if;
  insert into public.membership_roles (membership_id, role_id, scope_type, scope_id)
  select mid, r.id, case when project is null then 'ORGANIZATION' else 'PROJECT' end, project
    from public.roles r where r.organization_id = pg_temp.t_org() and r.code = role_code and r.is_system;
  if not found then raise exception 'fixture: role % not found', role_code; end if;
end $$;

-- A customer who owns `unit` (linked to a login).
create function pg_temp.t_customer(uid uuid, unit uuid, price numeric default 5000000) returns uuid language plpgsql as $$
declare cid uuid;
begin
  insert into public.customers (organization_id, full_name, primary_profile_id)
  values (pg_temp.t_org(), 'Test customer', uid) returning id into cid;
  insert into public.unit_sales (unit_id, customer_id, status, agreed_price)
  values (unit, cid, 'CONTRACTED', price);
  return cid;
end $$;

create function pg_temp.t_unit(project uuid, unit_code text) returns uuid language sql as $$
  select id from public.units where project_id = project and code = unit_code;
$$;

-- Act as a user (null = back to the test runner's own role).
create function pg_temp.t_as(uid uuid) returns void language plpgsql as $$
begin
  if uid is null then
    perform set_config('request.jwt.claims', '', true);
    perform set_config('role', 'none', true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end $$;

create function pg_temp.t_ok(cond boolean, what text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', what; end if;
end $$;

-- Runs a statement and requires it to fail with a message matching `pattern`.
create function pg_temp.t_refused(stmt text, pattern text, what text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm !~* pattern then raise exception 'FAIL: % (refused with "%", expected /%/)', what, sqlerrm, pattern; end if;
    return;
  end;
  raise exception 'FAIL: % (was allowed)', what;
end $$;
