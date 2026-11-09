-- Spec list: project standard, upgrade options, unit changes, VO from changes, access.
do $$
declare
  p uuid := pg_temp.t_project(2);
  u1 uuid := pg_temp.t_unit(p, 'T-01');
  u2 uuid := pg_temp.t_unit(p, 'T-02');
  owner uuid := pg_temp.t_user('owner');
  cust uuid := pg_temp.t_user('customer');
  tile uuid;
  solar uuid;
  basin uuid;
  opt uuid;
  l1 uuid;
  l2 uuid;
  l3 uuid;
  vo uuid;
  n int;
  x numeric;
  r record;
begin
  perform pg_temp.t_grant(owner, 'OWNER');
  perform pg_temp.t_customer(cust, u1);
  perform pg_temp.t_grant(cust, 'CUSTOMER');

  perform pg_temp.t_as(owner);
  tile := public.upsert_spec_item(p, null, '{"item_no":"fl-01","category":"FLOOR","area":"Living","name":"SPC floor",
    "brand":"SCG","color":"Oak","size":"18x122 cm","quantity":"100","unit":"sqm","unit_price":"650"}');
  solar := public.upsert_spec_item(p, null, '{"item_no":"EL-01","category":"ELECTRICAL","name":"Solar 5 kW",
    "quantity":"1","unit":"set","unit_price":"150000"}');
  basin := public.upsert_spec_item(p, null, '{"item_no":"SN-01","category":"SANITARY","name":"Basin",
    "brand":"COTTO","quantity":"4","unit":"pc","unit_price":"3000"}');
  perform pg_temp.t_ok((select item_no from spec_items where id = tile) = 'FL-01', 'item number is upper-cased');
  perform pg_temp.t_refused(format('select public.upsert_spec_item(%L, null, %L)', p,
    '{"item_no":"X","category":"NOPE","name":"x"}'), 'Invalid spec', 'unknown category is refused');
  perform pg_temp.t_refused(format('select public.upsert_spec_item(%L, null, %L)', p,
    '{"item_no":"X","category":"FLOOR","name":"x","unit_price":"-5"}'), 'Invalid spec', 'negative price is refused');
  opt := public.upsert_spec_option(solar, null, '{"name":"Solar 10 kW","unit_price":"260000","customer_price":"120000"}');

  -- A unit with no changes inherits the standard.
  select count(*), sum(charge) into n, x from public.unit_spec_lines(u2);
  perform pg_temp.t_ok(n = 3 and x = 0, 'unchanged unit lists the standard with no charge');
  perform pg_temp.t_ok((select amount from public.unit_spec_lines(u2) where base_item_id = tile) = 65000,
    'amount is quantity x unit price');

  -- Unit 1: upgrade solar by option, change floor colour and price, omit a basin line, add an item.
  l1 := public.save_unit_spec(u1, null, jsonb_build_object('kind', 'CHANGE', 'base_item_id', solar, 'option_id', opt));
  l2 := public.save_unit_spec(u1, null, jsonb_build_object('kind', 'CHANGE', 'base_item_id', tile,
    'color', 'Walnut', 'unit_price', '800'));
  perform public.save_unit_spec(u1, null, jsonb_build_object('kind', 'OMIT', 'base_item_id', basin));
  l3 := public.save_unit_spec(u1, null, '{"kind":"ADD","category":"AIRCON","name":"Extra air con",
    "brand":"Daikin","quantity":"1","unit":"set","unit_price":"30000","customer_price":"35000"}');
  perform pg_temp.t_ok(public.save_unit_spec(u1, null, jsonb_build_object('kind', 'CHANGE', 'base_item_id', tile,
    'color', 'Walnut', 'unit_price', '800')) = l2, 'saving a change again edits the same line');

  select * into r from public.unit_spec_lines(u1) where base_item_id = solar;
  perform pg_temp.t_ok(r.kind = 'CHANGE' and r.name = 'Solar 5 kW' and r.unit_price = 260000
    and r.cost_delta = 110000 and r.charge = 120000 and r.option_name = 'Solar 10 kW', 'option sets cost and charge');
  select * into r from public.unit_spec_lines(u1) where base_item_id = tile;
  perform pg_temp.t_ok(r.color = 'Walnut' and r.brand = 'SCG' and r.std_color = 'Oak' and r.charge = 15000,
    'a changed field overrides, the rest is inherited, charge defaults to the cost difference');
  select * into r from public.unit_spec_lines(u1) where base_item_id = basin;
  perform pg_temp.t_ok(r.kind = 'OMIT' and r.amount = 0 and r.charge = -12000, 'omitting credits the standard amount');
  select * into r from public.unit_spec_lines(u1) where line_id = l3;
  perform pg_temp.t_ok(r.kind = 'ADD' and r.amount = 30000 and r.charge = 35000, 'added item uses its own charge');
  perform pg_temp.t_ok((select sum(charge) from public.unit_spec_lines(u2)) = 0, 'other units are not affected');

  -- Editing the standard flows into units that did not change that field.
  perform public.upsert_spec_item(p, tile, '{"item_no":"FL-01","category":"FLOOR","area":"Living","name":"SPC floor",
    "brand":"SCG Premium","color":"Oak","quantity":"100","unit":"sqm","unit_price":"650"}');
  perform pg_temp.t_ok((select brand from public.unit_spec_lines(u1) where base_item_id = tile) = 'SCG Premium'
    and (select color from public.unit_spec_lines(u1) where base_item_id = tile) = 'Walnut',
    'standard edits reach units, their own changes stay');

  -- Draft changes become one VO; its lines are then locked.
  vo := public.create_spec_variation(u1, null);
  perform pg_temp.t_ok((select count(*) from unit_spec_items where unit_id = u1 and status = 'IN_VO'
    and variation_order_id = vo) = 4, 'all draft lines go into the VO');
  perform pg_temp.t_as(null); -- VO history is read through the app's RPCs, not directly
  select x2.price_delta, x2.cost_delta into r from vo_versions x2 where x2.vo_id = vo and x2.version = 1;
  perform pg_temp.t_ok(r.price_delta = 120000 + 15000 - 12000 + 35000, 'VO price is the net of the charges');
  perform pg_temp.t_ok(r.cost_delta = 110000 + 15000 - 12000 + 30000, 'VO cost is the net cost difference');
  perform pg_temp.t_ok((select count(*) from vo_items i join vo_versions v on v.id = i.vo_version_id
    where v.vo_id = vo and i.kind = 'OMIT') = 1, 'the credit is an omit item');
  perform pg_temp.t_as(owner);
  perform pg_temp.t_refused(format('select public.cancel_unit_spec(%L)', l1), 'locked', 'line in a live VO is locked');
  perform pg_temp.t_refused(format('select public.create_spec_variation(%L, null)', u1), 'Invalid variation',
    'no second VO without new drafts');

  -- A cancelled VO frees the lines.
  perform pg_temp.t_as(null);
  update variation_orders set status = 'CANCELLED' where id = vo;
  perform pg_temp.t_as(owner);
  perform public.cancel_unit_spec(l1);
  perform pg_temp.t_ok((select kind from public.unit_spec_lines(u1) where base_item_id = solar) = 'STANDARD',
    'a cancelled change goes back to the standard');

  -- An item a unit has changed is switched off, not deleted.
  perform public.remove_spec_item(tile);
  perform pg_temp.t_ok(exists(select 1 from spec_items where id = tile and not active), 'used item is deactivated');
  perform pg_temp.t_ok(not exists(select 1 from public.unit_spec_lines(u2) where base_item_id = tile),
    'inactive item leaves unchanged units');
  perform public.remove_spec_option(opt);
  perform pg_temp.t_ok(not exists(select 1 from spec_options where id = opt), 'unused option is deleted');

  -- Customers cannot read developer cost or call the RPCs.
  perform pg_temp.t_as(cust);
  select count(*) into n from spec_items where project_id = p;
  perform pg_temp.t_ok(n = 0, 'customer cannot read the spec list');
  perform pg_temp.t_refused(format('select * from public.unit_spec_lines(%L)', u1), 'Not authorized',
    'customer cannot read unit lines');
  perform pg_temp.t_refused(format('select public.save_unit_spec(%L, null, %L)', u1,
    jsonb_build_object('kind', 'OMIT', 'base_item_id', solar)), 'Not authorized', 'customer cannot change the spec');
  perform pg_temp.t_as(null);
end $$;
