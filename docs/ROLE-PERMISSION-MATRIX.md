# Property Development Management Platform — Role & Permission Matrix

**Version:** 1.0  
**Status:** Draft for Review  
**Depends on:** MASTER-BRIEF.md, SYSTEM-BLUEPRINT.md, BUSINESS-PROCESS-MAP.md

## 1. Authorization Model

The platform uses RBAC plus scoped access.

```
Effective Access =
User
+ Organization Membership
+ Role
+ Project Scope
+ Unit / Customer / Partner Scope
+ Explicit Permission
+ Record State
```

A role defines what a user may normally do. Scope defines where they may do it. Record state may further restrict actions, for example an approved contract or released drawing cannot be edited like a draft.

## 2. Permission Actions

Standard actions:

- VIEW — read records.
- CREATE — create records.
- EDIT — modify draft/working records.
- SUBMIT — send into review/approval workflow.
- APPROVE — formally approve.
- RELEASE — publish/release controlled information.
- VERIFY — confirm evidence/progress/payment.
- CANCEL — cancel/void according to business rules.
- DELETE — exceptional; generally avoided for business records.
- EXPORT — download/export where allowed.
- MANAGE — administrative configuration.

For important business records, DELETE should normally be replaced by VOID / CANCEL / SUPERSEDE with audit history.

## 3. Data Classification

### Level A — Public / Published
Approved project information intended for public/customer marketing use.

### Level B — Operational
Tasks, schedules, drawings, site reports, procurement status and internal coordination.

### Level C — Commercial Confidential
BOQ cost, supplier prices, contractor prices, margin, negotiation and internal financial information.

### Level D — Personal / Contractual
Customer identity, contracts, payment evidence, KYC and private communication.

### Level E — Management Restricted
Portfolio profitability, financing, management notes, sensitive legal matters and organization-level configuration.

## 4. Developer Operations Roles

### Owner / Management
Scope: organization-wide unless intentionally restricted.

Can:
- View all projects and executive dashboards.
- Approve project feasibility and major commitments.
- View revenue, cost, cash flow and margin.
- Approve high-value discounts, procurement, contracts and variations according to approval matrix.
- View management-restricted information.
- Review audit and critical issues.

Should not normally:
- Perform routine system administration unless separately assigned Admin.
- Modify approved operational records without controlled workflow.

### Project Manager
Scope: assigned projects.

Can:
- View complete operational project picture.
- Manage project plan, milestones, coordination and assignments.
- Review design/construction/procurement/customer impacts.
- Approve/recommend within delegated authority.
- Issue or authorize controlled project/site instructions.
- Verify project progress where policy allows.
- Coordinate handover readiness.

Restricted:
- Organization-wide finance outside assigned projects.
- System administration.
- Customer KYC beyond operational need.

### Architect / Interior Designer
Scope: assigned projects/design packages.

Can:
- Create/edit design packages.
- Create drawings and revisions.
- Manage specifications/material selections.
- Respond to design RFIs.
- Review customer design requests.
- Submit drawings for approval.
- Publish customer-safe design only when granted release permission.

Cannot by default:
- Approve own final AFC release.
- View confidential supplier/contractor pricing unless needed.
- Verify customer payments.

### Engineer / MEP / Technical Consultant
Scope: assigned disciplines/projects.

Can:
- Review technical drawings.
- Create/review technical documents.
- Respond to RFIs.
- Perform/record inspections.
- Approve technical items within delegated authority.
- Create defects/non-conformance items.

### Site Manager / Site Engineer
Scope: assigned projects/units.

Can:
- View released drawings/specifications.
- Create daily reports.
- Update site progress.
- Upload photos.
- Create/assign site issues.
- Request inspections.
- Verify contractor-reported physical progress where authorized.
- Record material receipt/site observations.
- Manage defects.

Cannot:
- Edit released design.
- Change approved commercial terms.
- Verify customer payments.

### QS / Cost Control
Scope: assigned projects.

Can:
- Create estimates/BOQ.
- Maintain cost codes.
- Manage budget working versions.
- Evaluate procurement commercial comparisons.
- Cost variations.
- Verify contractor claims/quantities.
- Produce budget/forecast reporting.
- Submit cost items for approval.

Access:
Commercial Confidential.

Cannot by default:
- Approve own high-value commercial submissions.
- Publish customer prices without commercial workflow.

