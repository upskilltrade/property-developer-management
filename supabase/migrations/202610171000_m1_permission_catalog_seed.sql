-- Seed the M1 permission catalog with every module/action pair the system role matrix grants.
-- Custom roles and per-person overrides can only pick from this catalog.
insert into public.permission_catalog(module_code,action_code,name_th,name_en,sort_order) values
  ('PORTFOLIO','VIEW','ดูพอร์ตโครงการ','View portfolio',10),
  ('PROJECTS','VIEW','ดูโครงการ','View projects',20),
  ('FINANCE','VIEW','ดูการเงิน','View finance',30),
  ('FINANCE','CREATE','สร้างการเงิน','Create finance',40),
  ('FINANCE','APPROVE','อนุมัติการเงิน','Approve finance',50),
  ('FINANCE','POST','ลงบัญชีการเงิน','Post finance',60),
  ('TAX','VIEW','ดูภาษี','View tax',70),
  ('COST_CONTROL','VIEW','ดูควบคุมต้นทุน','View cost control',80),
  ('COST_CONTROL','EDIT','แก้ไขควบคุมต้นทุน','Edit cost control',90),
  ('PROCUREMENT','VIEW','ดูจัดซื้อ','View procurement',100),
  ('PROCUREMENT','CREATE','สร้างจัดซื้อ','Create procurement',110),
  ('PROCUREMENT','EDIT','แก้ไขจัดซื้อ','Edit procurement',120),
  ('PROCUREMENT','APPROVE','อนุมัติจัดซื้อ','Approve procurement',130),
  ('CONSTRUCTION','VIEW','ดูก่อสร้าง','View construction',140),
  ('CONSTRUCTION','EDIT','แก้ไขก่อสร้าง','Edit construction',150),
  ('CONSTRUCTION','APPROVE','อนุมัติก่อสร้าง','Approve construction',160),
  ('SALES','VIEW','ดูการขาย','View sales',170),
  ('SALES','EDIT','แก้ไขการขาย','Edit sales',180),
  ('CUSTOMERS','VIEW','ดูลูกค้า','View customers',190),
  ('CUSTOMERS','EDIT','แก้ไขลูกค้า','Edit customers',200),
  ('REPORTS','VIEW','ดูรายงาน','View reports',210),
  ('INVESTOR','VIEW','ดูผู้ลงทุน','View investor',220),
  ('CONTRACTOR_PORTAL','VIEW','ดูพอร์ทัลผู้รับเหมา','View contractor portal',230),
  ('CLAIMS','CREATE','สร้างเบิกงวดงาน','Create claims',240),
  ('CUSTOMER_PORTAL','VIEW','ดูพอร์ทัลลูกค้า','View customer portal',250),
  ('SERVICE_REQUEST','CREATE','สร้างคำขอบริการ / แจ้งซ่อม','Create service requests',260)
on conflict(module_code,action_code) do update
set name_th=excluded.name_th,name_en=excluded.name_en,sort_order=excluded.sort_order;
