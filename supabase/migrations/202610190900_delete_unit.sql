-- Delete a house (unit) and everything that belongs to it. Owner/Admin only, with the unit code typed
-- back as confirmation. What happens to each kind of record:
--   * deleted: schedule, progress, photos, sale/booking/contract, customer payment schedule, payments
--     and slips, online payments, design packages/drawings, approvals, defects, inspections, RFIs,
--     site instructions, change requests, VOs, handover, warranty, service requests, holds, viewings,
--     notifications, the unit's timeline, and the unit's cost allocation lines.
--   * kept but unlinked from the house: accounting (journal lines, financial documents), purchasing
--     (PRs, POs, BOQ lines) and sales leads, so the books stay balanced and supplier costs stay in
--     the project. Customers stay in CRM.
--   * files: every storage object those rows point to is queued and removed through the Storage API
--     by the app right after (direct deletes on storage tables are not allowed).
-- History tables are normally immutable; their guard triggers allow a delete only while this
-- function runs (transaction-local flag).

create or replace function public.can_delete_unit(target_unit uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from units u join projects p on p.id = u.project_id
   where u.id = target_unit and public.can_plan_forecast(p.organization_id));
$$;

create or replace function public.purging_unit()
returns boolean language sql stable set search_path = public as $$
  select coalesce(current_setting('pdm.purge_unit', true), '') <> '';
$$;

create or replace function public.reject_contract_version_change()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and public.purging_unit() then return old; end if;
  raise exception 'Contract versions are immutable';
end $$;

create or replace function public.reject_customer_approval_change()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and public.purging_unit() then return old; end if;
  raise exception 'Customer approvals are immutable';
end $$;

create or replace function public.reject_rfi_response_change()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and public.purging_unit() then return old; end if;
  raise exception 'RFI responses are immutable';
end $$;

create or replace function public.reject_vo_history_change()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and public.purging_unit() then return old; end if;
  raise exception 'Variation history is immutable';
end $$;

create or replace function public.guard_drawing_revision()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if public.purging_unit() then return old; end if;
    raise exception 'Drawing revisions cannot be deleted';
  end if;
  if new.drawing_id <> old.drawing_id or new.seq <> old.seq or new.revision_code <> old.revision_code
     or new.file_path <> old.file_path or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at then
    raise exception 'Drawing revisions are immutable';
  end if;
  if old.status in ('RELEASED') and new.status not in ('RELEASED','SUPERSEDED') then
    raise exception 'Released revision cannot be changed';
  end if;
  if old.status in ('SUPERSEDED','REJECTED') then raise exception 'Closed revision cannot be changed'; end if;
  return new;
end $$;

-- Files queued for removal from Storage; the app removes them with the requester's session.
create table if not exists public.storage_purge_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bucket text not null,
  path text not null,
  requested_by uuid not null default auth.uid() references public.profiles(id),
  requested_at timestamptz not null default now(),
  purged_at timestamptz
);
create index if not exists storage_purge_queue_requester_idx on public.storage_purge_queue (requested_by) where purged_at is null;
create index if not exists storage_purge_queue_org_idx on public.storage_purge_queue (organization_id);
alter table public.storage_purge_queue enable row level security;
drop policy if exists storage_purge_queue_own on public.storage_purge_queue;
create policy storage_purge_queue_own on public.storage_purge_queue for select to authenticated
  using (requested_by = (select auth.uid()));
revoke insert, update, delete on public.storage_purge_queue from anon, authenticated;

drop policy if exists purge_queued_files on storage.objects;
create policy purge_queued_files on storage.objects for delete to authenticated
  using (exists(select 1 from public.storage_purge_queue q
    where q.bucket = storage.objects.bucket_id and q.path = storage.objects.name
      and q.requested_by = (select auth.uid()) and q.purged_at is null));
