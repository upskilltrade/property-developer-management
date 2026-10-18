-- BOQ import: bulk add is all-or-nothing, needs cost permission, and only touches draft versions.
do $$
declare
  p uuid := pg_temp.t_project(1);
  owner uuid := pg_temp.t_user('owner');
  site uuid := pg_temp.t_user('site');
  v uuid; cat uuid; n int;
begin
  perform pg_temp.t_grant(owner, 'OWNER');
  perform pg_temp.t_grant(site, 'SITE_ENGINEER', p);
  select id into cat from cost_categories where organization_id = pg_temp.t_org() and active order by code limit 1;

  perform pg_temp.t_as(owner);
  v := public.create_budget_version(p, 'import test');
  perform pg_temp.t_ok(public.add_boq_items(v, jsonb_build_array(
    jsonb_build_object('item_code', '1.1', 'description', 'งานเข็มเจาะ', 'uom', 'ต้น', 'quantity', 24, 'rate', 3500, 'cost_category_id', cat),
    jsonb_build_object('description', 'งานคอนกรีตฐานราก', 'uom', 'ลบ.ม.', 'quantity', 12.5, 'rate', 2600, 'cost_category_id', cat))) = 2,
    'two lines added');
  perform pg_temp.t_ok((select sum(amount) from boq_items where budget_version_id = v and removed_at is null) = 116500,
    'amounts are quantity × rate (24×3500 + 12.5×2600)');

  perform pg_temp.t_refused(format('select public.add_boq_items(%L, %L)', v, jsonb_build_array(
    jsonb_build_object('description', 'ok', 'quantity', 1, 'rate', 1, 'cost_category_id', cat),
    jsonb_build_object('description', 'bad category', 'quantity', 1, 'rate', 1, 'cost_category_id', gen_random_uuid()))),
    'Invalid item 2', 'unknown cost category');
  perform pg_temp.t_refused(format('select public.add_boq_items(%L, %L)', v, jsonb_build_array(
    jsonb_build_object('description', 'negative', 'quantity', -1, 'rate', 1, 'cost_category_id', cat))),
    'Invalid item', 'negative quantity');
  select count(*) into n from boq_items where budget_version_id = v;
  perform pg_temp.t_ok(n = 2, 'a batch with a bad line adds nothing');

  perform pg_temp.t_as(site);
  perform pg_temp.t_refused(format('select public.add_boq_items(%L, %L)', v, jsonb_build_array(
    jsonb_build_object('description', 'x', 'quantity', 1, 'rate', 1, 'cost_category_id', cat))),
    'Not authorized', 'site engineer adding BOQ lines');

  perform pg_temp.t_as(owner);
  perform public.submit_budget_version(v);
  perform pg_temp.t_refused(format('select public.add_boq_items(%L, %L)', v, jsonb_build_array(
    jsonb_build_object('description', 'x', 'quantity', 1, 'rate', 1, 'cost_category_id', cat))),
    'locked', 'adding to a submitted version');
  perform pg_temp.t_as(null);
end $$;
