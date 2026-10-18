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
    and (summary->'deleted'->>'quality')::int = 1 and (summary->'unlinked'->>'leads')::int = 1, 'summary counts ' || summary);
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
