-- Deleting a house: Owner/Admin only, typed code must match, its records go, leads stay unlinked,
-- the other house is untouched and a project-level timeline entry remains.
do $$
declare
  p uuid := pg_temp.t_project(2);
  owner uuid := pg_temp.t_user('owner');
  site uuid := pg_temp.t_user('site');
  buyer uuid := pg_temp.t_user('buyer');
  u1 uuid := pg_temp.t_unit(p, 'T-01');
  u2 uuid := pg_temp.t_unit(p, 'T-02');
  org uuid := pg_temp.t_org();
  lead uuid; summary jsonb;
begin
  perform pg_temp.t_grant(owner, 'OWNER');
  perform pg_temp.t_grant(site, 'SITE_ENGINEER', p);
  perform pg_temp.t_customer(buyer, u1);
  insert into schedule_activities (organization_id, project_id, unit_id, code, name_th, name_en, stage)
  values (org, p, u1, 'A1', 'ฐานราก', 'Foundation', 'FOUNDATION'), (org, p, u2, 'A1', 'ฐานราก', 'Foundation', 'FOUNDATION');
  insert into defects (organization_id, project_id, unit_id, defect_no, title) values (org, p, u1, 'DF-1', 'รอยร้าว');
  insert into leads (organization_id, project_id, lead_no, full_name, interested_unit_id)
  values (org, p, 'LD-1', 'ผู้สนใจ', u1) returning id into lead;

  perform pg_temp.t_as(site);
  perform pg_temp.t_ok(not public.can_delete_unit(u1), 'site engineer may not delete a house');
  perform pg_temp.t_refused(format('select public.delete_unit(%L, %L)', u1, 'T-01'), 'Not authorized', 'site engineer deleting');

  perform pg_temp.t_as(owner);
  summary := public.unit_delete_summary(u1);
  perform pg_temp.t_ok((summary->'deleted'->>'schedule')::int = 1 and (summary->'deleted'->>'sales')::int = 1
    and (summary->'deleted'->>'quality')::int = 1 and (summary->'unlinked'->>'leads')::int = 1, 'summary counts ' || summary::text);
  perform pg_temp.t_refused(format('select public.delete_unit(%L, %L)', u1, 'T-02'), 'Confirmation code', 'wrong code typed');
  perform pg_temp.t_ok(exists(select 1 from units where id = u1), 'wrong code deletes nothing');

  perform public.delete_unit(u1, ' T-01 ');
  perform pg_temp.t_as(null);
  perform pg_temp.t_ok(not exists(select 1 from units where id = u1), 'house deleted');
  perform pg_temp.t_ok(not exists(select 1 from unit_sales where unit_id = u1), 'sale deleted');
  perform pg_temp.t_ok(not exists(select 1 from schedule_activities where unit_id = u1), 'schedule deleted');
  perform pg_temp.t_ok(not exists(select 1 from defects where project_id = p), 'defect deleted, not left orphaned');
  perform pg_temp.t_ok((select interested_unit_id is null from leads where id = lead), 'lead kept, unlinked');
  perform pg_temp.t_ok(exists(select 1 from schedule_activities where unit_id = u2), 'other house untouched');
  perform pg_temp.t_ok(exists(select 1 from timeline_events where project_id = p and event_type = 'UNIT_DELETED'
    and unit_id is null and metadata->>'code' = 'T-01'), 'project timeline records the delete');
end $$;

-- A house with signed-contract history, payments, drawings, customer approval, RFI answer and VO
-- history (all normally immutable) deletes cleanly; a PO for it stays as a project cost.
do $$
declare
  p uuid := pg_temp.t_project(1);
  owner uuid := pg_temp.t_user('owner');
  buyer uuid := pg_temp.t_user('buyer');
  u uuid := pg_temp.t_unit(p, 'T-01');
  org uuid := pg_temp.t_org();
  cust uuid; bk uuid; k uuid; sch uuid; pk uuid; dr uuid; rev uuid; rfi uuid; vo uuid; po uuid;
