-- BOQ in levels: groups roll up, per-house templates count once per house, a house can override a
-- template, approval and the plan's FROM_BOQ totals use the same effective amounts, and a new
-- version copies the tree.
do $$
declare
  p uuid := pg_temp.t_project(3);
  owner uuid := pg_temp.t_user('owner');
  org uuid := pg_temp.t_org();
  v uuid; v2 uuid; cat uuid; ht uuid;
  u1 uuid; u2 uuid; u3 uuid;
  grp uuid; sub uuid; main uuid; pool uuid; ovr uuid; road uuid; deep uuid; fl uuid;
  n int; total numeric;
begin
  perform pg_temp.t_grant(owner, 'OWNER');
  select id into cat from cost_categories where organization_id = org and active order by code limit 1;
  u1 := pg_temp.t_unit(p, 'T-01'); u2 := pg_temp.t_unit(p, 'T-02'); u3 := pg_temp.t_unit(p, 'T-03');
  insert into house_types (organization_id, code, name) values (org, 'HT-' || left(gen_random_uuid()::text, 6), 'Villa')
  returning id into ht;
  update units set house_type_id = ht where id in (u1, u2);

  perform pg_temp.t_as(owner);
  v := public.create_budget_version(p, 'levels');
  grp := public.upsert_boq_item(v, null, jsonb_build_object('description', 'ตัวบ้าน', 'is_group', true,
    'cost_category_id', cat, 'quantity', 5, 'rate', 5));
  main := public.upsert_boq_item(v, null, jsonb_build_object('description', 'พื้นที่หลัก', 'parent_id', grp,
    'per_unit', true, 'uom', 'ตร.ม.', 'quantity', 239, 'rate', 18000));
  pool := public.upsert_boq_item(v, null, jsonb_build_object('description', 'สระ', 'parent_id', grp,
    'per_unit', true, 'house_type_id', ht, 'quantity', 37, 'rate', 16000));
  ovr := public.upsert_boq_item(v, null, jsonb_build_object('description', 'สระใหญ่', 'overrides_item_id', pool,
    'unit_id', u2, 'quantity', 45, 'rate', 16000));
  road := public.upsert_boq_item(v, null, jsonb_build_object('description', 'ถนน', 'cost_category_id', cat,
    'quantity', 504, 'rate', 650));
  perform pg_temp.t_as(null);

  perform pg_temp.t_ok((select quantity = 0 and rate = 0 from boq_items where id = grp), 'a group holds no amount');
  perform pg_temp.t_ok((select cost_category_id = cat and parent_id = grp from boq_items where id = ovr),
    'an override sits with its template');
  select sum(amount) into total from public.boq_effective(v);
  -- main × 3 houses, pool for the 2 villas (T-01 standard, T-02 override), road once.
  perform pg_temp.t_ok(total = 239*18000*3 + 37*16000 + 45*16000 + 504*650, 'effective total: ' || total);
  perform pg_temp.t_ok((select sum(amount) from public.boq_effective(v) where unit_id = u2) = 239*18000 + 45*16000,
    'one house: its template lines with its override');
  perform pg_temp.t_ok((select sum(amount) from public.boq_effective(v) where unit_id = u3) = 239*18000,
    'pool is only for the villa house type');

  perform pg_temp.t_as(owner);
  perform pg_temp.t_refused(format('select public.upsert_boq_item(%L, null, %L)', v,
    jsonb_build_object('description', 'x', 'overrides_item_id', pool, 'unit_id', u3, 'quantity', 1, 'rate', 1)),
    'Invalid override', 'override for a house of another type');
  perform pg_temp.t_refused(format('select public.upsert_boq_item(%L, null, %L)', v,
    jsonb_build_object('description', 'x', 'overrides_item_id', pool, 'unit_id', u2, 'quantity', 1, 'rate', 1)),
    'Override exists', 'second override for the same house');
  perform pg_temp.t_refused(format('select public.upsert_boq_item(%L, null, %L)', v,
    jsonb_build_object('description', 'x', 'parent_id', main, 'quantity', 1, 'rate', 1)),
    'Invalid parent', 'child under a work item');
  sub := grp;
  for n in 1..3 loop
    sub := public.upsert_boq_item(v, null, jsonb_build_object('description', 'level ' || (n + 1), 'parent_id', sub, 'is_group', true));
  end loop;
  perform pg_temp.t_refused(format('select public.upsert_boq_item(%L, null, %L)', v,
    jsonb_build_object('description', 'too deep', 'parent_id', sub, 'quantity', 1, 'rate', 1)),
    'Too many levels', 'a fifth level');
  deep := public.upsert_boq_item(v, null, jsonb_build_object('description', 'level 4 group removed', 'parent_id', grp, 'is_group', true));
  perform public.upsert_boq_item(v, null, jsonb_build_object('description', 'inside', 'parent_id', deep, 'quantity', 1, 'rate', 99));
  perform public.remove_boq_item(deep);
  perform pg_temp.t_refused(format('select public.upsert_boq_item(%L, %L, %L)', v, grp,
    jsonb_build_object('description', 'ตัวบ้าน', 'cost_category_id', cat, 'is_group', false, 'quantity', 1, 'rate', 1)),
    'Group has items', 'turning a group with items into a line');

  -- The plan reads the working (draft) version.
  fl := public.save_forecast_line(p, jsonb_build_object('kind', 'COST', 'category', 'CONSTRUCTION', 'label', 'งานบ้าน',
    'method', 'FROM_BOQ', 'cost_category_id', cat));
  perform pg_temp.t_refused(format('select public.save_forecast_line(%L, %L)', p,
    jsonb_build_object('kind', 'COST', 'category', 'OTHER', 'label', 'x', 'method', 'FROM_BOQ')),
    'Invalid line', 'FROM_BOQ needs a cost category');
  perform pg_temp.t_ok((select amount from public.get_boq_totals(p) where cost_category_id = cat) = total,
    'plan total from the draft BOQ');

  perform public.submit_budget_version(v);
  perform public.decide_budget_version(v, true, null);
  perform pg_temp.t_ok((select baseline from public.get_cost_report(p, u2) where cost_category_id = cat) = 239*18000 + 45*16000,
    'cost report per house');
  perform pg_temp.t_as(null);
  perform pg_temp.t_ok((select budget_amount from project_budgets where project_id = p and cost_category_id = cat) = total,
    'approved baseline counts houses');

  perform pg_temp.t_as(owner);
  v2 := public.create_budget_version(p, 'copy');
  perform pg_temp.t_as(null);
  select count(*) into n from boq_items where budget_version_id = v2 and removed_at is null;
  perform pg_temp.t_ok(n = (select count(*) from boq_items where budget_version_id = v and removed_at is null),
    'new version copies every live line');
  perform pg_temp.t_ok((select sum(amount) from public.boq_effective(v2)) = total, 'copy has the same total');
  perform pg_temp.t_ok(not exists(select 1 from boq_items c join boq_items x on x.id = c.parent_id
    where c.budget_version_id = v2 and x.budget_version_id <> v2), 'copied tree points inside the new version');
end $$;
