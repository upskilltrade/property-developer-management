-- Customer portal: published construction progress for the customer's own unit
-- (docs/SCHEDULE-PROGRESS-SPEC.md step 5, SYSTEM-BLUEPRINT §12).
--
-- External roles (CUSTOMER / CONTRACTOR / INVESTOR) no longer count towards can_access_project:
-- a customer must never read internal project data (finance, costs, unpublished progress). The
-- portal reads through get_customer_portal(), which returns only published updates and photos
-- for units sold to the signed-in customer.

alter table public.customers
  add column if not exists primary_profile_id uuid references public.profiles(id) on delete set null;
create unique index if not exists customers_org_primary_profile_idx
  on public.customers(organization_id, primary_profile_id) where primary_profile_id is not null;

create or replace function public.can_access_project(target_project uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
 select exists(
  select 1 from projects p join organization_memberships om on om.organization_id=p.organization_id
  join membership_roles mr on mr.membership_id=om.id
  join roles r on r.id=mr.role_id
  where p.id=target_project and om.user_id=auth.uid() and om.status='ACTIVE'
   and r.code not in ('CUSTOMER','CONTRACTOR','INVESTOR')
   and (mr.scope_type='ORGANIZATION' or (mr.scope_type='PROJECT' and mr.scope_id=target_project))
 );
$function$;

-- Internal member = active member holding at least one internal role. Organization-wide data
-- (customers, ledger, cash accounts, org-level finance) was readable by any member, which would
-- include customers, contractors, investors and members still waiting for a role.
create or replace function public.is_internal_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from organization_memberships om
      join membership_roles mr on mr.membership_id = om.id
      join roles r on r.id = mr.role_id
     where om.organization_id = target_org and om.user_id = auth.uid() and om.status = 'ACTIVE'
       and r.code not in ('CUSTOMER','CONTRACTOR','INVESTOR'));
$$;
revoke all on function public.is_internal_member(uuid) from public, anon;
grant execute on function public.is_internal_member(uuid) to authenticated;

alter policy customers_select on public.customers using (public.is_internal_member(organization_id));
alter policy cash_accounts_select on public.cash_accounts using (public.is_internal_member(organization_id));
alter policy ledger_accounts_select on public.ledger_accounts using (public.is_internal_member(organization_id));
alter policy cost_categories_select on public.cost_categories using (public.is_internal_member(organization_id));
alter policy financial_documents_select on public.financial_documents
  using (public.is_internal_member(organization_id) and (project_id is null or public.can_access_project(project_id)));
alter policy journal_entries_select on public.journal_entries
  using (public.is_internal_member(organization_id) and (project_id is null or public.can_access_project(project_id)));
alter policy journal_lines_select on public.journal_lines
  using (exists(select 1 from public.journal_entries j
    where j.id = journal_lines.journal_entry_id and public.is_internal_member(j.organization_id)
      and (j.project_id is null or public.can_access_project(j.project_id))));
alter policy timeline_scope_select on public.timeline_events
  using (public.is_internal_member(organization_id) and (project_id is null or public.can_access_project(project_id)));

