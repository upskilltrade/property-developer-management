-- ---------------------------------------------------------------- Monteva Hua Hin: BOQ v1 + plan summary
-- Fills the empty draft BOQ v1 from the "Cost-Monteva" sheet and the appliances list, then turns the
-- matching plan lines into FROM_BOQ summaries. Runs once: skipped when v1 already has lines.
create function pg_temp.boq_add(v uuid, par uuid, cat_code text, item_no text, descr text, uom text, qty numeric, rate numeric,
  per boolean default true, grp boolean default false, spec uuid default null, note text default null)
returns uuid language plpgsql as $$
declare b budget_versions; nid uuid;
begin
  select * into b from budget_versions where id = v;
  insert into boq_items (organization_id, budget_version_id, cost_category_id, parent_id, item_code, description, uom,
    quantity, rate, per_unit, is_group, spec_item_id, note, sort_order)
  values (b.organization_id, v, (select id from cost_categories where organization_id = b.organization_id and cost_categories.code = cat_code),
    par, item_no, descr, coalesce(uom, 'LS'), case when grp then 0 else qty end, case when grp then 0 else rate end,
    per and not grp, grp, spec, note,
    coalesce((select max(sort_order) from boq_items where budget_version_id = v), 0) + 1)
  returning id into nid;
  return nid;
end $$;

do $$
declare
  proj uuid := '36eca940-eeaa-4d6b-b79d-83ac781cd6f3';
  v uuid := 'c250d8f4-a5d8-4939-b929-2188616ad538';
  g uuid; g2 uuid;
  a boolean := true;
