-- 1) Additions / omissions register (งานเพิ่ม-งานลด).
--    Each VO version can carry line items, each an ADD or an OMIT with quantity and unit price.
--    When items are given, the version's price_delta is their net (additions − omissions), so
--    the register and the VO always agree. Items are immutable like the versions they belong to.
-- 2) AI Design Studio retired: its RPCs are no longer callable and uploads to design-renders are
--    closed. The table and bucket stay (no destructive drop); nothing in the app uses them.

create table if not exists public.vo_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vo_version_id uuid not null references public.vo_versions(id) on delete cascade,
  seq int not null,
  kind text not null check (kind in ('ADD','OMIT')),
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text,
  unit_price numeric(18,2) not null check (unit_price >= 0),
  amount numeric(18,2) not null,
  created_at timestamptz not null default now(),
  unique (vo_version_id, seq)
);
create index if not exists vo_items_version_idx on public.vo_items(vo_version_id);
create or replace trigger vo_items_immutable before update or delete on public.vo_items
  for each row execute function public.reject_vo_history_change();
alter table public.vo_items enable row level security;

-- Same visibility as the version the items belong to.
create policy vo_items_select on public.vo_items for select to authenticated
  using (exists(select 1 from vo_versions x join variation_orders v on v.id = x.vo_id
    where x.id = vo_items.vo_version_id
      and (public.can_access_project(v.project_id)
        or (v.customer_facing and v.unit_id is not null and public.is_unit_customer(v.unit_id)
            and v.status in ('OFFERED','CUSTOMER_APPROVED','CUSTOMER_REJECTED','RELEASED','CLOSED')
            and x.version = v.current_version))));
grant select on public.vo_items to authenticated;

-- Validates items and returns their net (null when there are none).
create or replace function public.vo_items_net(items jsonb)
returns numeric language plpgsql immutable set search_path = public as $$
declare
  it jsonb;
  net numeric := 0;
  n int := 0;
begin
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then return null; end if;
  if jsonb_array_length(items) > 200 then raise exception 'Invalid variation'; end if;
  for it in select * from jsonb_array_elements(items) loop
    n := n + 1;
    if coalesce(it->>'kind', '') not in ('ADD','OMIT') or coalesce(trim(it->>'description'), '') = ''
       or coalesce(nullif(it->>'quantity', '')::numeric, 0) <= 0
       or coalesce(nullif(it->>'unit_price', '')::numeric, -1) < 0 then
      raise exception 'Invalid variation';
    end if;
    net := net + (case when it->>'kind' = 'ADD' then 1 else -1 end)
                 * round((it->>'quantity')::numeric * (it->>'unit_price')::numeric, 2);
  end loop;
  return net;
end $$;

create or replace function public.vo_insert_items(target_version uuid, items jsonb)
returns void language sql security definer set search_path = public as $$
  insert into vo_items (organization_id, vo_version_id, seq, kind, description, quantity, unit, unit_price, amount)
  select x.organization_id, x.id, e.ord::int, e.it->>'kind', trim(e.it->>'description'),
         (e.it->>'quantity')::numeric, nullif(trim(e.it->>'unit'), ''), (e.it->>'unit_price')::numeric,
         round((e.it->>'quantity')::numeric * (e.it->>'unit_price')::numeric, 2)
    from vo_versions x, jsonb_array_elements(items) with ordinality e(it, ord)
   where x.id = target_version;
$$;