### Procurement
Scope: assigned projects/categories.

Can:
- Create/manage RFQs.
- Manage supplier quotations.
- Prepare comparisons.
- Create PR/PO working records.
- Track delivery.
- Maintain supplier/product records.
- Submit procurement for approval.

Cannot:
- Approve above delegated thresholds.
- Change BOQ baseline without controlled cost process.

### Finance / Accounting
Scope: assigned organization/projects according to policy.

Can:
- View contracts/payment schedules required for finance.
- Verify customer payment evidence.
- Record official payment status.
- Manage receipts.
- Process AP/AR records.
- Record contractor/supplier payment status.
- Produce finance/cash-flow reporting.

Sensitive authority:
Only Finance/authorized roles can turn unverified customer evidence into official PAID status.

### Marketing
Scope: assigned projects/campaigns.

Can:
- Manage campaigns/channels/content records.
- Manage marketing assets.
- View approved inventory/product information.
- View lead attribution and campaign performance.
- View aggregated sales conversion.

Restricted:
No confidential BOQ, contractor pricing, customer KYC or management financing data by default.

### Sales
Scope: assigned projects/leads/customers.

Can:
- Create/manage leads.
- Record activities/viewings.
- View saleable inventory.
- Prepare quotations/offers.
- Create hold/reservation/booking workflow.
- Manage customer relationship.
- Request discount approval.
- View customer commercial terms relevant to sale.
- Initiate contract preparation.

Cannot:
- Self-approve discounts outside authority.
- Mark payments PAID without Finance verification.
- View construction cost/margin by default.

### Customer Service
Scope: assigned projects/customers.

Can:
- View customer/property/contract summary needed for service.
- Manage customer communication.
- Coordinate design approvals.
- Create/manage customer requests.
- Coordinate inspections/handover.
- Manage warranty/service requests.
- Publish approved customer updates where authorized.

Restricted:
No internal margin/supplier quotation access by default.

### Admin
Scope: organization configuration.

Can:
- Manage users/memberships.
- Assign roles/scopes according to governance.
- Configure master data.
- Configure workflow/notification settings.
- Manage integration configuration where authorized.
- Review technical/audit administration.

Important:
Admin does not automatically mean business approver or unrestricted financial viewer. Technical administration and business authority are separate.

## 5. Customer Role

Scope: customer relationship + explicitly linked property/unit(s).

Can view:
- Own profile.
- Own property.
- Published project/house progress.
- Customer-safe drawings/renders/materials.
- Own contract/documents.
- Own payment schedule/status/receipts.
- Own requests/variations.
- Own inspections/handover.
- Own warranty/service records.

Can act:
- Submit required information/documents.
- Upload payment evidence.
- Approve/reject designated design/VO items.
- Create requests.
- Confirm inspection/handover actions where required.
- Create warranty/service requests.

Cannot view:
- Other customers.
- Internal developer notes.
- Internal BOQ/cost.
- Margin.
- Supplier/contractor pricing.
- Unverified progress.
- Draft internal drawings.
- Internal approval discussion.

## 6. Contractor Role

Scope: partner organization + explicit project/work-package/unit assignments.

Can view:
- Assigned scope.
- Released drawings/specifications.
- Relevant schedule/tasks.
- Relevant site instructions/RFIs.
- Their inspections/defects.
- Their contract/commercial records as permitted.

Can act:
- Submit progress.
- Upload site evidence.
- Create RFIs.
- Request inspections.
- Respond to defects.
- Submit variation proposals.
- Submit progress claims.
- Upload required documents.

Cannot:
- View competing contractor pricing.
- View full project margin.
- View customer private/KYC data.
- View unrelated units/projects.
- Modify developer-approved drawings.

## 7. Supplier Role

Scope: assigned RFQ/PO/delivery records.

Can:
- View issued RFQs/POs relevant to supplier.
- Submit quotation where supported.
- Confirm supply/delivery.
- Upload delivery/compliance documents.
- View own payment status if exposed.

Cannot:
- View competitor quotations.
- View internal comparison/margin.
- View customer data.
- View unrelated project information.

## 8. Consultant / Inspector Role

Scope: explicit assignment.

Can:
- View required released documents.
- Review assigned technical scope.
- Submit reports/inspection results.
- Comment/respond within assigned workflow.

No access beyond assignment by default.

## 9. Agent / Broker Role

Scope: assigned/referral leads and permitted inventory.

