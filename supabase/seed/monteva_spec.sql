-- Monteva Hua Hin (PROJECT-001): starting spec list from the developer's confirmed specification.
-- Quantities and prices are left blank to fill in from the BOQ; "รอยืนยัน" marks items still to confirm.
-- Safe to run again: existing item numbers are left as they are.
insert into public.spec_items (organization_id, project_id, item_no, seq, category, area, name, description,
  brand, model, color, size, unit, note)
select p.organization_id, p.id, v.item_no, v.seq, v.category, v.area, v.name, v.description,
       v.brand, v.model, v.color, v.size, v.unit, v.note
  from public.projects p
  cross join (values
    ('ST-01', 10, 'STRUCTURE', 'ทั้งหลัง', 'แผ่นพื้นสำเร็จรูป พร้อมเททับหน้าปรับระดับ', 'Precast floor slabs with levelling screed', null, null, null, null, 'ตร.ม.', null),
    ('RF-01', 20, 'ROOF', 'หลังคาบ้าน (ทรงปั้นหยา)', 'กระเบื้องหลังคา พร้อมอุปกรณ์หลังคาครบชุด', 'Roof tiles with complete SCG roofing accessories', 'SCG', 'Prestige', 'Dark Grey', null, 'ตร.ม.', null),
    ('RF-02', 21, 'ROOF', 'หลังคาบ้าน', 'ฉนวนกันความร้อนใต้หลังคา', 'Heat insulation', 'SCG', null, null, null, 'ตร.ม.', null),
    ('RF-03', 22, 'ROOF', 'หลังคาบ้าน', 'ครอบสันหลังคาและรางตะเข้', 'Ridge caps and valleys', 'SCG', null, null, null, 'ม.', null),
    ('RF-04', 23, 'ROOF', 'หลังคาบ้าน', 'โครงหลังคาเหล็กรางน้ำ (C-channel)', 'Steel C-channel roof structure', null, null, null, 'หนา 3.2 มม.', 'ตร.ม.', null),
    ('RF-05', 24, 'ROOF', 'รอบหลังคา', 'ไม้เชิงชาย', 'Fascia boards', 'SCG', null, null, null, 'ม.', null),
    ('RF-06', 25, 'ROOF', 'ชายคาภายนอก', 'ฝ้าชายคาอลูมิเนียมลายไม้', 'Exterior soffits, woodgrain aluminium', null, null, 'ลายไม้สัก (Teak)', null, 'ตร.ม.', null),
    ('RF-07', 26, 'ROOF', 'รอบหลังคา', 'รางน้ำฝนและท่อน้ำลง', 'Gutters and downpipes (SCG or equivalent)', 'SCG หรือเทียบเท่า', null, null, null, 'ม.', null),
    ('RF-08', 30, 'ROOF', 'โรงจอดรถ / หลังคาเทอเรซ', 'หลังคาเมทัลชีทบุฉนวนกันความร้อน บนโครงเหล็ก C 3.2 มม.', 'Heat-insulated metal sheet on 3.2 mm C-channel steel', 'BlueScope', null, null, null, 'ตร.ม.', null),
    ('RF-09', 31, 'ROOF', 'โรงจอดรถ / หลังคาเทอเรซ', 'แฟลชชิ่งและครอบข้าง C', 'Flashing and C-channel side trims', 'SCG', null, null, null, 'ม.', null),
    ('RF-10', 32, 'ROOF', 'โรงจอดรถ / หลังคาเทอเรซ', 'ฝ้าชายคาอลูมิเนียมลายไม้', 'Teak-finish aluminium soffits', 'SCG', null, 'ลายไม้สัก (Teak)', null, 'ตร.ม.', null),
    ('WL-01', 40, 'WALL', 'ผนังรับแรง / ผนังยึด', 'ผนังอิฐมอญ ฉาบเรียบ', 'Red brick, smooth plaster', null, null, null, null, 'ตร.ม.', null),
    ('WL-02', 41, 'WALL', 'ผนังทั่วไป', 'ผนังอิฐบล็อก ฉาบเรียบ', 'Cement block, smooth plaster', null, null, null, 'หนา 14 ซม.', 'ตร.ม.', null),
    ('WL-03', 42, 'WALL', 'เสาโรงจอดรถ', 'กรุหินตกแต่งเสา', 'Decorative stone cladding', null, null, null, null, 'ตร.ม.', null),
    ('FL-01', 50, 'FLOOR', 'ภายในบ้าน', 'พื้น SPC', 'SPC flooring', null, null, null, null, 'ตร.ม.', null),
    ('FL-02', 51, 'FLOOR', 'เทอเรซสระ / โรงจอดรถ', 'พื้นกระเบื้อง', 'Tiles', null, null, null, null, 'ตร.ม.', null),
    ('FL-03', 52, 'FLOOR', 'ห้องน้ำทุกห้อง', 'กระเบื้องพื้นและผนังห้องน้ำ (พื้นกันลื่น)', 'Bathroom tiles, anti-slip floor', 'SCG', null, null, '60x60 ซม.', 'ตร.ม.', 'รอยืนยันข้อความ "กันลื่น"'),
    ('CL-01', 60, 'CEILING', 'ภายในบ้าน', 'ฝ้าฉาบเรียบ ตามแบบตกแต่งภายใน', 'Smooth plaster ceilings to the interior design', null, null, null, null, 'ตร.ม.', null),
    ('DW-01', 70, 'DOOR_WINDOW', 'ทั้งหลัง', 'ประตูและหน้าต่างอลูมิเนียม', 'Aluminium windows and doors', null, null, 'Dark Brown Gold', null, 'ชุด', null),
    ('DW-02', 71, 'DOOR_WINDOW', 'ห้องนอน', 'ประตูวงกบไม้จริง พร้อมซับวงกบตกแต่ง', 'Solid timber-frame doors with decorative sub-frames', null, null, null, null, 'ชุด', null),
    ('DW-03', 72, 'DOOR_WINDOW', 'ห้องน้ำ', 'ประตูห้องน้ำกันน้ำ', 'Waterproof bathroom doors', null, null, null, null, 'ชุด', null),
    ('SN-01', 80, 'SANITARY', 'ห้องน้ำทุกห้อง', 'สุขภัณฑ์ (โถสุขภัณฑ์ อ่างล้างหน้า)', 'Sanitaryware', 'COTTO', null, null, null, 'ชุด', 'รอยืนยันรุ่น'),
    ('SN-02', 81, 'SANITARY', 'ห้องน้ำทุกห้อง', 'ก๊อกน้ำและฝักบัว', 'Taps and showers', 'COTTO', null, null, null, 'ชุด', 'รอยืนยันรุ่น'),
    ('KT-01', 90, 'KITCHEN', 'ครัว', 'ชุดครัว ตามแบบตกแต่งภายใน', 'Kitchen to the interior design', null, null, null, null, 'ชุด', 'รอยืนยัน'),
    ('EL-01', 100, 'ELECTRICAL', 'ทั้งหลัง', 'ไฟฟ้า 3 เฟส มิเตอร์แยกทุกหลัง', '3-phase power, individual meter', null, null, null, null, 'ระบบ', null),
    ('EL-02', 101, 'ELECTRICAL', 'หลังคา', 'ระบบโซลาร์เซลล์', 'Solar PV system', null, null, null, '5 kW', 'ชุด', 'อัปเกรด 10 kW ได้ (มีค่าใช้จ่าย)'),
    ('EL-03', 102, 'ELECTRICAL', 'โรงจอดรถ', 'วงจรรองรับเครื่องชาร์จรถไฟฟ้า (EV)', 'EV charger-ready circuit', null, null, null, null, 'จุด', null),
    ('EL-04', 103, 'ELECTRICAL', 'ทั้งหลัง', 'ตู้ควบคุมไฟฟ้าและเบรกเกอร์', 'Consumer unit and breakers', 'ABB หรือ Schneider', null, null, null, 'ชุด', null),
    ('EL-05', 104, 'ELECTRICAL', 'ทั้งหลัง', 'สายไฟฟ้า', 'Cabling', 'Thai Yazaki / BCC', null, null, null, 'ระบบ', null),
    ('EL-06', 105, 'ELECTRICAL', 'ทั้งหลัง', 'สวิตช์และเต้ารับ รุ่นพรีเมียม', 'Premium switches and sockets', 'Panasonic', null, null, null, 'จุด', null),
    ('LT-01', 110, 'LIGHTING', 'ทั้งหลัง', 'โคมดาวน์ไลท์ LED', 'LED downlights', 'Philips', null, null, null, 'จุด', null),
    ('AC-01', 120, 'AIRCON', 'ห้องนอน / ห้องนั่งเล่น', 'เครื่องปรับอากาศ', 'Air conditioning', null, null, null, null, 'ชุด', 'รอยืนยัน'),
    ('PB-01', 130, 'PLUMBING', 'ทั้งหลัง', 'ถังเก็บน้ำสำรอง ต่อจากน้ำประปา', 'Reserve water tank on mains water', null, null, null, '6,000 ลิตร', 'ใบ', null),
    ('PB-02', 131, 'PLUMBING', 'ทั้งหลัง', 'ปั๊มน้ำ', 'Water pump', null, null, null, null, 'ชุด', 'รอยืนยัน'),
    ('PB-03', 132, 'PLUMBING', 'ทั้งหลัง', 'ระบบท่อน้ำดีและท่อน้ำทิ้ง', 'Supply and drain pipework', null, null, null, null, 'ระบบ', 'รอยืนยันชนิดท่อและยี่ห้อ'),
    ('PB-04', 133, 'PLUMBING', 'ทั้งหลัง', 'ถังบำบัดน้ำเสีย', 'Septic tank', null, null, null, null, 'ใบ', 'รอยืนยัน'),
    ('PB-05', 134, 'PLUMBING', 'ครัว', 'บ่อดักไขมัน', 'Grease trap', null, null, null, null, 'ใบ', 'รอยืนยัน'),
    ('PB-06', 135, 'PLUMBING', 'ห้องน้ำทุกห้อง', 'เครื่องทำน้ำอุ่น', 'Water heaters', null, null, null, null, 'เครื่อง', 'รอยืนยัน'),
    ('PL-01', 140, 'POOL', 'สระว่ายน้ำ', 'สระว่ายน้ำระบบเกลือ แบบน้ำล้น ปูกระเบื้องทั้งสระ', 'Salt-water overflow pool, fully tiled', null, null, null, null, 'สระ', null),
    ('PL-02', 141, 'POOL', 'ขอบสระ', 'ขอบสระหินแกรนิต สีเข้าชุด', 'Granite coping, colour-matched', null, null, null, null, 'ม.', null),
    ('PL-03', 142, 'POOL', 'รอบสระ', 'รางระบายน้ำรอบสระ กันน้ำฝนไหลลงสระ', 'Perimeter channel to keep runoff out', null, null, null, null, 'ม.', null),
    ('EX-01', 150, 'EXTERIOR', 'รั้วรอบแปลง', 'รั้วอิฐบล็อกกรุหิน', 'Block boundary wall with stone cladding', null, null, null, 'สูง 2.50 ม.', 'ม.', null),
    ('EX-02', 151, 'EXTERIOR', 'รั้วรอบแปลง', 'เสาและคานรั้ว คสล. บนเสาเข็ม', 'RC posts and beams on piles', null, null, null, 'เสาเข็มยาว 3 ม.', 'ม.', null),
    ('FN-01', 160, 'FURNITURE', 'ทั้งหลัง', 'งานตกแต่งภายในและเฟอร์นิเจอร์ ตามแบบตกแต่งภายใน', 'Interior design and furniture, included in the price', null, null, null, null, 'ชุด', null)
  ) as v(item_no, seq, category, area, name, description, brand, model, color, size, unit, note)
 where p.code = 'PROJECT-001'
on conflict (project_id, item_no) do nothing;

-- Paid upgrade confirmed by the developer: solar 5 kW -> 10 kW (price to fill in).
insert into public.spec_options (organization_id, project_id, item_id, seq, name, size, note)
select s.organization_id, s.project_id, s.id, 1, 'โซลาร์เซลล์ 10 kW', '10 kW', 'อัปเกรดมีค่าใช้จ่าย ใส่ราคาก่อนเสนอลูกค้า'
  from public.spec_items s join public.projects p on p.id = s.project_id
 where p.code = 'PROJECT-001' and s.item_no = 'EL-02'
   and not exists(select 1 from public.spec_options o where o.item_id = s.id and o.name = 'โซลาร์เซลล์ 10 kW');