-- Link a customer record to a signed-up account and give that account the CUSTOMER role.
create or replace function public.link_customer_account(target_customer uuid, account_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c customers;
  account uuid;
  membership uuid;
  customer_role uuid;
begin
  select * into c from customers where id = target_customer;
  if not found then raise exception 'Customer not found'; end if;
  if not public.can_manage_access(c.organization_id) then raise exception 'Not authorized'; end if;
  select id into account from auth.users where lower(email) = lower(trim(account_email));
  if account is null then raise exception 'No account with that email'; end if;
  if not exists(select 1 from profiles where id = account) then raise exception 'No account with that email'; end if;

  update customers set primary_profile_id = account, updated_at = now() where id = c.id;

  insert into organization_memberships (organization_id, user_id, status)
  values (c.organization_id, account, 'ACTIVE')
  on conflict (organization_id, user_id) do nothing;
  select id into membership from organization_memberships
   where organization_id = c.organization_id and user_id = account;

  select id into customer_role from roles
   where organization_id = c.organization_id and code = 'CUSTOMER' and is_system;
  if customer_role is not null then
    insert into membership_roles (membership_id, role_id, scope_type, scope_id)
    values (membership, customer_role, 'ORGANIZATION', null)
    on conflict do nothing;
  end if;
  return account;
end $$;

-- Published progress per activity: the latest published update wins.
create or replace function public.get_customer_portal()
returns jsonb language sql stable security definer set search_path = public as $$
  with my_units as (
    select u.id, u.code, u.name, u.project_id, p.name as project_name, p.organization_id
      from customers c
      join unit_sales us on us.customer_id = c.id
      join units u on u.id = us.unit_id
      join projects p on p.id = u.project_id
     where c.primary_profile_id = auth.uid()
  ),
  published as (
    select distinct on (pu.activity_id) pu.activity_id, pu.verified_percent, pu.report_date, pu.published_at
      from progress_updates pu join my_units mu on mu.id = pu.unit_id
     where pu.publication_status = 'PUBLISHED' and pu.verified_at is not null
     order by pu.activity_id, pu.published_at desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'unit_id', mu.id,
    'unit_code', mu.code,
    'unit_name', mu.name,
    'project_name', mu.project_name,
    'progress', (
      select case when sum(a.weight) > 0
        then round(sum(a.weight * coalesce(pb.verified_percent, 0)) / sum(a.weight), 1) else 0 end
        from schedule_activities a left join published pb on pb.activity_id = a.id
       where a.unit_id = mu.id and not a.is_milestone),
    'handover', (select a.forecast_finish from schedule_activities a
                  where a.unit_id = mu.id and a.is_milestone order by a.sequence desc limit 1),
    'activities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'code', a.code, 'name_th', a.name_th, 'name_en', a.name_en, 'stage', a.stage,
        'weight', a.weight, 'is_milestone', a.is_milestone,
        'percent', coalesce(pb.verified_percent, 0), 'updated', pb.report_date
      ) order by a.sequence), '[]'::jsonb)
        from schedule_activities a left join published pb on pb.activity_id = a.id
       where a.unit_id = mu.id),
    'updates', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', pu.id, 'date', pu.report_date, 'percent', pu.verified_percent,
        'name_th', a.name_th, 'name_en', a.name_en, 'stage', a.stage
      ) order by pu.published_at desc), '[]'::jsonb)
        from progress_updates pu join schedule_activities a on a.id = pu.activity_id
       where pu.unit_id = mu.id and pu.publication_status = 'PUBLISHED' and pu.verified_at is not null),
    'photos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', ph.id, 'path', ph.storage_path, 'thumb', ph.thumbnail_path, 'caption', ph.caption,
        'taken_at', coalesce(ph.taken_at, ph.uploaded_at), 'name_th', a.name_th, 'name_en', a.name_en
      ) order by coalesce(ph.taken_at, ph.uploaded_at) desc), '[]'::jsonb)
        from activity_photos ph join schedule_activities a on a.id = ph.activity_id
       where ph.unit_id = mu.id and ph.publication_status = 'PUBLISHED' and ph.voided_at is null)
  ) order by mu.code), '[]'::jsonb)
  from my_units mu;
$$;

-- Customers may open only published, non-voided photos of their own units.
create or replace function public.customer_can_view_photo(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from activity_photos ph
      join unit_sales us on us.unit_id = ph.unit_id
      join customers c on c.id = us.customer_id
     where (ph.storage_path = object_name or ph.thumbnail_path = object_name)
       and ph.publication_status = 'PUBLISHED' and ph.voided_at is null
       and c.primary_profile_id = auth.uid()
  );
$$;

create policy site_photos_customer_read on storage.objects
  for select to authenticated
  using (bucket_id = 'site-photos' and public.customer_can_view_photo(name));

revoke all on function public.link_customer_account(uuid, text) from public, anon;
revoke all on function public.get_customer_portal() from public, anon;
revoke all on function public.customer_can_view_photo(text) from public, anon;
grant execute on function public.link_customer_account(uuid, text) to authenticated;
grant execute on function public.get_customer_portal() to authenticated;
grant execute on function public.customer_can_view_photo(text) to authenticated;
