-- Project marketing: who can read and write the plan, brand files, campaigns and copy; approval
-- rules; the storage folder; lead counts per campaign.
do $$
declare
  p uuid := pg_temp.t_project(1);
  other uuid := pg_temp.t_project(1);
  u1 uuid := (select id from units where project_id = p limit 1);
  org uuid := (select organization_id from projects where id = p);
  owner uuid := pg_temp.t_user('owner');
  mkt uuid := pg_temp.t_user('marketing');
  sales uuid := pg_temp.t_user('sales');
  editor uuid := pg_temp.t_user('editor');
  cust uuid := pg_temp.t_user('customer');
  folder text;
  asset uuid;
  camp uuid;
  asset2 uuid;
  n int;
  r record;
begin
  perform pg_temp.t_grant(owner, 'OWNER');
  perform pg_temp.t_grant(mkt, 'MARKETING_SALES', p);
  perform pg_temp.t_grant(sales, 'SALES', p);
  perform pg_temp.t_grant(editor, 'SALES', p);
  insert into membership_permission_overrides (membership_id, module_code, action_code, effect, scope_type, scope_id)
  select om.id, 'MARKETING', 'EDIT', 'ALLOW', 'PROJECT', p from organization_memberships om
   where om.organization_id = org and om.user_id = editor;
  perform pg_temp.t_customer(cust, u1);
  perform pg_temp.t_grant(cust, 'CUSTOMER');
  folder := org || '/' || p || '/';

  -- Permissions as the database sees them.
  perform pg_temp.t_as(owner);
  perform pg_temp.t_ok(public.can_market(p, 'APPROVE'), 'owner can approve');
  perform pg_temp.t_as(mkt);
  perform pg_temp.t_ok(public.can_market(p, 'EDIT') and public.can_market(p, 'APPROVE'), 'marketing role edits and approves');
  perform pg_temp.t_ok(not public.can_market(other, 'VIEW'), 'project-scoped marketing role does not reach other projects');
  perform pg_temp.t_as(sales);
  perform pg_temp.t_ok(public.can_view_marketing(p) and not public.can_market(p, 'EDIT'), 'sales can view, not edit');
  perform pg_temp.t_as(editor);
  perform pg_temp.t_ok(public.can_market(p, 'EDIT') and not public.can_market(p, 'APPROVE'), 'override gives edit only');
  perform pg_temp.t_as(cust);
  perform pg_temp.t_ok(not public.can_view_marketing(p), 'customer cannot view marketing');

  -- Plan: marketing writes it, sales reads it, customers see nothing.
  perform pg_temp.t_as(mkt);
  insert into marketing_plans (organization_id, project_id, tagline, brand_colors, budget_total)
  values (org, p, 'Calm luxury', '[{"name":"Primary","hex":"#1f3a5f"}]', 1500000);
  perform pg_temp.t_refused(format('insert into marketing_plans (organization_id, project_id) values (%L, %L)',
    gen_random_uuid(), other), 'row-level security|foreign key', 'plan for another project / org refused');
  perform pg_temp.t_as(sales);
  perform pg_temp.t_ok((select tagline from marketing_plans where project_id = p) = 'Calm luxury', 'sales reads the plan');
  update marketing_plans set tagline = 'x' where project_id = p;
  get diagnostics n = row_count;
  perform pg_temp.t_ok(n = 0, 'sales cannot edit the plan');
  perform pg_temp.t_as(cust);
  perform pg_temp.t_ok(not exists(select 1 from marketing_plans where project_id = p), 'customer cannot read the plan');

  -- Files: upload into the project folder, then record the asset and its version.
  perform pg_temp.t_as(editor);
  insert into storage.objects (bucket_id, name) values ('marketing-files', folder || 'logo.png'),
    ('marketing-files', folder || 'logo-v2.png');
  perform pg_temp.t_refused(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'marketing-files',
    gen_random_uuid() || '/' || p || '/x.png'), 'row-level security', 'upload under another org refused');
  insert into marketing_assets (organization_id, project_id, category, title)
  values (org, p, 'LOGO', 'Main logo') returning id into asset;
  insert into marketing_asset_files (organization_id, project_id, asset_id, version_no, path, file_name)
  values (org, p, asset, 1, folder || 'logo.png', 'logo.png');
  perform pg_temp.t_refused(format('insert into marketing_asset_files (organization_id, project_id, asset_id, version_no, path)
    values (%L, %L, %L, 2, %L)', org, p, asset, 'elsewhere/logo.png'), 'row-level security', 'file path outside the project refused');
  perform pg_temp.t_refused(format('insert into marketing_assets (organization_id, project_id, category, title, status)
    values (%L, %L, %L, %L, %L)', org, p, 'CI', 'Guide', 'APPROVED'), 'row-level security', 'edit-only user cannot create approved');
  perform pg_temp.t_refused(format('update marketing_assets set status = %L where id = %L', 'APPROVED', asset),
    'row-level security', 'edit-only user cannot approve');

  perform pg_temp.t_as(sales);
  perform pg_temp.t_ok((select count(*) from storage.objects where bucket_id = 'marketing-files' and name like folder || '%') = 2,
    'sales can read marketing files');
  perform pg_temp.t_refused(format('insert into marketing_assets (organization_id, project_id, category, title) values (%L, %L, %L, %L)',
    org, p, 'OTHER', 'x'), 'row-level security', 'sales cannot add assets');
  perform pg_temp.t_as(cust);
  perform pg_temp.t_ok((select count(*) from storage.objects where bucket_id = 'marketing-files' and name like folder || '%') = 0,
    'customer cannot read marketing files');
  perform pg_temp.t_ok(not exists(select 1 from marketing_assets where project_id = p), 'customer cannot see assets');

  -- Approval is stamped by the database and locks the asset for edit-only users.
  perform pg_temp.t_as(mkt);
  update marketing_assets set status = 'APPROVED', approved_by = editor where id = asset;
  perform pg_temp.t_ok((select approved_by = mkt and approved_at is not null from marketing_assets where id = asset),
    'approval stamped with the approver');
  perform pg_temp.t_as(editor);
  update marketing_assets set title = 'Changed' where id = asset;
  get diagnostics n = row_count;
  perform pg_temp.t_ok(n = 0, 'edit-only user cannot change an approved asset');
  perform pg_temp.t_refused(format('update marketing_asset_files set path = %L where asset_id = %L', folder || 'x.png', asset),
    'permission denied', 'file versions cannot be edited in place');
  perform pg_temp.t_as(mkt);
  update marketing_assets set status = 'REVIEW' where id = asset;
  perform pg_temp.t_ok((select approved_by is null from marketing_assets where id = asset), 'leaving approval clears the stamp');

  -- Campaigns, attached files and copy.
  perform pg_temp.t_as(editor);
  insert into marketing_campaigns (organization_id, project_id, code, name, channels, lead_tag, budget)
  values (org, p, 'LAUNCH-Q1', 'Launch', '{FACEBOOK,LINE}', 'Launch Q1', 100000) returning id into camp;
  perform pg_temp.t_refused(format('insert into marketing_campaigns (organization_id, project_id, code, name) values (%L, %L, %L, %L)',
    org, p, 'LAUNCH-Q1', 'Again'), 'marketing_campaigns_project_id_code_key', 'campaign code unique per project');
  insert into marketing_campaign_assets (campaign_id, asset_id, organization_id, project_id) values (camp, asset, org, p);
  insert into marketing_copies (organization_id, project_id, campaign_id, channel, language, body, source)
  values (org, p, camp, 'FACEBOOK', 'TH', 'บ้านพร้อมสระส่วนตัว', 'AI');
  perform pg_temp.t_refused(format('insert into marketing_copies (organization_id, project_id, campaign_id, body, status)
    values (%L, %L, %L, %L, %L)', org, p, camp, 'x', 'APPROVED'), 'row-level security', 'edit-only user cannot approve copy');
  perform pg_temp.t_as(mkt);
  perform pg_temp.t_refused(format('insert into marketing_assets (organization_id, project_id, category, title) values (%L, %L, %L, %L)',
    org, other, 'LOGO', 'x'), 'row-level security', 'project-scoped marketing cannot add to another project');
  perform pg_temp.t_as(null);
  insert into marketing_assets (organization_id, project_id, category, title) values (org, other, 'LOGO', 'Other logo')
  returning id into asset2;
  perform pg_temp.t_as(mkt);
  perform pg_temp.t_refused(format('insert into marketing_campaign_assets (campaign_id, asset_id, organization_id, project_id)
    values (%L, %L, %L, %L)', camp, asset2, org, p), 'row-level security', 'cannot attach another project''s file');

  -- Lead counts per campaign tag and source, for marketing and sales but not customers.
  perform pg_temp.t_as(null);
  insert into leads (organization_id, project_id, lead_no, full_name, source, campaign, stage) values
    (org, p, 'T-MKT-1-' || left(gen_random_uuid()::text, 6), 'A', 'FACEBOOK', 'launch q1', 'NEW'),
    (org, p, 'T-MKT-2-' || left(gen_random_uuid()::text, 6), 'B', 'FACEBOOK', ' Launch Q1 ', 'BOOKED'),
    (org, p, 'T-MKT-3-' || left(gen_random_uuid()::text, 6), 'C', 'LINE', null, 'LOST');
  perform pg_temp.t_as(mkt);
  select coalesce(sum(leads), 0) as leads, coalesce(sum(booked), 0) as booked into r
    from public.marketing_lead_stats(p) where tag = 'launch q1';
  perform pg_temp.t_ok(r.leads = 2 and r.booked = 1, 'leads counted per campaign tag');
  perform pg_temp.t_ok((select sum(leads) from public.marketing_lead_stats(p)) = 3, 'all leads counted');
  perform pg_temp.t_as(cust);
  perform pg_temp.t_refused(format('select * from public.marketing_lead_stats(%L)', p), 'Not authorized',
    'customer cannot read lead counts');

  -- Deleting a campaign takes its copy and file links, not the files.
  perform pg_temp.t_as(sales);
  delete from marketing_campaigns where id = camp;
  get diagnostics n = row_count;
  perform pg_temp.t_ok(n = 0, 'sales cannot delete campaigns');
  perform pg_temp.t_as(mkt);
  delete from marketing_campaigns where id = camp;
  perform pg_temp.t_ok(not exists(select 1 from marketing_copies where campaign_id = camp)
    and not exists(select 1 from marketing_campaign_assets where campaign_id = camp)
    and exists(select 1 from marketing_assets where id = asset), 'campaign delete cascades to copy and links only');
  perform pg_temp.t_as(null);
end $$;
