# Property Development Management Platform — Data Model v1.0

**Status:** Conceptual Data Architecture  
**Pilot:** Project 001 — 5 residential houses  
**Language Requirement:** Thai (th) + English (en) from day one

## 1. Goals
The model supports multiple projects, Developer/Customer/Partner portals, strict data isolation, controlled revisions, workflows/approvals, dashboards with drill-down, PostgreSQL/Supabase implementation, and Thai-English operation.

## 2. Core Hierarchy
Organization → Project → Phase → Plot → Unit/Property.

Unit is the main operational hub connecting House Type, Customer, Design, Construction, Commercial, Documents, Handover and Warranty.

## 3. High-Level ERD
Organization has many Projects; Project has many Phases; Phase has many Plots; Plot normally has a Unit. Unit references a House Type and connects to CustomerProperty, DesignPackage, ScheduleActivity, Task, ProgressUpdate, Inspection, Defect, Booking, Contract, PaymentSchedule, CustomerRequest, VariationOrder, Handover and Warranty.

Shared platform entities: Document/DocumentVersion, WorkflowInstance/WorkflowTask, Approval, Notification, TimelineEvent, AuditEvent and LocalizedContent.

## 4. Identity & Access
### organizations
id, code, legal_name, display_name, default_locale, base_currency, timezone, status.

Initial defaults: th, THB, Asia/Bangkok. Supported locales: th and en.

### profiles
id, auth_user_id, display_name, preferred_locale, phone, avatar, status.

### organization_memberships
id, organization_id, profile_id, status, joined_at.

### roles / permissions / membership_roles
Roles grant capabilities; membership roles also contain scope_type and scope_id so a user can have different authority per project/unit.

## 5. Project Structure
### projects
organization_id, code, internal_name, status, dates, currency, timezone, default_locale.

### phases
project_id, code, sequence, status.

### plots
phase_id, code, land_area_sqm, title_reference, orientation, status.

### units
plot_id, house_type_id, code, commercial_status, construction_status, base_price, plot_premium, target_completion_date.

Plot and Unit remain separate concepts even when Project 001 uses 1:1.

### house_types
organization_id, code, status, floor area, bedrooms, bathrooms, floors, master_design_package_id.

## 6. Thai-English Architecture
Thai and English are first-class requirements.

### UI Translation
Static interface labels use application translation keys, for example nav.dashboard, action.approve and payment.status.paid. Locale resources live under en and th. Static labels are not duplicated in business rows.

### Localized Business Content
Project public names/descriptions, house type names, material descriptions, specifications, milestone text, warranty descriptions and templates can have multiple language versions.

Recommended localized_content fields:
organization_id, entity_type, entity_id, field_name, locale, value_text/value_json, status, updated_at.

Unique key: entity_type + entity_id + field_name + locale.

### User-Generated Text
Customer requests, site notes, comments, RFIs and messages preserve original_text and original_locale. Machine/human translations are stored separately and never overwrite the original evidence.

### Locale Resolution
User preference → organization/project default → th fallback → en secondary fallback.

### Dates, Numbers and Currency
Database dates remain Gregorian/timezone-safe. Thai Buddhist Era formatting is presentation-only. Currency uses fixed-precision decimal and ISO-style currency code, initially THB.

### Names and Addresses
Official identity/address values are preserved exactly. Transliteration/display fields may be separate.

### Documents/Templates
Templates support Thai-only, English-only or bilingual Thai-English. Generated documents retain template version and language mode.

## 7. Customer Domain
### customers
organization_id, customer_number, customer_type, status, primary_profile_id, preferred_locale.

### customer_people
customer_id, role, legal_name, display_name, phone, email, nationality, restricted identity metadata, preferred_locale.

Sensitive KYC is separated/restricted.

### customer_properties
customer_id, unit_id, relationship_type, ownership_percentage, is_primary, status, effective dates.

Customer Portal authorization derives from this explicit relationship.

## 8. Partner Domain
### partner_organizations
organization_id, partner_type, legal/display name, restricted tax reference, status.

Types include contractor, subcontractor, supplier, consultant, architect, engineer, inspector, factory and agent.

### partner_contacts
partner_organization_id, profile_id, name, email, phone, role.

### partner_assignments
partner_organization_id, project_id, optional phase/unit/work_package, scope_description, dates, status.

Partner Portal authorization derives from assignments.

## 9. Design Domain
DesignPackage supports Master House → Plot-specific inheritance.

Disciplines include Architecture, Interior, Structure, MEP, Landscape, Pool and Furniture.

rooms_zones supports project/unit/house type hierarchy.

