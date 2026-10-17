-- Demo data for schedule & progress on PROJECT-001 (5 houses). Not a migration: run by hand on a
-- demo/dev database after apply_schedule_template has created each unit's activities.
-- Seeded verifications have no verifier (imported history); pending reports belong to the owner.

with plan(unit_code, delay_days, pct) as (values
  ('UNIT-01', 48, '{"A01":100,"A02":100,"A03":100,"A04":100,"A05":100,"A06":100,"A07":100,"A08":100,"A09":100,"A10":100,"A11":100,"A12":100,"A13":100,"A14":60}'::jsonb),
  ('UNIT-02', 42, '{"A01":100,"A02":100,"A03":100,"A04":100,"A05":100,"A06":100,"A07":100,"A08":100,"A09":50,"A10":40,"A13":100}'::jsonb),
  ('UNIT-03', 30, '{"A01":100,"A02":100,"A03":100,"A04":100,"A05":100,"A06":100,"A07":60,"A13":30}'::jsonb),
  ('UNIT-04', 12, '{"A01":100,"A02":100,"A03":100,"A04":70}'::jsonb),
  ('UNIT-05', 4,  '{"A01":100,"A02":80}'::jsonb)
),
acts as (
  select a.id, a.unit_id, a.code, a.baseline_start, a.baseline_finish, p.delay_days,
         coalesce((p.pct->>a.code)::numeric, 0) as pct
    from schedule_activities a
    join units u on u.id = a.unit_id
    join plan p on p.unit_code = u.code
   where a.project_id = '36eca940-eeaa-4d6b-b79d-83ac781cd6f3'
),
shifted as (
  update schedule_activities s
     set verified_percent = acts.pct,
         status = case when acts.pct >= 100 then 'COMPLETED' when acts.pct > 0 then 'IN_PROGRESS' else 'NOT_STARTED' end,
         forecast_start = acts.baseline_start + acts.delay_days,
         forecast_finish = case when acts.pct >= 100 then least(acts.baseline_finish + acts.delay_days, date '2026-10-16')
                                else greatest(acts.baseline_finish + acts.delay_days, date '2026-10-24') end,
         actual_start = case when acts.pct > 0 then least(acts.baseline_start + acts.delay_days, date '2026-10-16') end,
         actual_finish = case when acts.pct >= 100 then least(acts.baseline_finish + acts.delay_days, date '2026-10-16') end,
         updated_at = now()
    from acts where acts.id = s.id
  returning s.*
)
insert into progress_updates (organization_id, project_id, unit_id, activity_id, report_date, reported_percent,
  note, verified_percent, verified_at, verification_note, publication_status, published_at)
select organization_id, project_id, unit_id, id,
       coalesce(actual_finish, date '2026-10-15'), verified_percent,
       'ข้อมูลตัวอย่าง', verified_percent, coalesce(actual_finish, date '2026-10-15')::timestamptz, 'นำเข้าข้อมูลเดิม',
       case when verified_percent >= 100 then 'PUBLISHED' else 'INTERNAL' end,
       case when verified_percent >= 100 then coalesce(actual_finish, date '2026-10-15')::timestamptz end
  from shifted where verified_percent > 0;

-- Reports from the site still waiting for verification (official progress unchanged).
insert into progress_updates (organization_id, project_id, unit_id, activity_id, report_date, reported_percent, reported_by, note)
select a.organization_id, a.project_id, a.unit_id, a.id, date '2026-10-16', r.pct,
       'cea179ff-e1ee-4cb9-978a-a2d6a104da5a', r.note
  from schedule_activities a join units u on u.id = a.unit_id
  join (values ('UNIT-03','A07',75,'เดินท่อน้ำชั้น 2 เสร็จ เหลือร้อยสายไฟ'),
               ('UNIT-04','A04',85,'เทพื้นชั้นบนแล้ว รอบ่มคอนกรีต'),
               ('UNIT-02','A09',70,'ติดตั้งวงกบครบ เหลือบานประตู')) r(unit_code, code, pct, note)
    on r.unit_code = u.code and r.code = a.code
 where a.project_id = '36eca940-eeaa-4d6b-b79d-83ac781cd6f3';

update schedule_activities a set reported_percent = p.reported_percent
  from (select distinct on (activity_id) activity_id, reported_percent from progress_updates order by activity_id, created_at desc) p
 where p.activity_id = a.id;

-- Project-level works (no unit).
insert into schedule_activities (organization_id, project_id, unit_id, code, name_th, name_en, stage, sequence, weight,
  baseline_start, baseline_finish, forecast_start, forecast_finish, actual_start, actual_finish, status, verified_percent, photos_required)
select pr.organization_id, pr.id, null, v.code, v.th, v.en, v.stage, v.seq, v.weight,
       v.bs::date, v.bf::date, v.fs::date, v.ff::date, v.as_::date, v.af::date, v.status, v.pct, 1
  from projects pr cross join (values
    ('P01','ปรับถมพื้นที่โครงการ','Site filling & grading','FOUNDATION',10,20,'2026-04-01','2026-04-30','2026-04-01','2026-05-02','2026-04-01','2026-05-02','COMPLETED',100),
    ('P02','ระบบระบายน้ำ / บ่อพัก','Drainage & manholes','MEP',20,20,'2026-05-01','2026-06-15','2026-05-04','2026-07-10','2026-05-04','2026-07-10','COMPLETED',100),
    ('P03','ถนนภายในโครงการ','Internal road','FINISHING',30,25,'2026-07-01','2026-09-30','2026-07-15','2026-11-15','2026-07-15',null,'IN_PROGRESS',55),
    ('P04','รั้วรอบโครงการ / ป้อมยาม','Perimeter fence & guardhouse','STRUCTURE',40,15,'2026-06-01','2026-08-15','2026-06-01','2026-08-20','2026-06-01','2026-08-20','COMPLETED',100),
    ('P05','ไฟฟ้า / ประปา ส่วนกลาง','Utility connections','MEP',50,20,'2026-08-01','2026-11-30','2026-08-15','2026-12-20','2026-08-15',null,'IN_PROGRESS',30)
  ) v(code, th, en, stage, seq, weight, bs, bf, fs, ff, as_, af, status, pct)
 where pr.id = '36eca940-eeaa-4d6b-b79d-83ac781cd6f3'
on conflict do nothing;

select public.refresh_unit_progress(u.id) from units u where u.project_id = '36eca940-eeaa-4d6b-b79d-83ac781cd6f3';