Can:
- View approved saleable inventory/pricing.
- Register/referral leads where policy allows.
- View status of own qualified/referral cases to permitted level.
- Access own commission records if enabled.

Cannot:
- View internal CRM notes beyond policy.
- View unrelated leads.
- View customer KYC/contracts unless specifically authorized.
- View internal project costs.

## 10. Guest / External Role

No broad default access.

Every guest grant must specify:
- Resource(s)
- Permission(s)
- Purpose
- Expiry
- Granting user
- Audit event

Use for lawyers, banks, external reviewers and one-off professional access.

## 11. High-Level Domain Matrix

Legend:
V = View
W = Create/Edit/Submit
A = Approve/Verify/Release where delegated
— = No default access

| Role | Development | Design | Construction | Cost/Procurement | CRM/Sales | Customer/Contract | Finance | Admin |
|---|---|---|---|---|---|---|---|---|
| Owner/Management | V/A | V/A | V/A | V/A | V/A | V/A | V/A | — |
| Project Manager | V/W/A | V/W/A | V/W/A | V/W | V | V/W | V | — |
| Architect/Interior | V | V/W | V | V limited | — | V/W limited | — | — |
| Engineer | V | V/W/A technical | V/W/A | V limited | — | — | — | — |
| Site Manager | V | V released | V/W/A | V/W limited | — | V limited | — | — |
| QS/Cost Control | V | V | V | V/W/A delegated | — | V commercial limited | V cost | — |
| Procurement | V | V specs | V | V/W/A delegated | — | — | V payable limited | — |
| Finance/Accounting | V limited | — | V limited | V commercial | V commercial | V/W payment | V/W/A | — |
| Marketing | V published | V published | V published | — | V/W | V limited | V aggregate | — |
| Sales | V published | V customer-safe | V published | — | V/W/A delegated | V/W | V receivable limited | — |
| Customer Service | V | V customer-safe | V published | — | V limited | V/W | V customer payment | — |
| Admin | V metadata | V metadata | V metadata | V metadata | V metadata | V metadata | V metadata | A |
| Customer | V published | V own published | V own published | — | — | V/W own | V own | — |
| Contractor | V assigned | V released | V/W assigned | V/W own | — | — | V own claim status | — |
| Supplier | V assigned | V specs | V delivery | V/W own | — | — | V own payment status | — |
| Consultant/Inspector | V assigned | V assigned | V/W assigned | — | — | — | — | — |
| Agent/Broker | V published | V published | V published | — | V/W assigned | V limited | V own commission | — |

This matrix is intentionally high-level. Endpoint/table policies must use finer-grained permissions.

## 12. Critical Segregation of Duties

The system should support separation between preparation and approval.

Examples:

### Drawing
Designer creates revision → authorized reviewer approves → authorized role releases for construction.

### Customer Payment
Customer/Sales uploads evidence → Finance verifies → official payment status changes.

### Procurement
Requester creates PR → Procurement sources → authorized approver approves → PO issued.

### Contractor Claim
Contractor submits → Site verifies physical work → QS verifies value → authorized approver approves → Finance pays.

### Variation
Requester initiates → Design scopes → QS costs → PM assesses time → authorized developer approver approves → customer approves when applicable → controlled release.

### Discount
Sales requests → authorized manager approves according to threshold.

No user should gain approval authority merely because they created the record.

## 13. Approval Matrix Concept

Approval rules should be configurable.

Example structure:

```
Rule:
  workflow_type
  project_id (optional)
  amount_from
  amount_to
  required_role
  required_approver_count
  sequence
```

Illustrative use:
- Discount ≤ configured threshold → Sales Manager.
- Larger discount → Management.
- PO below threshold → PM.
- PO above threshold → Management.
- Major VO → Management + customer approval where applicable.

Actual monetary thresholds remain business-policy decisions.

## 14. Record-State Restrictions

Permissions alone are insufficient.

Examples:
- DRAFT drawing: creator/team may edit.
- APPROVED drawing: editing creates a new revision.
- RELEASED drawing: cannot be overwritten.
- SIGNED contract: immutable; amendment required.
- VERIFIED payment: correction requires controlled reversal/adjustment.
- CLOSED defect: reopening creates an auditable state change.
- APPROVED VO: commercial scope cannot silently change.

## 15. Scope Rules

### Organization Scope
Access across all authorized projects.