drawings represent logical drawing identities; drawing_revisions are immutable revisions with revision code, status, creator, submission/approval/release timestamps, superseded revision and linked document version. Released revisions are never overwritten.

specifications and materials support localized customer-facing content.

material_selections link unit + room/zone + material and record customer approval where relevant.

## 10. Construction Domain
work_breakdown_items provide hierarchical WBS.

schedule_activities hold baseline, forecast and actual dates plus progress/status.

tasks support internal or partner assignment.

site_reports hold date, weather, manpower, work summary, issues and verification.

progress_updates store reported_percent separately from verified_percent. Official progress uses verified data and a publication status controls portal visibility.

RFIs, Site Instructions, Inspections and Defects are first-class traceable records.

## 11. Cost & BOQ
cost_codes provide reusable hierarchy.

estimates are versioned and approvable.

boqs and boq_items include version/baseline, cost code, description, unit, quantity, rate, amount and optional room/WBS links.

budgets and budget_lines distinguish baseline, budget, committed, actual and forecast concepts. Derived totals should not be redundantly stored unless reporting performance requires it.

## 12. Procurement
PurchaseRequest → RFQ → SupplierQuotation → PurchaseOrder → Delivery.

Items can link to material/specification/BOQ. Commercial records include currency, tax treatment, approval state, documents and audit history.

## 13. Contractor Commercial
contractor_contracts link project + partner with scope, original/current value, retention/advance rules and status.

progress_claims store claimed, verified, approved and retention amounts.

variation_orders store source, unit, customer-facing flag, cost_delta, price_delta, time_delta_days and status. Customer selling-price impact and contractor cost impact remain distinguishable.

## 14. Marketing & CRM
campaigns store project/channel/budget/spend/status.

leads store project/campaign/source/status/contact/preferred language/budget and assignment.

lead_activities, viewings and viewing_units preserve customer journey.

price_lists, unit_prices, promotions and sales_offers retain price history rather than silently overwriting commercial terms.

## 15. Booking & Contract
holds have unit, customer/lead, start, expiry and status.

bookings have unit, customer, booking number/date, agreed price, required payment and confirmation status. Business/database controls prevent conflicting active commitments on one unit.

contracts are logical identities. contract_versions are immutable, versioned, language-aware and linked to document versions/templates. Accepted versions cannot be overwritten.

## 16. Payments
payment_schedules link contract/unit and contain sequence, type, description, amount, due date and status.

payment_evidence stores submitted proof separately.

payments represent official verified financial receipt events and include amount, currency, paid date, verifier, verification date, reference and status.

receipts link to verified payments.

Only authorized Finance verification creates official paid state.

## 17. Customer Requests & Approvals
customer_requests link customer + unit with type, title, original description/language and workflow status.

customer_approvals reference exact entity/revision/offer, decision, timestamp and optional evidence. An approval must always identify exactly what the customer accepted.

## 18. Handover & Warranty
handovers link unit/customer, schedule, completion and acceptance.

handover_items cover keys, meters, manuals, equipment and documents.

warranties contain unit/category/start/end/responsible partner/terms/status.

service_requests link unit/customer/warranty and contain category, original description, status, assignment and resolution.

## 19. Document Vault
documents are logical identities with organization/project/unit/customer/partner links, document type/code/title/classification/visibility/current version/status.

document_versions are immutable and contain storage metadata, checksum, locale, uploader, timestamp and superseded version.

Raw storage paths are never authorization mechanisms.

## 20. Workflow & Approval
workflow_definitions are organization-owned and versioned.

workflow_instances bind a workflow to a business entity.

workflow_tasks support assigned user/role, due date and state.

approvals record entity, approver, decision, comment and timestamp.

approval_rules support configurable project/value/role approval policies.

## 21. Timeline & Audit
timeline_events are business-readable history with organization/project/unit/customer context, event type, entity, actor, timestamp and visibility.

audit_events are restricted compliance/security evidence containing actor, action, entity, before/after data where appropriate, request context and timestamp.

Timeline and Audit are deliberately separate.

## 22. Notifications
notifications contain recipient, event type, translation/content key, related entity, channel, locale, state and send/read timestamps.

Notification templates support Thai and English.

## 23. Document Templates
document_templates are versioned by organization/type/code and language mode.

document_template_locales contain locale-specific content and variable schemas.

Supports Thai, English and bilingual documents. Historical output retains the exact template/version reference.

## 24. Status Architecture
Store stable machine codes, never translated status strings.

Example database value: AVAILABLE.
Thai UI: ว่าง.
English UI: Available.

Example: AWAITING_APPROVAL.
Thai: รออนุมัติ.
English: Awaiting approval.

Business logic therefore remains language-independent.

## 25. Money & Time
Money uses fixed-precision decimal plus currency code; never floating point.