begin
  if not exists(select 1 from budget_versions where id = v and project_id = proj and status = 'DRAFT') then
    raise notice 'Monteva BOQ v1 is not an open draft; data step skipped';
    return;
  end if;
  if exists(select 1 from boq_items where budget_version_id = v and removed_at is null) then
    raise notice 'Monteva BOQ v1 already has lines; data step skipped';
    return;
  end if;

  -- 1 ที่ดิน (ทั้งโครงการ)
  perform pg_temp.boq_add(v, null, 'LAND', '1.1', 'ค่าที่ดิน', 'LS', 1, 6000000, false);
  perform pg_temp.boq_add(v, null, 'LAND', '1.2', 'ค่าโอน / รังวัด / นายหน้า ตอนซื้อที่ดิน', 'LS', 1, 8000, false);
  -- 2 ออกแบบ
  perform pg_temp.boq_add(v, null, 'PROF', '2.1', 'ค่าออกแบบ / วิศวกร', 'LS', 1, 300000, false);
  -- 3 สาธารณูปโภค / ส่วนกลาง (ทั้งโครงการ)
  g := pg_temp.boq_add(v, null, 'INFRA', '3.1', 'ปรับพื้นที่', null, 0, 0, false, true);
  perform pg_temp.boq_add(v, g, 'INFRA', '3.1.1', 'ถมดิน / ปรับพื้นที่', 'LS', 1, 300000, false);
  g := pg_temp.boq_add(v, null, 'INFRA', '3.2', 'ถนนและระบบสาธารณูปโภค', null, 0, 0, false, true);
  perform pg_temp.boq_add(v, g, 'INFRA', '3.2.1', 'งานถนน', 'ตร.ม.', 504, 650, false);
  perform pg_temp.boq_add(v, g, 'INFRA', '3.2.2', 'งานระบบท่อระบายน้ำ', 'ม.', 72, 2000, false);
  perform pg_temp.boq_add(v, g, 'INFRA', '3.2.3', 'งานไฟฟ้าเข้าโครงการ', 'LS', 1, 500000, false);
  g := pg_temp.boq_add(v, null, 'INFRA', '3.3', 'รั้วโครงการ', null, 0, 0, false, true);
  perform pg_temp.boq_add(v, g, 'INFRA', '3.3.1', 'งานรั้วบ้าน', 'ม.', 160, 3500, false);
  perform pg_temp.boq_add(v, g, 'INFRA', '3.3.2', 'งานปูหินรั้ว', 'ตร.ม.', 16, 2200, false);

  -- 4 งานบ้าน: ทุกบรรทัดเป็นจำนวนของบ้าน 1 หลัง ระบบคูณจำนวนหลังให้
  g := pg_temp.boq_add(v, null, 'HOUSE', '4.1', 'ตัวบ้าน', null, 0, 0, a, true);
  perform pg_temp.boq_add(v, g, 'HOUSE', '4.1.1', 'พื้นที่หลัก (งานบ้านมาตรฐานช่าง)', 'ตร.ม.', 239, 18000);
  perform pg_temp.boq_add(v, g, 'HOUSE', '4.1.2', 'ระเบียงสระ (มีหลังคา)', 'ตร.ม.', 45, 10000);
  perform pg_temp.boq_add(v, g, 'HOUSE', '4.1.3', 'ระเบียงสระ (ไม่มีหลังคา)', 'ตร.ม.', 23, 7500);
  perform pg_temp.boq_add(v, g, 'HOUSE', '4.1.4', 'โรงรถ + ทางเดิน', 'ตร.ม.', 75, 10000);
  perform pg_temp.boq_add(v, g, 'HOUSE', '4.1.5', 'ห้องเก็บของ', 'ตร.ม.', 7.2, 10000);
  perform pg_temp.boq_add(v, g, 'HOUSE', '4.1.6', 'รางน้ำฝน', 'ม.', 60, 2600, true, false, '8c495325-2abe-4408-8e74-936e378a8e2e');
  g := pg_temp.boq_add(v, null, 'HOUSE', '4.2', 'หน้าบ้าน', null, 0, 0, a, true);
  perform pg_temp.boq_add(v, g, 'HOUSE', '4.2.1', 'ซุ้มประตูหน้าบ้าน', 'ชุด', 1, 40000);
  perform pg_temp.boq_add(v, g, 'HOUSE', '4.2.2', 'ปูหินซุ้ม', 'ตร.ม.', 35, 2200);
  perform pg_temp.boq_add(v, g, 'HOUSE', '4.2.3', 'ประตูอลูมิเนียมหน้าบ้าน', 'ชุด', 1, 120000);
  g := pg_temp.boq_add(v, null, 'HOUSE', '4.3', 'สระว่ายน้ำ', null, 0, 0, a, true);
  perform pg_temp.boq_add(v, g, 'HOUSE', '4.3.1', 'งานสระว่ายน้ำ', 'ตร.ม.', 37, 16000);
  perform pg_temp.boq_add(v, g, 'HOUSE', '4.3.2', 'ห้องปั๊ม + ถังน้ำ', 'ตร.ม.', 6, 13000);
  g := pg_temp.boq_add(v, null, 'HOUSE', '4.4', 'งานระบบ', null, 0, 0, a, true);
  perform pg_temp.boq_add(v, g, 'HOUSE', '4.4.1', 'ระบบโซลาร์เซลล์', 'ชุด', 1, 200000, true, false, '97e8336a-5a24-4652-be71-fe90841463da');
  g := pg_temp.boq_add(v, null, 'HOUSE', '4.5', 'สวน', null, 0, 0, a, true);
  perform pg_temp.boq_add(v, g, 'HOUSE', '4.5.1', 'งานสวนในบ้าน', 'LS', 1, 150000);
  g := pg_temp.boq_add(v, null, 'HOUSE', '4.6', 'ตกแต่งภายใน', null, 0, 0, a, true);
  perform pg_temp.boq_add(v, g, 'HOUSE', '4.6.1', 'ตกแต่งภายใน / บิวท์อิน', 'LS', 1, 1500000);
  g := pg_temp.boq_add(v, null, 'HOUSE', '4.7', 'เครื่องปรับอากาศ', null, 0, 0, a, true);
  perform pg_temp.boq_add(v, g, 'HOUSE', 'MTV-AC-001', 'แอร์ Inverter Living/Dining 24,000 BTU', 'เครื่อง', 2, 35000, true, false, 'b55cc884-168f-421b-baf3-537f684bdb5b', 'ตรวจ Cooling Load จริง');
  perform pg_temp.boq_add(v, g, 'HOUSE', 'MTV-AC-002', 'แอร์ Inverter Master Bedroom 18,000 BTU', 'เครื่อง', 1, 28000, true, false, 'b55cc884-168f-421b-baf3-537f684bdb5b', 'ตรวจ Cooling Load จริง');
  perform pg_temp.boq_add(v, g, 'HOUSE', 'MTV-AC-003', 'แอร์ Inverter ห้องนอน/Office 12,000–15,000 BTU', 'เครื่อง', 2, 23000, true, false, 'b55cc884-168f-421b-baf3-537f684bdb5b', 'ตรวจ Cooling Load จริง');
  perform pg_temp.boq_add(v, g, 'HOUSE', 'MTV-AC-003B', 'แอร์ Inverter ห้องนอน/Office 12,000 BTU', 'เครื่อง', 1, 22000, true, false, 'b55cc884-168f-421b-baf3-537f684bdb5b', 'รายการประกอบแบบตั้งไว้ 5 จุด รายการนี้ใช้ 6 เครื่อง');
  g := pg_temp.boq_add(v, null, 'HOUSE', '4.8', 'เครื่องใช้ไฟฟ้า', null, 0, 0, a, true);
  g2 := pg_temp.boq_add(v, g, 'HOUSE', '4.8.1', 'ครัว (European Kitchen)', null, 0, 0, a, true);
  perform pg_temp.boq_add(v, g2, 'HOUSE', 'MTV-KT-001', 'ตู้เย็น Side-by-Side 20–23 คิว', 'เครื่อง', 1, 38000, true, false, null, 'ตรวจช่องติดตั้ง');
  perform pg_temp.boq_add(v, g2, 'HOUSE', 'MTV-KT-002', 'เตาอบ Built-in 60 ซม.', 'เครื่อง', 1, 20000);
  perform pg_temp.boq_add(v, g2, 'HOUSE', 'MTV-KT-003', 'เตา Induction 3–4 หัว', 'เครื่อง', 1, 18000, true, false, null, 'ตรวจโหลดไฟและช่องเจาะ');
  perform pg_temp.boq_add(v, g2, 'HOUSE', 'MTV-KT-004', 'เครื่องดูดควัน', 'เครื่อง', 1, 15000);
  perform pg_temp.boq_add(v, g2, 'HOUSE', 'MTV-KT-005', 'Microwave Built-in', 'เครื่อง', 1, 12000);
  perform pg_temp.boq_add(v, g2, 'HOUSE', 'MTV-KT-006', 'เครื่องล้างจาน 60 ซม.', 'เครื่อง', 1, 22000);
  g2 := pg_temp.boq_add(v, g, 'HOUSE', '4.8.2', 'ซักรีด', null, 0, 0, a, true);
  perform pg_temp.boq_add(v, g2, 'HOUSE', 'MTV-LD-001', 'เครื่องซักผ้าฝาหน้า 10–12 กก.', 'เครื่อง', 1, 22000);
  perform pg_temp.boq_add(v, g2, 'HOUSE', 'MTV-LD-002', 'เครื่องอบผ้า Heat Pump 9–10 กก.', 'เครื่อง', 1, 23000);
  g2 := pg_temp.boq_add(v, g, 'HOUSE', '4.8.3', 'น้ำร้อน', null, 0, 0, a, true);
  perform pg_temp.boq_add(v, g2, 'HOUSE', 'MTV-WT-001', 'เครื่องทำน้ำอุ่น Master 8,000 W', 'เครื่อง', 1, 10000, true, false, 'd9ce2d9f-9f1a-4b6d-8833-13184c126005', 'ให้วิศวกรไฟฟ้าตรวจรุ่นและวงจร');
  perform pg_temp.boq_add(v, g2, 'HOUSE', 'MTV-WT-002', 'เครื่องทำน้ำอุ่นห้องอื่น 6,000 W', 'เครื่อง', 3, 7000, true, false, 'd9ce2d9f-9f1a-4b6d-8833-13184c126005');
  perform pg_temp.boq_add(v, g2, 'HOUSE', 'MTV-WT-003', 'ชุดติดตั้งเครื่องทำน้ำอุ่น', 'งาน', 1, 4000);
  g2 := pg_temp.boq_add(v, g, 'HOUSE', '4.8.4', 'ทีวี / พัดลม', null, 0, 0, a, true);
  perform pg_temp.boq_add(v, g2, 'HOUSE', 'MTV-SM-001', 'Smart TV ห้องนั่งเล่น 65 นิ้ว', 'เครื่อง', 1, 30000);
  perform pg_temp.boq_add(v, g2, 'HOUSE', 'MTV-SM-002', 'พัดลมเพดาน Premium', 'เครื่อง', 4, 5000, true, false, '4dffc8b8-88cb-4b08-80b4-cb4b78c4114b');
  -- Probably already in the contractor's scope: kept at quantity 0 until checked.
  g2 := pg_temp.boq_add(v, g, 'HOUSE', '4.8.5', 'รอเช็กว่าซ้ำกับงานผู้รับเหมา (ยังไม่นับ)', null, 0, 0, a, true);
  perform pg_temp.boq_add(v, g2, 'HOUSE', 'MTV-WT-004', 'ปั๊มน้ำแรงดันคงที่', 'เครื่อง', 0, 15000, true, false, '1689ab7f-3e76-4b89-9bb9-4db5a5cf6163', 'อาจรวมในงานประปาเดิม ถ้าไม่รวมให้แก้จำนวนเป็น 1');
  perform pg_temp.boq_add(v, g2, 'HOUSE', 'MTV-SM-003', 'มอเตอร์ประตูรั้วอัตโนมัติ', 'ชุด', 0, 25000, true, false, '25a62da6-e5de-4870-a458-3ed97b299511', 'อาจรวมในงานรั้ว/ประตูอลูมิเนียม');
  perform pg_temp.boq_add(v, g2, 'HOUSE', 'MTV-SM-004', 'Video Door Phone / Smart Entry', 'ชุด', 0, 12000, true, false, '1e2f0e71-fe24-4fca-a77e-5026ed5bc2d6', 'ตรวจระบบ Security เดิม');
  perform pg_temp.boq_add(v, g2, 'HOUSE', 'MTV-PL-001', 'ปั๊มสระและชุดควบคุมพื้นฐาน', 'ชุด', 0, 25000, true, false, 'f2a4441d-f21c-4ad7-ab5a-dc5dfba9f9ee', 'อาจรวมใน 16,000/ตร.ม. ของงานสระแล้ว');

  -- Plan: one summary line per cost code from the BOQ; the detail lines move into the BOQ.
  update forecast_lines set removed_at = now(), cost_category_id = null, updated_at = now()
   where project_id = proj and removed_at is null and id in (
     'cd21b12b-497e-47ea-a8a5-664596668d79',  -- ค่าโอน / รังวัด (now BOQ 1.2)
     '9e70cc9c-662c-42fd-b4fd-1dbbb12dff9b',  -- ถมดิน (BOQ 3.1)
     '0aa10259-0199-4892-bfa8-ba9f88fb1f88',  -- ส่วนกลาง (BOQ 3.3)
     '642ea4dc-7ee8-4f05-99e2-301f2a7d9e35',  -- เสาเข็ม (in 18,000/ตร.ม.)
     'e9c49a2e-2e63-46e3-98e5-995fe0f2c2f0',  -- ตกแต่งภายใน (BOQ 4.6)
     'b64809fd-fbba-482b-8fa9-d3e7a8bd0443',  -- เฟอร์นิเจอร์ลอยตัว
     'daab01be-2973-4333-b4e1-a63aa3a07956'); -- สระ (BOQ 4.3)
  update forecast_lines set method = 'FROM_BOQ', amount = 0, rate = 0, quantity = 0, label = x.label, updated_at = now()
    from (values
      ('496499e3-65a2-4f18-b35b-30b16557f0f3'::uuid, 'ที่ดิน (จาก BOQ)'),
      ('6ad6baf6-5d48-42f1-bf03-3ea2be1b0bb1'::uuid, 'ค่าออกแบบ / วิศวกร (จาก BOQ)'),
      ('95cafde0-88da-4b13-9bc4-85488be63f12'::uuid, 'สาธารณูปโภค / ปรับพื้นที่ / รั้ว (จาก BOQ)'),
      ('87294931-6f7e-4839-863a-8c9ca40da921'::uuid, 'งานบ้าน 4 หลัง รวมตกแต่ง แอร์ เครื่องใช้ไฟฟ้า (จาก BOQ)')
    ) x(id, label)
   where forecast_lines.id = x.id and forecast_lines.project_id = proj and forecast_lines.cost_category_id is not null;
  update forecast_lines set amount = 500000, updated_at = now()
   where id = 'ffd88b80-ddc1-4a84-9c7c-68daf7348487' and project_id = proj;

  -- Check against the sheet: land 6,008,000 / design 300,000 / site 1,866,800 / houses 9,080,500 × 4.
  if (select sum(amount) from public.boq_effective(v) e join cost_categories c on c.id = e.cost_category_id where c.code = 'HOUSE') <> 36322000
     or (select sum(amount) from public.boq_effective(v) e join cost_categories c on c.id = e.cost_category_id where c.code = 'INFRA') <> 1866800
     or (select sum(amount) from public.boq_effective(v) e join cost_categories c on c.id = e.cost_category_id where c.code = 'LAND') <> 6008000
     or (select sum(amount) from public.boq_effective(v)) <> 44496800 then
    raise exception 'Monteva BOQ totals do not match the sheet';
  end if;
  if (select count(*) from forecast_lines where project_id = proj and removed_at is null and method = 'FROM_BOQ') <> 4 then
    raise exception 'Monteva plan lines not switched to FROM_BOQ';
  end if;
end $$;
