-- Market zones become a two-level location list: main zones (Cha-Am, Hua Hin's five areas,
-- Pranburi, Sam Roi Yot) with sub zones, landmarks and roads under them. Each zone has Thai and
-- English names and search aliases. A zone's centre is optional: the starter zones come without
-- one and are located from their names in the app (never guessed here). A main zone with no centre
-- of its own covers its sub zones. Competitors and land prices may be put in a zone by hand,
-- which wins over the zone their coordinates fall in.

alter table public.market_zones
  alter column center_lat drop not null,
  alter column center_lng drop not null,
  add column if not exists parent_id uuid references public.market_zones(id) on delete restrict,
  add column if not exists name_en text,
  add column if not exists slug text,
  add column if not exists aliases text[] not null default '{}',
  add column if not exists sort_order int not null default 0,
  -- Extra words that help find the place on a map, e.g. "Hua Hin, Prachuap Khiri Khan".
  add column if not exists geocode_hint text,
  add column if not exists center_source text check (center_source in ('MANUAL','GEOCODED'));
alter table public.market_zones drop constraint if exists market_zones_center_pair;
alter table public.market_zones add constraint market_zones_center_pair
  check ((center_lat is null) = (center_lng is null));
alter table public.market_zones drop constraint if exists market_zones_not_own_parent;
alter table public.market_zones add constraint market_zones_not_own_parent check (parent_id <> id);
create unique index if not exists market_zones_slug_key
  on public.market_zones(organization_id, slug) where slug is not null;
create index if not exists market_zones_parent_idx on public.market_zones(parent_id);

alter table public.competitor_projects
  add column if not exists zone_id uuid references public.market_zones(id) on delete set null;
alter table public.land_prices
  add column if not exists zone_id uuid references public.market_zones(id) on delete set null;
create index if not exists competitor_projects_zone_idx on public.competitor_projects(zone_id);
create index if not exists land_prices_zone_idx on public.land_prices(zone_id);

-- Starter zones for every organization already using the market map; safe to run again.
do $$
declare
  o uuid;
  r record;