create or replace function public.create_variation(target_project uuid, data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pr projects;
  cr change_requests;
  un uuid := nullif(data->>'unit_id', '')::uuid;
  doc_no text;
  v variation_orders;
  net numeric := public.vo_items_net(data->'items');
  ver uuid;
begin
  select * into pr from projects where projects.id = target_project;
  if not found or not public.can_vary(pr.id, 'EDIT') then raise exception 'Not authorized'; end if;
  if nullif(data->>'change_request_id', '') is not null then
    select * into cr from change_requests where change_requests.id = (data->>'change_request_id')::uuid
      and project_id = pr.id for update;
    if not found or cr.status not in ('SUBMITTED','UNDER_REVIEW') then raise exception 'Invalid request'; end if;
    un := coalesce(un, cr.unit_id);
  end if;
  if coalesce(trim(data->>'title'), '') = '' or coalesce(trim(data->>'revised_scope'), '') = '' then
    raise exception 'Invalid variation';
  end if;
  doc_no := public.next_document_no(pr.organization_id, 'VO');
  insert into variation_orders (organization_id, project_id, unit_id, change_request_id, vo_no, title, customer_facing,
    partner_id, requires_payment_before_release, payment_due_days, created_by)
  values (pr.organization_id, pr.id, un, cr.id, doc_no, trim(data->>'title'),
    coalesce((data->>'customer_facing')::boolean, cr.id is not null and cr.source = 'CUSTOMER', true),
    nullif(data->>'partner_id', '')::uuid, coalesce((data->>'requires_payment_before_release')::boolean, false),
    coalesce(nullif(data->>'payment_due_days', '')::int, 7), auth.uid())
  returning * into v;
  insert into vo_versions (organization_id, vo_id, version, original_scope, revised_scope, cost_delta, price_delta,
    time_delta_days, note, created_by)
  values (v.organization_id, v.id, 1, coalesce(nullif(trim(data->>'original_scope'), ''), cr.description, '-'),
    trim(data->>'revised_scope'), coalesce(nullif(data->>'cost_delta', '')::numeric, 0),
    coalesce(net, nullif(data->>'price_delta', '')::numeric, 0), coalesce(nullif(data->>'time_delta_days', '')::int, 0),
    nullif(trim(data->>'note'), ''), auth.uid())
  returning id into ver;
  if net is not null then perform public.vo_insert_items(ver, data->'items'); end if;
  if cr.id is not null then update change_requests set status = 'CONVERTED', decided_by = auth.uid(), decided_at = now() where change_requests.id = cr.id; end if;
  perform public.vo_log(v, 'VO_CREATED', v.title);
  return v.id;
end $$;

-- Draft edits append a version; nothing already written is changed.
create or replace function public.revise_variation(target_vo uuid, data jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  v variation_orders;
  net numeric := public.vo_items_net(data->'items');
  ver uuid;
begin
  select * into v from variation_orders where id = target_vo for update;
  if not found or not public.can_vary(v.project_id, 'EDIT') then raise exception 'Not authorized'; end if;
  if v.status not in ('DRAFT','CUSTOMER_REJECTED') then raise exception 'Variation is locked'; end if;
  if coalesce(trim(data->>'revised_scope'), '') = '' then raise exception 'Invalid variation'; end if;
  insert into vo_versions (organization_id, vo_id, version, original_scope, revised_scope, cost_delta, price_delta,
    time_delta_days, note, created_by)
  select v.organization_id, v.id, v.current_version + 1, coalesce(nullif(trim(data->>'original_scope'), ''), x.original_scope),
    trim(data->>'revised_scope'), coalesce(nullif(data->>'cost_delta', '')::numeric, 0),
    coalesce(net, nullif(data->>'price_delta', '')::numeric, 0), coalesce(nullif(data->>'time_delta_days', '')::int, 0),
    nullif(trim(data->>'note'), ''), auth.uid()
    from vo_versions x where x.vo_id = v.id and x.version = v.current_version
  returning id into ver;
  if net is not null then perform public.vo_insert_items(ver, data->'items'); end if;
  update variation_orders set current_version = v.current_version + 1, status = 'DRAFT',
    partner_id = coalesce(nullif(data->>'partner_id', '')::uuid, partner_id),
    drawing_revision_id = coalesce(nullif(data->>'drawing_revision_id', '')::uuid, drawing_revision_id),
    requires_payment_before_release = coalesce((data->>'requires_payment_before_release')::boolean, requires_payment_before_release),
    updated_at = now()
   where id = v.id;
  return v.current_version + 1;
end $$;

revoke all on function public.vo_items_net(jsonb) from public, anon, authenticated;
revoke all on function public.vo_insert_items(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- retire AI Design Studio

revoke execute on function public.save_design_render(uuid, jsonb) from authenticated;
revoke execute on function public.set_render_visibility(uuid, boolean) from authenticated;
revoke execute on function public.archive_render(uuid) from authenticated;
alter policy design_renders_upload on storage.objects with check (false);