-- The Storage API reads an object before removing it.
drop policy if exists purge_queued_files_read on storage.objects;
create policy purge_queued_files_read on storage.objects for select to authenticated
  using (exists(select 1 from public.storage_purge_queue q
    where q.bucket = storage.objects.bucket_id and q.path = storage.objects.name
      and q.requested_by = (select auth.uid()) and q.purged_at is null));

create or replace function public.mark_files_purged(target_ids uuid[])
returns void language sql security definer set search_path = public as $$
  update storage_purge_queue set purged_at = now()
   where id = any(target_ids) and requested_by = auth.uid() and purged_at is null;
$$;

-- Every file a unit's records point to.
create or replace function public.unit_files(target_unit uuid)
returns table(bucket text, path text) language sql stable security definer set search_path = public as $$
  select 'site-photos', storage_path from activity_photos where unit_id = target_unit
  union select 'site-photos', thumbnail_path from activity_photos where unit_id = target_unit and thumbnail_path is not null
  union select 'payment-evidence', file_path from payment_evidence where unit_id = target_unit and file_path is not null
  union select 'contract-files', signed_file_path from sales_contracts where unit_id = target_unit and signed_file_path is not null
  union select 'design-files', r.file_path from drawing_revisions r join drawings d on d.id = r.drawing_id
          join design_packages k on k.id = d.package_id where k.unit_id = target_unit
  union select 'design-renders', output_path from design_renders where unit_id = target_unit
  union select 'design-renders', source_path from design_renders where unit_id = target_unit and source_path is not null
  union select 'handover-files', i.file_path from handover_items i join unit_handovers h on h.id = i.handover_id
          where h.unit_id = target_unit and i.file_path is not null
  union select 'handover-files', acknowledgement_path from unit_handovers where unit_id = target_unit and acknowledgement_path is not null;
$$;

-- What a delete would remove (deleted) and keep (unlinked), for the confirmation screen.
create or replace function public.unit_delete_summary(target_unit uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare u uuid := target_unit;
begin
  if not public.can_delete_unit(u) then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'deleted', jsonb_build_object(
      'schedule', (select count(*) from schedule_activities where unit_id = u),
      'progress', (select count(*) from progress_updates where unit_id = u),
      'photos', (select count(*) from activity_photos where unit_id = u),
      'sales', (select count(*) from unit_sales where unit_id = u)
             + (select count(*) from bookings where unit_id = u)
             + (select count(*) from sales_contracts where unit_id = u),
      'instalments', (select count(*) from payment_schedules where unit_id = u),
      'payments', (select count(*) from payments where unit_id = u)
                + (select count(*) from payment_evidence where unit_id = u)
                + (select count(*) from online_payments where unit_id = u),
      'design', (select count(*) from design_packages where unit_id = u)
              + (select count(*) from material_selections where unit_id = u)
              + (select count(*) from customer_approvals where unit_id = u)
              + (select count(*) from design_renders where unit_id = u),
      'quality', (select count(*) from defects where unit_id = u)
               + (select count(*) from inspections where unit_id = u)
               + (select count(*) from rfis where unit_id = u)
               + (select count(*) from site_instructions where unit_id = u),
      'changes', (select count(*) from variation_orders where unit_id = u)
               + (select count(*) from change_requests where unit_id = u),
      'handover', (select count(*) from unit_handovers where unit_id = u)
                + (select count(*) from unit_warranties where unit_id = u)
                + (select count(*) from service_requests where unit_id = u),
      'allocations', (select count(*) from cost_allocation_lines where unit_id = u),
      'files', (select count(*) from public.unit_files(u))),
    'unlinked', jsonb_build_object(
      'accounting', (select count(*) from journal_lines where unit_id = u)
                  + (select count(*) from financial_documents where unit_id = u),
      'purchasing', (select count(*) from purchase_requests where unit_id = u)
                  + (select count(*) from purchase_orders where unit_id = u)
                  + (select count(*) from boq_items where unit_id = u),
      'leads', (select count(*) from leads where interested_unit_id = u)));
