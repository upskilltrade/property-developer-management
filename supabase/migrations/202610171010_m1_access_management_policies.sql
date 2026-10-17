-- M1 access management: let organization owners actually manage people, roles and overrides.
-- Before this, roles were select-only, membership_roles / organization_memberships / profiles were
-- self-select only (an owner could not see or assign anyone else), and role_permissions /
-- membership_permission_overrides were writable by FINANCE_MANAGER, who could grant themselves access.

-- Owner of the organization (system OWNER role at organization scope). Only owners manage access.
create or replace function public.can_manage_access(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from organization_memberships om
    join membership_roles mr on mr.membership_id = om.id
    join roles r on r.id = mr.role_id
    where om.organization_id = target_org and om.user_id = auth.uid() and om.status = 'ACTIVE'
      and r.code = 'OWNER' and r.is_system and mr.scope_type = 'ORGANIZATION'
  );
$$;
revoke all on function public.can_manage_access(uuid) from public, anon;
grant execute on function public.can_manage_access(uuid) to authenticated;

-- Members and their profiles are visible to the organization's owners.
create policy memberships_access_manager_select on public.organization_memberships
  for select to authenticated using (public.can_manage_access(organization_id));
create policy profiles_access_manager_select on public.profiles
  for select to authenticated using (exists(
    select 1 from public.organization_memberships om
    where om.user_id = profiles.id and public.can_manage_access(om.organization_id)));

-- Custom roles: owners create and edit their organization's non-system roles.
create policy roles_custom_access_manager on public.roles
  for all to authenticated
  using (organization_id is not null and not is_system and public.can_manage_access(organization_id))
  with check (organization_id is not null and not is_system and code like 'CUSTOM\_%'
    and public.can_manage_access(organization_id));

-- Role permissions: only owners, and only on custom roles. System role permissions come from migrations.
drop policy if exists "role permissions managed by org managers" on public.role_permissions;
create policy role_permissions_custom_access_manager on public.role_permissions
  for all to authenticated
  using (exists(select 1 from public.roles r where r.id = role_id and not r.is_system
    and r.organization_id is not null and public.can_manage_access(r.organization_id)))
  with check (exists(select 1 from public.roles r where r.id = role_id and not r.is_system
    and r.organization_id is not null and public.can_manage_access(r.organization_id))
    and exists(select 1 from public.permission_catalog c
      where c.module_code = role_permissions.module_code and c.action_code = role_permissions.action_code
        and c.is_active));

-- Role assignments: owners see and manage assignments in their organization. The role and any
-- project scope must belong to the same organization as the membership.
create policy membership_roles_access_manager_select on public.membership_roles
  for select to authenticated using (exists(
    select 1 from public.organization_memberships m
    where m.id = membership_id and public.can_manage_access(m.organization_id)));
create policy membership_roles_access_manager_write on public.membership_roles
  for all to authenticated
  using (exists(
    select 1 from public.organization_memberships m
    where m.id = membership_id and public.can_manage_access(m.organization_id)))
  with check (exists(
    select 1 from public.organization_memberships m
    join public.roles r on r.id = membership_roles.role_id and r.organization_id = m.organization_id
    where m.id = membership_id and public.can_manage_access(m.organization_id)
      and (membership_roles.scope_type = 'ORGANIZATION' or exists(
        select 1 from public.projects p
        where p.id = membership_roles.scope_id and p.organization_id = m.organization_id))));

-- Per-person overrides: owners only; the permission must exist in the catalog and a project
-- scope must belong to the membership's organization.
drop policy if exists "overrides visible to org managers" on public.membership_permission_overrides;
drop policy if exists "overrides managed by org managers" on public.membership_permission_overrides;
create policy overrides_access_manager on public.membership_permission_overrides
  for all to authenticated
  using (exists(
    select 1 from public.organization_memberships m
    where m.id = membership_id and public.can_manage_access(m.organization_id)))
  with check (exists(
    select 1 from public.organization_memberships m
    where m.id = membership_id and public.can_manage_access(m.organization_id)
      and (membership_permission_overrides.scope_type = 'ORGANIZATION' or exists(
        select 1 from public.projects p
        where p.id = membership_permission_overrides.scope_id and p.organization_id = m.organization_id)))
    and exists(select 1 from public.permission_catalog c
      where c.module_code = membership_permission_overrides.module_code
        and c.action_code = membership_permission_overrides.action_code and c.is_active));
