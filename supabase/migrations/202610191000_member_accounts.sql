-- Owner/Admin add users directly: the app creates the login (email + a password the owner sets)
-- through the Auth admin API, then these functions attach the membership and role. Users must
-- change that password on first sign-in (flag kept in Auth app_metadata, which users cannot edit).

-- Members with their login email and sign-in state, for the access screen.
create or replace function public.member_directory(target_org uuid)
returns table(membership_id uuid, user_id uuid, email text, last_sign_in_at timestamptz, must_change_password boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_manage_access(target_org) then raise exception 'Not authorized'; end if;
  return query
    select om.id, om.user_id, u.email::text, u.last_sign_in_at,
           coalesce((u.raw_app_meta_data->>'must_change_password')::boolean, false)
      from organization_memberships om join auth.users u on u.id = om.user_id
     where om.organization_id = target_org;
end $$;

-- The login id for an email, so an existing account can be added instead of duplicated.
create or replace function public.account_for_email(target_org uuid, account_email text)
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_manage_access(target_org) then raise exception 'Not authorized'; end if;
  return (select id from auth.users where lower(email) = lower(trim(account_email)));
end $$;

-- Adds (or re-activates) a member and gives them one role, org-wide or on one project.
create or replace function public.add_member(target_org uuid, target_user uuid, display_name text,
  target_role uuid, scope_type text, scope_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  if not public.can_manage_access(target_org) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from profiles where id = target_user) then raise exception 'No account'; end if;
  if not exists(select 1 from roles where id = target_role and organization_id = target_org) then
    raise exception 'Invalid role';
  end if;
  if scope_type not in ('ORGANIZATION', 'PROJECT')
     or (scope_type = 'PROJECT' and not exists(select 1 from projects where id = scope_id and organization_id = target_org)) then
    raise exception 'Invalid scope';
  end if;
  if coalesce(trim(add_member.display_name), '') <> '' then
    update profiles p set display_name = trim(add_member.display_name) where p.id = target_user;
  end if;
  insert into organization_memberships (organization_id, user_id, status)
  values (target_org, target_user, 'ACTIVE')
  on conflict (organization_id, user_id) do update set status = 'ACTIVE';
  select id into mid from organization_memberships where organization_id = target_org and user_id = target_user;
  insert into membership_roles (membership_id, role_id, scope_type, scope_id)
  select mid, target_role, add_member.scope_type, case when add_member.scope_type = 'PROJECT' then add_member.scope_id end
  where not exists(select 1 from membership_roles mr where mr.membership_id = mid and mr.role_id = target_role
    and mr.scope_type = add_member.scope_type and mr.scope_id is not distinct from
      (case when add_member.scope_type = 'PROJECT' then add_member.scope_id end));
  return mid;
end $$;

-- Suspend or re-activate a member; an owner cannot suspend themselves.
create or replace function public.set_member_status(target_membership uuid, new_status text)
returns void language plpgsql security definer set search_path = public as $$
declare m organization_memberships%rowtype;
begin
  select * into m from organization_memberships where id = target_membership;
  if m.id is null or not public.can_manage_access(m.organization_id) then raise exception 'Not authorized'; end if;
  if new_status not in ('ACTIVE', 'SUSPENDED') then raise exception 'Invalid status'; end if;
  if m.user_id = auth.uid() then raise exception 'Cannot change your own access'; end if;
  update organization_memberships set status = new_status::membership_status where id = target_membership;
end $$;

revoke all on function public.member_directory(uuid) from public, anon;
revoke all on function public.account_for_email(uuid, text) from public, anon;
revoke all on function public.add_member(uuid, uuid, text, uuid, text, uuid) from public, anon;
revoke all on function public.set_member_status(uuid, text) from public, anon;
grant execute on function public.member_directory(uuid) to authenticated;
grant execute on function public.account_for_email(uuid, text) to authenticated;
grant execute on function public.add_member(uuid, uuid, text, uuid, text, uuid) to authenticated;
grant execute on function public.set_member_status(uuid, text) to authenticated;