### Project Scope
Only selected project(s).

### Phase Scope
Only selected phase(s).

### Unit Scope
Only selected unit(s).

### Work-Package Scope
Partner access to defined work packages.

### Customer Scope
Customer/employee access to specified customer relationships.

### Record Scope
Guest or special access to explicit documents/records.

A user can hold multiple roles/scopes simultaneously.

## 16. Portal Boundary Rules

Portal is a UX boundary, not the security boundary.

Backend authorization must enforce every request regardless of which UI generated it.

A Customer URL must never become accessible to another customer by changing an ID.

A Contractor must never access another partner's claim or scope by guessing identifiers.

All object access requires server-side authorization.

## 17. File / Document Permissions

Every document should inherit or define:
- Classification
- Project/unit/customer/partner scope
- Internal/customer/partner visibility
- Download permission
- Current version
- Approval/release state

Signed contracts, KYC, payment evidence and sensitive legal files require stronger access restrictions.

Temporary file links should expire.

## 18. Audit Requirements

Audit events are required for:
- Login/security-sensitive changes.
- Role/scope changes.
- Project/unit status changes.
- Price/discount changes.
- Drawing approval/release.
- Contract issue/sign/amendment.
- Payment verification/reversal.
- BOQ/budget baseline changes.
- PO/VO/claim approval.
- Customer approvals.
- Progress verification.
- Defect closure.
- Transfer/handover.
- Guest access grants.

Audit should record actor, timestamp, action, target, previous/new state when applicable, and request/context metadata appropriate to security policy.

## 19. Customer Data Isolation

Customer access must be derived from an explicit CustomerProperty relationship.

```
Authenticated User
→ Customer Profile
→ CustomerProperty
→ Unit
→ Customer-safe resources
```

Never authorize customer access based only on project membership or URL parameters.

## 20. Partner Data Isolation

Partner access must derive from explicit Assignment.

```
Authenticated User
→ Partner Membership
→ Assignment
→ Project / Unit / Work Package
→ Allowed resources
```

This supports one contractor working across multiple projects without exposing unrelated data.

## 21. Admin Bootstrap

Initial platform setup requires at least:
- Organization Owner
- System Admin
- Project 001
- Initial internal team
- Role assignments
- Project scopes

Owner and Admin may initially be the same person, but the data model must treat the roles separately.

## 22. MVP Roles

For Project 001, roles can initially be consolidated to reduce complexity:

1. Owner / Management
2. Project Manager
3. Design
4. Site / Engineer
5. QS / Procurement
6. Finance / Accounting
7. Marketing / Sales
8. Customer Service
9. Admin
10. Customer
11. Contractor / Partner

The architecture still supports splitting these into finer roles later.

## 23. MVP Permission Priorities

Must enforce from first release:
- Customer isolation.
- Partner isolation.
- Internal vs customer-published content.
- Internal commercial-cost confidentiality.
- Finance-only payment verification.
- Drawing revision/release control.
- Contract immutability.
- Approval audit trail.
- Project-scoped employee access.
- Admin/business-authority separation.

## 24. Open Policy Decisions

To finalize authorization:
1. Who may release AFC drawings?
2. Who may verify construction progress?
3. Who may publish progress to customers?
4. Who may approve each discount tier?
5. Who may approve PR/PO by amount?
6. Who may approve customer/contractor VO by amount?
7. Who may change unit selling price?
8. Who may cancel booking/contract?
9. Who may reverse verified payments?
10. Who may access customer KYC?
11. Who may export customer lists?
12. Which partner commercial information is visible in Partner Portal?
13. Which management financial KPIs should PM/QS see?
14. Guest-access maximum duration.
15. Whether sensitive actions require MFA/re-authentication.

These are configurable policy decisions and do not block conceptual data modeling.

## 25. Next Artifact

Next: **DATA-MODEL.md**

It should convert the approved business processes and authorization concepts into:
- Domain ERD
- Entity definitions
- Relationship cardinality
- Tenant/project scoping
- Customer/partner isolation model
- Versioned document/drawing model
- Workflow/approval model
- Audit/timeline model
- Source-of-truth rules
- Initial PostgreSQL/Supabase-ready schema direction

No production migrations should be written until the conceptual model is reviewed.

---

**Security principle:** UI visibility is convenience; backend authorization is the control. Every sensitive record must be protected by identity, role, scope, state and auditable business rules.
