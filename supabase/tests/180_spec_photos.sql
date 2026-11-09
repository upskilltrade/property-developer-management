-- Spec photos: upload path rules, attach to item/option/unit line, read and remove access.
do $$
declare
  p uuid := pg_temp.t_project(1);
  u1 uuid := (select id from units where project_id = p limit 1);
  org uuid := (select organization_id from projects where id = p);
  owner uuid := pg_temp.t_user('owner');
  cust uuid := pg_temp.t_user('customer');
  item uuid;
  opt uuid;
  line uuid;
  prefix text;
  ph uuid;
  n int;
begin
  perform pg_temp.t_grant(owner, 'OWNER');
  perform pg_temp.t_customer(cust, u1);
  perform pg_temp.t_grant(cust, 'CUSTOMER');
  prefix := org || '/' || p || '/spec/';

  perform pg_temp.t_as(owner);
  item := public.upsert_spec_item(p, null, '{"item_no":"SN-01","category":"SANITARY","name":"Toilet"}');
  opt := public.upsert_spec_option(item, null, '{"name":"Wall hung"}');
  line := public.save_unit_spec(u1, null, jsonb_build_object('kind', 'CHANGE', 'base_item_id', item, 'color', 'Black'));

  perform pg_temp.t_ok(public.spec_photo_project(prefix || 'a.jpg') = p, 'spec path maps to its project');
  perform pg_temp.t_ok(public.spec_photo_project(gen_random_uuid() || '/' || p || '/spec/a.jpg') is null,
    'a path under another org maps to nothing');
  perform pg_temp.t_ok(public.spec_photo_project(org || '/' || p || '/drawings/a.jpg') is null,
    'a non-spec folder maps to nothing');

  -- The owner can upload under the spec folder; the customer cannot.
  insert into storage.objects (bucket_id, name) values ('design-files', prefix || 'a.jpg'), ('design-files', prefix || 'a_t.jpg'),
    ('design-files', prefix || 'b.jpg');
  perform pg_temp.t_as(cust);
  perform pg_temp.t_refused(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'design-files',
    prefix || 'c.jpg'), 'row-level security', 'customer cannot upload spec photos');
  perform pg_temp.t_as(owner);

  n := public.add_spec_photos(p, jsonb_build_object('item_id', item), jsonb_build_array(
    jsonb_build_object('path', prefix || 'a.jpg', 'thumb_path', prefix || 'a_t.jpg', 'caption', ' Front '),
    jsonb_build_object('path', prefix || 'b.jpg')));
  perform pg_temp.t_ok(n = 2, 'two photos added to the item');
  perform pg_temp.t_ok((select caption from spec_photos where path = prefix || 'a.jpg') = 'Front', 'caption is trimmed');
  perform pg_temp.t_ok(public.add_spec_photos(p, jsonb_build_object('option_id', opt),
    jsonb_build_array(jsonb_build_object('path', prefix || 'b.jpg'))) = 1, 'photo added to an option');
  perform pg_temp.t_ok(public.add_spec_photos(p, jsonb_build_object('line_id', line),
    jsonb_build_array(jsonb_build_object('path', prefix || 'b.jpg'))) = 1, 'photo added to a unit line');

  perform pg_temp.t_refused(format('select public.add_spec_photos(%L, %L, %L)', p, jsonb_build_object('item_id', item),
    jsonb_build_array(jsonb_build_object('path', prefix || 'missing.jpg'))), 'Invalid spec', 'file must be uploaded first');
  perform pg_temp.t_refused(format('select public.add_spec_photos(%L, %L, %L)', p, jsonb_build_object('item_id', item),
    jsonb_build_array(jsonb_build_object('path', 'elsewhere/a.jpg'))), 'Invalid spec', 'path outside the project folder');
  perform pg_temp.t_refused(format('select public.add_spec_photos(%L, %L, %L)', p,
    jsonb_build_object('item_id', item, 'option_id', opt),
    jsonb_build_array(jsonb_build_object('path', prefix || 'a.jpg'))), 'Invalid spec', 'exactly one target');
  perform pg_temp.t_refused(format('select public.add_spec_photos(%L, %L, %L)', p, jsonb_build_object('item_id', item),
    '[]'), 'Invalid spec', 'at least one photo');

  -- Customers cannot see or add spec photos.
  perform pg_temp.t_as(cust);
  perform pg_temp.t_ok((select count(*) from spec_photos where project_id = p) = 0, 'customer cannot read spec photos');
  perform pg_temp.t_ok((select count(*) from storage.objects where name like prefix || '%') = 0,
    'customer cannot read spec photo files');
  perform pg_temp.t_refused(format('select public.add_spec_photos(%L, %L, %L)', p, jsonb_build_object('item_id', item),
    jsonb_build_array(jsonb_build_object('path', prefix || 'a.jpg'))), 'Not authorized', 'customer cannot add photos');

  perform pg_temp.t_as(owner);
  perform pg_temp.t_ok((select count(*) from storage.objects where name like prefix || '%') = 3, 'staff read spec files');
  select id into ph from spec_photos where path = prefix || 'a.jpg';
  perform pg_temp.t_as(cust);
  perform pg_temp.t_refused(format('select public.remove_spec_photo(%L)', ph), 'Not authorized', 'customer cannot remove');
  perform pg_temp.t_as(owner);
  perform public.remove_spec_photo(ph);
  perform pg_temp.t_ok(not exists(select 1 from spec_photos where id = ph), 'photo removed');

  -- Removing the item removes its photos.
  perform pg_temp.t_as(null);
  delete from spec_items where id = item;
  perform pg_temp.t_ok(not exists(select 1 from spec_photos where project_id = p), 'photos go with their item');
end $$;
