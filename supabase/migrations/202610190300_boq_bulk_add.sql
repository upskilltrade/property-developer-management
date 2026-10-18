-- BOQ import: add many reviewed lines to a draft budget version in one all-or-nothing call.
-- Lines come from an AI-read BOQ document or a CSV, always after a person has reviewed them.
-- Same permission and rules as upsert_boq_item; the version still goes through approval.
create or replace function public.add_boq_items(target_version uuid, items jsonb)
returns int language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare
  b budget_versions;
  it jsonb;
  n int := 0;
  start_order int;
  cat uuid;
begin
  select * into b from budget_versions where budget_versions.id = target_version;
  if not found or not (public.can_cost(b.project_id, 'CREATE') or public.can_cost(b.project_id, 'EDIT')) then
    raise exception 'Not authorized';
  end if;
  if b.status <> 'DRAFT' then raise exception 'Budget version is locked'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 or jsonb_array_length(items) > 500 then
    raise exception 'Invalid items';
  end if;
  select coalesce(max(sort_order), 0) into start_order from boq_items where budget_version_id = b.id;

  for it in select * from jsonb_array_elements(items) loop
    n := n + 1;
    cat := public.try_uuid(it->>'cost_category_id');
    if coalesce(trim(it->>'description'), '') = ''
       or cat is null
       or not exists(select 1 from cost_categories c where c.id = cat and c.organization_id = b.organization_id)
       or coalesce(nullif(it->>'quantity', '')::numeric, -1) < 0
       or coalesce(nullif(it->>'rate', '')::numeric, -1) < 0 then
      raise exception 'Invalid item %', n;
    end if;
    insert into boq_items (organization_id, budget_version_id, cost_category_id, item_code, description, uom,
      quantity, rate, sort_order)
    values (b.organization_id, b.id, cat, nullif(trim(it->>'item_code'), ''), left(trim(it->>'description'), 500),
      coalesce(nullif(trim(it->>'uom'), ''), 'LS'), (it->>'quantity')::numeric, (it->>'rate')::numeric, start_order + n);
  end loop;
  return n;
end $$;

revoke all on function public.add_boq_items(uuid, jsonb) from public, anon;
grant execute on function public.add_boq_items(uuid, jsonb) to authenticated;