Timestamps are timezone-aware. Contractual date-only obligations use date fields where appropriate. Project 001 presents Asia/Bangkok time.

## 26. Immutability
Business-critical records should be voided/cancelled/superseded rather than physically deleted.

Immutable/versioned examples: released drawing revisions, signed contracts, verified payments (corrected via controlled reversal), customer approvals, audit events and important generated documents.

## 27. Row-Level Security Direction
Every business record must resolve to an organization.

PostgreSQL/Supabase direction:
- organization_id on top-level records.
- project/unit relationships on scoped records.
- RLS based on authenticated profile + membership + role/scope.
- Customer access through customer_properties.
- Partner access through partner_assignments.
- Backend authorization regardless of frontend filtering.

## 28. Customer Isolation
Authenticated user → profile/customer account → customer_properties → unit → CUSTOMER-visible resources.

Knowing another UUID never grants access.

## 29. Partner Isolation
Authenticated user → partner contact/membership → active partner_assignment → assigned project/unit/work package → permitted resources.

Partner commercial records also require ownership by that partner.

## 30. Search
Authorized search can include project/unit code, customer, partner, drawing number, contract, booking, PO, VO, RFI and defect.

Thai search behavior must be explicitly tested; English tokenization assumptions are not sufficient.

## 31. Reporting Layer
Normalized operational data feeds SQL views/materialized views/reporting tables such as unit_sales_summary, project_cost_summary, project_cashflow_summary, construction_progress_summary, marketing_funnel_summary and approval_bottleneck_summary.

Every KPI retains drill-down keys to source records.

## 32. Source of Truth
Project/Plot/Unit identity → Project domain.
Unit commercial status → controlled sales/unit workflow.
Customer ownership/relationship → customer_properties.
Current released drawing → drawing + drawing_revision.
Official construction progress → verified progress_update.
Budget baseline → approved budget/BOQ version.
Procurement commitment → approved PO/contract.
Customer contract → accepted contract_version.
Customer payment → Finance-verified payment.
Customer approval → customer_approvals.
Partner scope → partner_assignments.
File version → document_versions.
Business history → timeline_events.
Compliance/security history → audit_events.

## 33. Data Principles
1. Stable IDs; human-readable display codes.
2. Language-neutral status codes.
3. Translations never control business logic.
4. Preserve original user language.
5. Version approved/released evidence instead of overwriting it.
6. Customer/partner access derives from explicit relationships.
7. Unit is the main operational drill-down hub.
8. Financial truth requires authorized verification.
9. Timeline and security audit are separate.
10. Derived KPIs must trace to source records.

## 34. MVP Domains
Foundation: Organization, Profile, Membership, Role, Permission, Project, Phase, Plot, Unit, HouseType.

Customer/Sales: Lead, Activity, Viewing, Customer, CustomerProperty, Hold, Booking, Contract, PaymentSchedule, PaymentEvidence, Payment.

Design/Documents: DesignPackage, Drawing, DrawingRevision, MaterialSelection, Document, DocumentVersion, Approval.

Construction: WBS, ScheduleActivity, Task, ProgressUpdate, SitePhoto/Document, Inspection, Defect.

Workflow: WorkflowInstance, WorkflowTask, Approval, TimelineEvent, AuditEvent, Notification.

Portal authorization: CustomerProperty and PartnerAssignment.

Multilingual support is Foundation scope, not a later feature.

## 35. Deferred Expansion
Detailed tendering/inventory, accounting ledger integration, advanced contractor measurement, equipment asset register, agent commission, AI generation metadata, BIM/3D metadata and advanced warranty asset mapping can expand after MVP.

## 36. Multilingual Acceptance Criteria
The MVP is not multilingual-ready unless:
1. Users can switch Thai/English.
2. Navigation/status/actions render correctly in both.
3. Customer-facing business content can store both languages where required.
4. Original Thai/English user text is preserved.
5. Notifications support both languages.
6. Documents can be Thai, English or bilingual.
7. Dates/numbers/currency follow locale policy.
8. Thai search is tested.
9. Business logic never compares translated display strings.
10. Missing translations have defined fallback behavior.

## 37. Next Artifact
Next: UX-INFORMATION-ARCHITECTURE.md defining Developer Operations, Customer Portal, Partner Portal, dashboards, Project/Unit 360°, role-based home screens, TH/EN switch, mobile/site flows, global search, Pending Actions and Notification Center.

Then create MVP-ROADMAP.md and TECHNICAL-ARCHITECTURE.md before production SQL migrations.

**Data principle:** one controlled source of truth, multilingual at the presentation/content layer, immutable where evidence matters, and authorization enforced at the data boundary.
