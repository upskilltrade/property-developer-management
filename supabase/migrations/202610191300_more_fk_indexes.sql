-- Indexes for foreign keys that the code filters or joins on (house delete unlinks VOs, design
-- packages and leads by these columns; cascades scan schedule children; contractor screens filter
-- by assigned partner; online payments are looked up by project and payment).
create index if not exists variation_orders_payment_schedule_id_idx on public.variation_orders (payment_schedule_id);
create index if not exists variation_orders_drawing_revision_id_idx on public.variation_orders (drawing_revision_id);
create index if not exists variation_orders_site_instruction_id_idx on public.variation_orders (site_instruction_id);
create index if not exists variation_orders_change_request_id_idx on public.variation_orders (change_request_id);
create index if not exists variation_orders_schedule_activity_id_idx on public.variation_orders (schedule_activity_id);
create index if not exists design_packages_parent_package_id_idx on public.design_packages (parent_package_id);
create index if not exists leads_interested_unit_id_idx on public.leads (interested_unit_id);
create index if not exists schedule_activities_parent_id_idx on public.schedule_activities (parent_id);
create index if not exists schedule_activities_assigned_partner_id_idx on public.schedule_activities (assigned_partner_id);
create index if not exists defects_assigned_partner_id_idx on public.defects (assigned_partner_id);
create index if not exists online_payments_project_id_idx on public.online_payments (project_id);
create index if not exists online_payments_payment_id_idx on public.online_payments (payment_id);
create index if not exists rfis_drawing_id_idx on public.rfis (drawing_id);
create index if not exists forecast_lines_cost_category_id_idx on public.forecast_lines (cost_category_id);
