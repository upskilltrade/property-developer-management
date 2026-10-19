-- Adding users: only Owner/Admin may look up logins, add members or change their status; adding
-- twice doesn't duplicate the role; an owner cannot suspend themselves.
do $$
declare
  p uuid := pg_temp.t_project(1);
  org uuid := pg_temp.t_org();
  owner uuid := pg_temp.t_user('owner');
  site uuid := pg_temp.t_user('site');
  newbie uuid := pg_temp.t_user('newbie');
  pm uuid := (select id from roles where organization_id = pg_temp.t_org() and code = 'PROJECT_MANAGER' and is_system);
  mid uuid; own_mid uuid;
begin
  perform pg_temp.t_grant(owner, 'OWNER');
  perform pg_temp.t_grant(site, 'SITE_ENGINEER', p);

  perform pg_temp.t_as(site);
  perform pg_temp.t_refused(format('select public.account_for_email(%L, %L)', org, 'x@test.invalid'), 'Not authorized', 'site engineer looking up a login');
  perform pg_temp.t_refused(format('select * from public.member_directory(%L)', org), 'Not authorized', 'site engineer listing logins');
  perform pg_temp.t_refused(format('select public.add_member(%L, %L, %L, %L, %L, %L)', org, newbie, 'x', pm, 'PROJECT', p),
    'Not authorized', 'site engineer adding a member');

  perform pg_temp.t_as(owner);
  mid := public.add_member(org, newbie, 'คุณใหม่', pm, 'PROJECT', p);
  perform public.add_member(org, newbie, 'คุณใหม่', pm, 'PROJECT', p);
  perform pg_temp.t_ok((select count(*) = 1 from membership_roles where membership_id = mid), 'adding twice keeps one role');
  perform pg_temp.t_ok((select display_name = 'คุณใหม่' from profiles where id = newbie), 'display name saved');
  perform pg_temp.t_ok(exists(select 1 from public.member_directory(org) d where d.user_id = newbie and d.email like 'newbie.%'),
    'directory shows the login email');
  perform pg_temp.t_refused(format('select public.add_member(%L, %L, %L, %L, %L, %L)', org, newbie, 'x', gen_random_uuid(), 'ORGANIZATION', null),
    'Invalid role', 'role from nowhere');
  perform pg_temp.t_refused(format('select public.add_member(%L, %L, %L, %L, %L, %L)', org, newbie, 'x', pm, 'PROJECT', gen_random_uuid()),
    'Invalid scope', 'project outside the organization');

  perform public.set_member_status(mid, 'SUSPENDED');
  perform pg_temp.t_ok((select status = 'SUSPENDED' from organization_memberships where id = mid), 'member suspended');
  perform public.add_member(org, newbie, '', pm, 'PROJECT', p);
  perform pg_temp.t_ok((select status = 'ACTIVE' from organization_memberships where id = mid), 'adding again re-activates');
  select id into own_mid from organization_memberships where organization_id = org and user_id = owner;
  perform pg_temp.t_refused(format('select public.set_member_status(%L, %L)', own_mid, 'SUSPENDED'), 'own access', 'owner suspending themselves');
  perform pg_temp.t_as(null);
end $$;