begin
  for o in select distinct organization_id from public.competitor_projects
           union select distinct organization_id from public.market_zones loop
    for r in
      select * from (values
      ('cha-am', null, 'ชะอำ', 'Cha-Am', '{}'::text[], 'Cha-am, Phetchaburi', 1),
      ('central-cha-am', 'cha-am', 'ตัวเมืองชะอำ', 'Central Cha-Am', '{}'::text[], null, 1),
      ('cha-am-beach', 'cha-am', 'หาดชะอำ', 'Cha-Am Beach', '{}'::text[], null, 2),
      ('north-cha-am', 'cha-am', 'ชะอำเหนือ', 'North Cha-Am', '{}'::text[], null, 3),
      ('south-cha-am', 'cha-am', 'ชะอำใต้', 'South Cha-Am', '{}'::text[], null, 4),
      ('bang-ket', 'cha-am', 'บางเกตุ', 'Bang Ket', '{}'::text[], null, 5),
      ('puk-tian', 'cha-am', 'ปึกเตียน', 'Puk Tian', '{}'::text[], null, 6),
      ('huai-sai-nuea', 'cha-am', 'ห้วยทรายเหนือ', 'Huai Sai Nuea', '{}'::text[], null, 7),
      ('huai-sai-tai', 'cha-am', 'ห้วยทรายใต้', 'Huai Sai Tai', '{}'::text[], null, 8),
      ('palm-hills', 'cha-am', 'ปาล์มฮิลส์', 'Palm Hills', array['Palm Hills Hua Hin']::text[], 'Palm Hills Hua Hin', 9),
      ('bo-khaem', 'cha-am', 'บ่อแขม', 'Bo Khaem', '{}'::text[], null, 10),
      ('sam-phraya', 'cha-am', 'สามพระยา', 'Sam Phraya', '{}'::text[], null, 11),
      ('central-north-hua-hin', null, 'หัวหินกลางและเหนือ', 'Central & North Hua Hin', '{}'::text[], 'Hua Hin, Prachuap Khiri Khan', 2),
      ('central-hua-hin', 'central-north-hua-hin', 'ตัวเมืองหัวหิน', 'Central Hua Hin', '{}'::text[], null, 1),
      ('night-market', 'central-north-hua-hin', 'ตลาดโต้รุ่ง', 'Night Market Area', '{}'::text[], 'Hua Hin Night Market', 2),
      ('hua-hin-soi-51', 'central-north-hua-hin', 'หัวหินซอย 51', 'Hua Hin Soi 51', '{}'::text[], null, 3),
      ('hua-hin-soi-88', 'central-north-hua-hin', 'หัวหินซอย 88', 'Hua Hin Soi 88', '{}'::text[], null, 4),
      ('bo-fai', 'central-north-hua-hin', 'บ่อฝ้าย', 'Bo Fai', '{}'::text[], null, 5),
      ('plearn-wan', 'central-north-hua-hin', 'เพลินวาน', 'Plearn Wan', '{}'::text[], null, 6),
      ('hua-hin-airport', 'central-north-hua-hin', 'สนามบินหัวหิน', 'Hua Hin Airport Area', '{}'::text[], 'Hua Hin Airport', 7),
      ('maruekhathaiyawan', 'central-north-hua-hin', 'มฤคทายวัน', 'Maruekhathaiyawan Area', '{}'::text[], 'Mrigadayavan Palace', 8),
      ('south-hua-hin-coastal', null, 'หัวหินใต้และชายฝั่ง', 'South Hua Hin & Coastal', '{}'::text[], 'Hua Hin, Prachuap Khiri Khan', 3),
      ('nong-kae', 'south-hua-hin-coastal', 'หนองแก', 'Nong Kae', '{}'::text[], null, 1),
      ('khao-takiab', 'south-hua-hin-coastal', 'เขาตะเกียบ', 'Khao Takiab', '{}'::text[], null, 2),
      ('suan-son', 'south-hua-hin-coastal', 'สวนสน', 'Suan Son', '{}'::text[], 'Suan Son Pradipat', 3),
      ('hua-hin-soi-102', 'south-hua-hin-coastal', 'หัวหินซอย 102', 'Hua Hin Soi 102', '{}'::text[], null, 4),
      ('hua-hin-soi-112', 'south-hua-hin-coastal', 'หัวหินซอย 112', 'Hua Hin Soi 112', '{}'::text[], null, 5),
      ('khao-tao', null, 'เขาเต่า', 'Khao Tao', '{}'::text[], 'Hua Hin, Prachuap Khiri Khan', 4),
      ('khao-tao-village', 'khao-tao', 'หมู่บ้านเขาเต่า', 'Khao Tao Village', '{}'::text[], 'Khao Tao', 1),
      ('sai-noi-beach', 'khao-tao', 'หาดทรายน้อย', 'Sai Noi Beach', '{}'::text[], null, 2),
      ('khao-tao-reservoir', 'khao-tao', 'อ่างเก็บน้ำเขาเต่า', 'Khao Tao Reservoir', '{}'::text[], null, 3),
      ('west-hua-hin', null, 'หัวหินตะวันตก ภูเขาและกอล์ฟ', 'West Hua Hin — Mountain & Golf', '{}'::text[], 'Hua Hin, Prachuap Khiri Khan', 5),
      ('hin-lek-fai', 'west-hua-hin', 'หินเหล็กไฟ', 'Hin Lek Fai', '{}'::text[], null, 1),
      ('black-mountain', 'west-hua-hin', 'แบล็คเมาน์เทน', 'Black Mountain', array['Black Mountain Hua Hin']::text[], 'Black Mountain Golf Club', 2),
      ('thap-tai', 'west-hua-hin', 'ทับใต้', 'Thap Tai', '{}'::text[], null, 3),
      ('khao-yai-hua-hin', 'west-hua-hin', 'เขาใหญ่หัวหิน', 'Khao Yai Hua Hin', '{}'::text[], null, 4),
      ('sam-phan-nam', 'west-hua-hin', 'สามพันนาม', 'Sam Phan Nam', '{}'::text[], null, 5),
      ('wat-huay-mongkol', 'west-hua-hin', 'วัดห้วยมงคล', 'Wat Huay Mongkol', '{}'::text[], null, 6),
      ('hua-hin-bypass', 'west-hua-hin', 'โซนบายพาสหัวหิน', 'Hua Hin Bypass Area', '{}'::text[], null, 7),
      ('bypass-wat-huay-mongkol', 'west-hua-hin', 'เส้นบายพาส–วัดห้วยมงคล', 'Bypass–Wat Huay Mongkol Road', array['บายพาสห้วยมงคล']::text[], null, 8),
      ('nong-phlap', 'west-hua-hin', 'หนองพลับ', 'Nong Phlap', '{}'::text[], null, 9),
      ('pa-la-u', 'west-hua-hin', 'ป่าละอู', 'Pa La-U', '{}'::text[], null, 10),
      ('south-west-hua-hin', null, 'หัวหินตะวันตกเฉียงใต้', 'South-West Hua Hin', '{}'::text[], 'Hua Hin, Prachuap Khiri Khan', 6),
      ('south-thap-tai', 'south-west-hua-hin', 'ทับใต้ตอนใต้', 'South Thap Tai', '{}'::text[], null, 1),
      ('nong-phan-phuk', 'south-west-hua-hin', 'หนองพรานพุก', 'Nong Phan Phuk', '{}'::text[], null, 2),
      ('nong-phai', 'south-west-hua-hin', 'หนองไผ่', 'Nong Phai', '{}'::text[], null, 3),
      ('huai-sat-yai', 'south-west-hua-hin', 'ห้วยสัตว์ใหญ่', 'Huai Sat Yai', '{}'::text[], null, 4),
      ('pranburi-pak-nam-pran', null, 'ปราณบุรีและปากน้ำปราณ', 'Pranburi & Pak Nam Pran', '{}'::text[], 'Pran Buri, Prachuap Khiri Khan', 7),
      ('pranburi-town', 'pranburi-pak-nam-pran', 'ตัวเมืองปราณบุรี', 'Pranburi Town', '{}'::text[], 'Pran Buri', 1),
      ('pak-nam-pran', 'pranburi-pak-nam-pran', 'ปากน้ำปราณ', 'Pak Nam Pran', array['Paknampran']::text[], null, 2),
      ('khao-kalok', 'pranburi-pak-nam-pran', 'เขากะโหลก', 'Khao Kalok', '{}'::text[], null, 3),
      ('pranburi-beach', 'pranburi-pak-nam-pran', 'หาดปราณบุรี', 'Pranburi Beach', '{}'::text[], null, 4),
      ('pranburi-forest-park', 'pranburi-pak-nam-pran', 'วนอุทยานปราณบุรี', 'Pranburi Forest Park', '{}'::text[], null, 5),
      ('wang-phong', 'pranburi-pak-nam-pran', 'วังก์พง', 'Wang Phong', '{}'::text[], null, 6),
      ('inland-pranburi', 'pranburi-pak-nam-pran', 'ปราณบุรีตอนใน', 'Inland Pranburi', '{}'::text[], null, 7),
      ('fang-daeng', 'pranburi-pak-nam-pran', 'ฝั่งแดง', 'Fang Daeng', '{}'::text[], null, 8),
      ('sam-roi-yot', null, 'สามร้อยยอด', 'Sam Roi Yot', '{}'::text[], 'Sam Roi Yot, Prachuap Khiri Khan', 8),
      ('sam-roi-yot-town', 'sam-roi-yot', 'ตัวอำเภอสามร้อยยอด', 'Sam Roi Yot Town', '{}'::text[], 'Sam Roi Yot', 1),
      ('sam-roi-yot-beach', 'sam-roi-yot', 'หาดสามร้อยยอด', 'Sam Roi Yot Beach', '{}'::text[], null, 2),
      ('khao-daeng', 'sam-roi-yot', 'เขาแดง', 'Khao Daeng', '{}'::text[], null, 3)
      ) as t(slug, parent_slug, name_th, name_en, aliases, hint, sort_order)
    loop
      insert into public.market_zones
        (organization_id, parent_id, name, name_en, slug, aliases, geocode_hint, sort_order, radius_m)
      values (
        o,
        (select id from public.market_zones where organization_id = o and slug = r.parent_slug),
        r.name_th, r.name_en, r.slug, r.aliases, r.hint, r.sort_order,
        case when r.parent_slug is null then 5000 else 1500 end)
      on conflict (organization_id, slug) where slug is not null do nothing;
    end loop;
  end loop;
end $$;