end $$;

-- Deletes the unit; returns the queued files ({id, bucket, path}) for the app to remove from Storage.
create or replace function public.delete_unit(target_unit uuid, confirm_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u units%rowtype; org uuid; summary jsonb; files jsonb;
begin
  select * into u from units where id = target_unit;
  if u.id is null or not public.can_delete_unit(target_unit) then raise exception 'Not authorized'; end if;
  if coalesce(trim(confirm_code), '') <> u.code then raise exception 'Confirmation code does not match'; end if;
  select organization_id into org from projects where id = u.project_id;
  summary := public.unit_delete_summary(target_unit);
  perform set_config('pdm.purge_unit', target_unit::text, true);

  with q as (
    insert into storage_purge_queue (organization_id, bucket, path)
    select org, f.bucket, f.path from public.unit_files(target_unit) f
    returning id, bucket, path)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'bucket', bucket, 'path', path)), '[]') into files from q;

  -- Keep the books and supplier costs; just detach them from the house.
  update journal_lines set unit_id = null where unit_id = target_unit;
  update financial_documents set unit_id = null where unit_id = target_unit;
  update purchase_requests set unit_id = null where unit_id = target_unit;
  update purchase_orders set unit_id = null where unit_id = target_unit;
  update boq_items set unit_id = null where unit_id = target_unit;
  update leads set interested_unit_id = null where interested_unit_id = target_unit;

  -- Links from other records into this unit's rows that would otherwise block the delete.
  update variation_orders set payment_schedule_id = null
   where payment_schedule_id in (select id from payment_schedules where unit_id = target_unit);
  update variation_orders set drawing_revision_id = null
   where drawing_revision_id in (select r.id from drawing_revisions r join drawings d on d.id = r.drawing_id
     join design_packages k on k.id = d.package_id where k.unit_id = target_unit);
  update variation_orders set site_instruction_id = null
   where site_instruction_id in (select id from site_instructions where unit_id = target_unit) and unit_id is distinct from target_unit;
  update design_packages set parent_package_id = null
   where parent_package_id in (select id from design_packages where unit_id = target_unit) and unit_id is distinct from target_unit;

  -- Records about this house that would otherwise be left behind without it.
  delete from cost_allocation_lines where unit_id = target_unit;
  delete from variation_orders where unit_id = target_unit;
  delete from site_instructions where unit_id = target_unit;
  delete from rfis where unit_id = target_unit;
  delete from change_requests where unit_id = target_unit;
  delete from defects where unit_id = target_unit;
  delete from inspections where unit_id = target_unit;
  delete from design_renders where unit_id = target_unit;
  delete from viewings where unit_id = target_unit;

  -- The unit itself; everything else cascades.
  delete from units where id = target_unit;

  insert into timeline_events (organization_id, project_id, event_type, entity_type, entity_id, title, metadata, actor_user_id)
  values (org, u.project_id, 'UNIT_DELETED', 'unit', target_unit, 'ลบบ้าน ' || u.code,
    summary || jsonb_build_object('code', u.code), auth.uid());
  return files;
end $$;

revoke all on function public.can_delete_unit(uuid) from public, anon;
revoke all on function public.purging_unit() from public, anon;
grant execute on function public.purging_unit() to authenticated;
revoke all on function public.mark_files_purged(uuid[]) from public, anon;
revoke all on function public.unit_files(uuid) from public, anon, authenticated;
revoke all on function public.unit_delete_summary(uuid) from public, anon;
revoke all on function public.delete_unit(uuid, text) from public, anon;
grant execute on function public.can_delete_unit(uuid) to authenticated;
grant execute on function public.mark_files_purged(uuid[]) to authenticated;
grant execute on function public.unit_delete_summary(uuid) to authenticated;
grant execute on function public.delete_unit(uuid, text) to authenticated;