begin
  perform pg_temp.t_grant(owner, 'OWNER');
  cust := pg_temp.t_customer(buyer, u);
  insert into bookings (organization_id, project_id, unit_id, customer_id, booking_no, agreed_price, status)
  values (org, p, u, cust, 'BK-T1', 5000000, 'CONFIRMED') returning id into bk;
  insert into sales_contracts (organization_id, project_id, unit_id, booking_id, customer_id, contract_no, status, signed_file_path)
  values (org, p, u, bk, cust, 'CT-T1', 'SIGNED', 'org/p/u/ct.pdf') returning id into k;
  insert into sales_contract_versions (organization_id, project_id, contract_id, version, contract_price) values (org, p, k, 1, 5000000);
  insert into payment_schedules (organization_id, project_id, unit_id, sequence, kind, label_th, label_en, amount, due_date)
  values (org, p, u, 1, 'BOOKING', 'จอง', 'Booking', 50000, current_date) returning id into sch;
  insert into payments (organization_id, project_id, unit_id, schedule_id, amount, paid_on, method, receipt_no)
  values (org, p, u, sch, 50000, current_date, 'TRANSFER', 'RC-T1');
  insert into design_packages (organization_id, project_id, unit_id, scope, code, name) values (org, p, u, 'UNIT', 'PK-T1', 'แบบบ้าน') returning id into pk;
  insert into drawings (organization_id, project_id, package_id, discipline, drawing_no, title) values (org, p, pk, 'ARCHITECTURE', 'A-01', 'ผัง') returning id into dr;
  insert into drawing_revisions (organization_id, project_id, drawing_id, seq, revision_code, file_path) values (org, p, dr, 1, 'A', 'org/p/a01.pdf') returning id into rev;
  insert into customer_approvals (organization_id, project_id, unit_id, entity_type, entity_id, entity_label, decision)
  values (org, p, u, 'DRAWING_REVISION', rev, 'A-01 A', 'APPROVED');
  insert into rfis (organization_id, project_id, unit_id, rfi_no, subject, question) values (org, p, u, 'RFI-T1', 'ระยะ', 'ถาม') returning id into rfi;
  insert into rfi_responses (organization_id, rfi_id, body) values (org, rfi, 'ตอบ');
  insert into variation_orders (organization_id, project_id, unit_id, vo_no, title, payment_schedule_id, drawing_revision_id)
  values (org, p, u, 'VO-T1', 'เพิ่มห้อง', sch, rev) returning id into vo;
  insert into vo_versions (organization_id, vo_id, version, original_scope, revised_scope) values (org, vo, 1, 'เดิม', 'ใหม่');
  insert into vo_approvals (organization_id, vo_id, version, stage, decision, price_delta, time_delta_days) values (org, vo, 1, 'INTERNAL', 'APPROVED', 100000, 5);
  insert into purchase_orders (organization_id, project_id, unit_id, cost_category_id, partner_id, po_no, amount)
  select org, p, u, (select id from cost_categories where organization_id = org limit 1),
         (select id from partner_organizations where organization_id = org limit 1), 'PO-T1', 10000
  where exists(select 1 from partner_organizations where organization_id = org)
    and exists(select 1 from cost_categories where organization_id = org)
  returning id into po;

  perform pg_temp.t_as(owner);
  perform pg_temp.t_ok(jsonb_array_length(public.delete_unit(u, 'T-01')) = 2, 'two files queued (contract + drawing)');
  perform pg_temp.t_as(null);
  perform pg_temp.t_ok(not exists(select 1 from sales_contract_versions where contract_id = k), 'contract history deleted');
  perform pg_temp.t_ok(not exists(select 1 from payments where schedule_id = sch), 'payments deleted');
  perform pg_temp.t_ok(not exists(select 1 from drawing_revisions where id = rev), 'drawings deleted');
  perform pg_temp.t_ok(not exists(select 1 from rfi_responses where rfi_id = rfi), 'RFI answers deleted');
  perform pg_temp.t_ok(not exists(select 1 from vo_versions where vo_id = vo), 'VO history deleted');
  perform pg_temp.t_ok(po is null or (select unit_id is null from purchase_orders where id = po), 'PO kept as a project cost');
  perform pg_temp.t_ok((select count(*) = 2 from storage_purge_queue where requested_by = owner and purged_at is null), 'files waiting for removal');
  perform pg_temp.t_as(buyer);
  perform public.mark_files_purged(array(select id from storage_purge_queue));
  perform pg_temp.t_as(null);
  perform pg_temp.t_ok((select count(*) = 2 from storage_purge_queue where requested_by = owner and purged_at is null),
    'another user cannot mark someone else''s files as removed');
end $$;
