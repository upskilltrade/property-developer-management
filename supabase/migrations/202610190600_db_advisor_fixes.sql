-- Fixes from the Supabase database advisors (security + performance), roadmap §6 quality gates.
-- Nothing is dropped: functions and policies are altered in place, indexes are added.

-- Security: pin search_path on functions that didn't set it (lint 0011).
alter function public.guard_boq_item() set search_path = public;
alter function public.guard_drawing_revision() set search_path = public;
alter function public.guard_handover() set search_path = public;
alter function public.guard_signed_contract() set search_path = public;
alter function public.imp_date(jsonb, text) set search_path = public;
alter function public.imp_num(jsonb, text) set search_path = public;
alter function public.imp_text(jsonb, text) set search_path = public;
alter function public.import_fail(text) set search_path = public;
alter function public.reject_contract_version_change() set search_path = public;
alter function public.reject_customer_approval_change() set search_path = public;
alter function public.reject_rfi_response_change() set search_path = public;
alter function public.reject_vo_history_change() set search_path = public;

-- Performance: evaluate auth.uid() once per query instead of once per row (lint 0003).
alter policy risk_reviews_select on public.risk_reviews
  using (created_by = (select auth.uid()) or public.can_manage_access(organization_id));
alter policy assistant_logs_select on public.assistant_logs
  using (user_id = (select auth.uid()) or (organization_id is not null and public.can_manage_access(organization_id)));
alter policy notifications_own_select on public.notifications using (user_id = (select auth.uid()));
alter policy notification_preferences_own_select on public.notification_preferences using (user_id = (select auth.uid()));
alter policy calendar_feeds_own_select on public.calendar_feeds using (user_id = (select auth.uid()));
alter policy activity_photos_project_select on public.activity_photos
  using (public.can_access_project(project_id)
         or (uploaded_by = (select auth.uid()) and public.partner_can_see_activity(activity_id)));
alter policy purchase_requests_select on public.purchase_requests
  using (public.can_procure(project_id, 'VIEW') or public.can_cost(project_id, 'VIEW')
         or (requested_by = (select auth.uid()) and public.can_access_project(project_id)));
alter policy pr_items_select on public.pr_items
  using (exists(select 1 from public.purchase_requests r where r.id = pr_items.pr_id
           and (public.can_procure(r.project_id, 'VIEW') or public.can_cost(r.project_id, 'VIEW')
                or (r.requested_by = (select auth.uid()) and public.can_access_project(r.project_id)))));

-- Performance: index foreign keys used to filter or join (project, unit, parent records) (lint 0001).
-- Audit columns (*_by) and organization_id are not filtered on, so they are left unindexed.
create index if not exists ai_photo_reviews_project_id_fk_idx on public.ai_photo_reviews(project_id);
create index if not exists bookings_project_id_fk_idx on public.bookings(project_id);
create index if not exists change_requests_project_id_fk_idx on public.change_requests(project_id);
create index if not exists customer_approvals_project_id_fk_idx on public.customer_approvals(project_id);
create index if not exists defects_project_id_fk_idx on public.defects(project_id);
create index if not exists drawing_revisions_project_id_fk_idx on public.drawing_revisions(project_id);
create index if not exists drawings_project_id_fk_idx on public.drawings(project_id);
create index if not exists goods_receipts_project_id_fk_idx on public.goods_receipts(project_id);
create index if not exists import_batches_project_id_fk_idx on public.import_batches(project_id);
create index if not exists inspection_standards_project_id_fk_idx on public.inspection_standards(project_id);
create index if not exists inspections_project_id_fk_idx on public.inspections(project_id);
create index if not exists lead_activities_project_id_fk_idx on public.lead_activities(project_id);
create index if not exists material_selections_project_id_fk_idx on public.material_selections(project_id);
create index if not exists notifications_project_id_fk_idx on public.notifications(project_id);
create index if not exists payment_schedules_project_id_fk_idx on public.payment_schedules(project_id);
create index if not exists payments_project_id_fk_idx on public.payments(project_id);
create index if not exists progress_claims_project_id_fk_idx on public.progress_claims(project_id);
create index if not exists purchase_orders_project_id_fk_idx on public.purchase_orders(project_id);
create index if not exists purchase_requests_project_id_fk_idx on public.purchase_requests(project_id);
create index if not exists rfis_project_id_fk_idx on public.rfis(project_id);
create index if not exists risk_reviews_project_id_fk_idx on public.risk_reviews(project_id);
create index if not exists sales_contract_versions_project_id_fk_idx on public.sales_contract_versions(project_id);
create index if not exists sales_contracts_project_id_fk_idx on public.sales_contracts(project_id);
create index if not exists service_requests_project_id_fk_idx on public.service_requests(project_id);
create index if not exists site_instructions_project_id_fk_idx on public.site_instructions(project_id);
create index if not exists supplier_quotations_project_id_fk_idx on public.supplier_quotations(project_id);
create index if not exists unit_handovers_project_id_fk_idx on public.unit_handovers(project_id);
create index if not exists unit_holds_project_id_fk_idx on public.unit_holds(project_id);
create index if not exists unit_warranties_project_id_fk_idx on public.unit_warranties(project_id);
create index if not exists variation_orders_project_id_fk_idx on public.variation_orders(project_id);
create index if not exists activity_photos_unit_id_fk_idx on public.activity_photos(unit_id);
create index if not exists boq_items_unit_id_fk_idx on public.boq_items(unit_id);
create index if not exists change_requests_unit_id_fk_idx on public.change_requests(unit_id);
create index if not exists defects_unit_id_fk_idx on public.defects(unit_id);
create index if not exists design_renders_unit_id_fk_idx on public.design_renders(unit_id);
create index if not exists inspections_unit_id_fk_idx on public.inspections(unit_id);
create index if not exists notifications_unit_id_fk_idx on public.notifications(unit_id);
create index if not exists partner_assignments_unit_id_fk_idx on public.partner_assignments(unit_id);
create index if not exists payment_evidence_unit_id_fk_idx on public.payment_evidence(unit_id);
create index if not exists payments_unit_id_fk_idx on public.payments(unit_id);
create index if not exists progress_updates_unit_id_fk_idx on public.progress_updates(unit_id);
create index if not exists purchase_orders_unit_id_fk_idx on public.purchase_orders(unit_id);
create index if not exists purchase_requests_unit_id_fk_idx on public.purchase_requests(unit_id);
create index if not exists rfis_unit_id_fk_idx on public.rfis(unit_id);
create index if not exists schedule_activities_unit_id_fk_idx on public.schedule_activities(unit_id);
create index if not exists service_requests_unit_id_fk_idx on public.service_requests(unit_id);
create index if not exists site_instructions_unit_id_fk_idx on public.site_instructions(unit_id);
create index if not exists variation_orders_unit_id_fk_idx on public.variation_orders(unit_id);
create index if not exists viewings_unit_id_fk_idx on public.viewings(unit_id);
create index if not exists partner_assignments_partner_id_fk_idx on public.partner_assignments(partner_id);
create index if not exists procurement_contracts_partner_id_fk_idx on public.procurement_contracts(partner_id);
create index if not exists progress_claims_partner_id_fk_idx on public.progress_claims(partner_id);
create index if not exists purchase_orders_partner_id_fk_idx on public.purchase_orders(partner_id);
create index if not exists rfis_partner_id_fk_idx on public.rfis(partner_id);
create index if not exists service_requests_partner_id_fk_idx on public.service_requests(partner_id);
create index if not exists site_instructions_partner_id_fk_idx on public.site_instructions(partner_id);
create index if not exists site_reports_partner_id_fk_idx on public.site_reports(partner_id);
create index if not exists supplier_quotations_partner_id_fk_idx on public.supplier_quotations(partner_id);
create index if not exists unit_warranties_partner_id_fk_idx on public.unit_warranties(partner_id);
create index if not exists variation_orders_partner_id_fk_idx on public.variation_orders(partner_id);
create index if not exists boq_items_cost_category_id_fk_idx on public.boq_items(cost_category_id);
create index if not exists procurement_contracts_cost_category_id_fk_idx on public.procurement_contracts(cost_category_id);
create index if not exists progress_claims_cost_category_id_fk_idx on public.progress_claims(cost_category_id);
create index if not exists purchase_orders_cost_category_id_fk_idx on public.purchase_orders(cost_category_id);
create index if not exists purchase_requests_cost_category_id_fk_idx on public.purchase_requests(cost_category_id);
create index if not exists customers_import_batch_id_fk_idx on public.customers(import_batch_id);
create index if not exists payment_schedules_import_batch_id_fk_idx on public.payment_schedules(import_batch_id);
create index if not exists payments_import_batch_id_fk_idx on public.payments(import_batch_id);
create index if not exists unit_sales_import_batch_id_fk_idx on public.unit_sales(import_batch_id);
create index if not exists units_import_batch_id_fk_idx on public.units(import_batch_id);
create index if not exists bookings_lead_id_fk_idx on public.bookings(lead_id);
create index if not exists unit_holds_lead_id_fk_idx on public.unit_holds(lead_id);
create index if not exists viewings_lead_id_fk_idx on public.viewings(lead_id);
create index if not exists bookings_customer_id_fk_idx on public.bookings(customer_id);
create index if not exists leads_customer_id_fk_idx on public.leads(customer_id);
create index if not exists payment_schedules_customer_id_fk_idx on public.payment_schedules(customer_id);
create index if not exists rfi_responses_rfi_id_fk_idx on public.rfi_responses(rfi_id);
create index if not exists site_instructions_rfi_id_fk_idx on public.site_instructions(rfi_id);
create index if not exists pr_items_pr_id_fk_idx on public.pr_items(pr_id);
create index if not exists purchase_orders_pr_id_fk_idx on public.purchase_orders(pr_id);
create index if not exists goods_receipts_po_id_fk_idx on public.goods_receipts(po_id);
create index if not exists handover_items_handover_id_fk_idx on public.handover_items(handover_id);
create index if not exists vo_approvals_vo_id_fk_idx on public.vo_approvals(vo_id);
create index if not exists payments_evidence_id_fk_idx on public.payments(evidence_id);
create index if not exists defects_inspection_id_fk_idx on public.defects(inspection_id);
create index if not exists notification_outbox_notification_id_fk_idx on public.notification_outbox(notification_id);
create index if not exists activity_photos_progress_update_id_fk_idx on public.activity_photos(progress_update_id);
create index if not exists sales_contracts_booking_id_fk_idx on public.sales_contracts(booking_id);
create index if not exists service_requests_warranty_id_fk_idx on public.service_requests(warranty_id);
create index if not exists inspections_activity_id_fk_idx on public.inspections(activity_id);
create index if not exists customers_primary_profile_id_fk_idx on public.customers(primary_profile_id);
create index if not exists leads_assigned_to_fk_idx on public.leads(assigned_to);
create index if not exists progress_claims_procurement_contract_id_fk_idx on public.progress_claims(procurement_contract_id);
create index if not exists purchase_orders_quotation_id_fk_idx on public.purchase_orders(quotation_id);
create index if not exists inspection_items_standard_id_fk_idx on public.inspection_items(standard_id);
