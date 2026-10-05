# Property Development Management Platform — MVP Roadmap

**Version:** 1.0  
**Status:** Delivery Plan  
**Pilot:** Project 001 — 5 residential houses  
**Languages:** Thai + English from Foundation

## 1. MVP Objective

The MVP is not a demo. It must become the operating platform for Project 001 while preserving a foundation that can scale to future projects.

The first release does not need every long-term feature. It must reliably run the critical connected chains:

- Project → Plot → Unit
- Lead → Viewing → Booking → Contract → Payment
- Master Design → Plot Design → Revision → Approval → Release
- Schedule → Work → Progress → Verification
- Customer Request → VO → Approval → Execution
- Customer Portal → Progress / Design / Payments / Documents
- Partner Assignment → Drawing / Work / Progress / RFI
- Evidence → Timeline → Audit

## 2. Delivery Principles

1. Build vertical workflows, not isolated screens.
2. Security/RLS begins with the first tables.
3. Thai/English begins with the first UI.
4. Every important state transition creates traceable history.
5. Project 001 is the validation environment.
6. Avoid premature advanced ERP complexity.
7. Production data must be migratable and backed up.
8. Each release must be usable before starting unnecessary expansion.

---

# RELEASE 0 — FOUNDATION

## Goal
Create a production-grade application skeleton and secure multi-project foundation.

## Deliverables
- Application repository structure
- Environments: local / preview / production
- Authentication
- Organization
- Profile
- Membership
- Roles / permissions / scopes
- Project
- Phase
- Plot
- Unit
- House Type
- Thai / English localization framework
- Locale switch
- Base design system
- Navigation shell
- Document storage foundation
- Audit foundation
- Error/logging foundation
- Database migrations
- Seed/dev data

## Key Screens
- Login
- Developer shell
- Project list
- Project setup
- Units list
- Basic Unit 360°
- User/profile/language
- Admin membership/roles

## Acceptance Criteria
- User can authenticate securely.
- Authorized user can create/open Project 001.
- Five units can be created.
- User can switch TH/EN without changing business data.
- Unauthorized project access is blocked server/database side.
- Role/scope changes are auditable.
- Application deploys reproducibly.

---

# RELEASE 1 — SALES, CRM & UNIT INVENTORY

## Goal
Operate the real sales pipeline and control unit availability.

## Deliverables
- Campaign/source basics
- Lead
- Lead activity
- Sales assignment
- CRM pipeline
- Viewing
- Unit inventory
- Price
- Hold
- Reservation/Booking
- Customer creation
- CustomerProperty relationship
- Customer 360° initial
- Sales timeline
- Discount approval request foundation

## Core Flow
Lead → Contact → Qualified → Viewing → Negotiation → Hold → Booking.

## Key Screens
- Sales dashboard
- Lead list
- CRM Kanban
- Lead detail
- Viewing
- Inventory
- Unit detail
- Booking
- Customer 360°

## Acceptance Criteria
- Sales can see current unit availability.
- Conflicting active bookings are prevented.
- Booking creates traceable customer-unit relationship.
- Lead source remains traceable through booking.
- Sales cannot mark payment officially paid.
- Unauthorized users cannot access restricted customer data.

---

# RELEASE 2 — CONTRACT, PAYMENT & CUSTOMER PORTAL CORE

## Goal
Move a booked customer into a controlled contract/payment relationship and give them a usable portal.

## Deliverables
- Contract records
- Immutable contract versions
- Payment schedule
- Payment evidence upload
- Finance verification
- Receipt/document record
- Customer login/account linking
- Customer My Home
- Customer payments
- Customer documents
- Customer notifications foundation
- Bilingual customer UI
- Thai/English/bilingual document-template foundation

## Core Flow
Booking → Contract → Payment Schedule → Evidence → Finance Verification → Receipt.

## Acceptance Criteria
- Customer sees only their own linked property.
- Contract version cannot be silently overwritten after acceptance.
- Customer can upload payment evidence.
- Evidence submission does not automatically become PAID.
- Authorized Finance verifies payment.
- Customer sees verified status and receipt.
- Portal works well on mobile.
- Customer can switch Thai/English.

---

# RELEASE 3 — DESIGN CONTROL & CUSTOMER APPROVAL

## Goal
Control drawings/design versions and customer selections before site release.

## Deliverables
- Master House Type design package
- Plot-specific design package
- Disciplines
- Drawing register
- Drawing revisions
- Review / approval
- Released/AFC status
- Specifications
- Material library basics
- Material selections
- Customer design view
- Customer design/material approval
- Revision-linked customer approval
- Design timeline

## Core Flow
Master Design → Plot Design → Revision → Review → Approval → Release.

Customer flow:
Published Design → Customer Review → Approve / Request Change.

## Acceptance Criteria
- Current released drawing is unambiguous.
- Released revision cannot be overwritten.
- New change creates a new revision.
- Customer sees only customer-safe/released versions.
- Customer approval references exact revision/selection.
- Contractor cannot see internal drafts.

---

# RELEASE 4 — CONSTRUCTION OPERATIONS

## Goal
Run basic construction execution and verified progress for the five houses.

## Deliverables
- WBS
- Unit schedule
- Tasks
- Site reports
- Site photos
- Partner assignment
- Contractor basic portal
- Released drawing access
- Progress submission
- Progress verification
- RFI
- Site Instruction
- Inspection basics
- Defect basics
- Customer-safe published progress

## Core Flow
Schedule → Assigned Work → Site Execution → Reported Progress → Verification → Published Progress.

## Acceptance Criteria
- Contractor sees only assigned work.
- Contractor sees current released drawings.
- Contractor-reported progress is distinguishable from verified progress.
- Site/Engineer can verify progress.
- Customer sees only published/verified progress.
- RFI and response remain traceable.
- Mobile photo/progress workflow is practical on site.

---

# RELEASE 5 — CHANGE / VARIATION CONTROL

## Goal
Stop customer/site changes from becoming uncontrolled chat instructions.

## Deliverables
- Customer Request
- Internal Change Request
- VO
- Cost impact
- Selling-price impact
- Time impact
- Approval workflow
- Customer VO approval
- Payment condition
- Drawing revision link
- Contractor variation relationship
- Change timeline

## Core Flow
Request → Scope → Cost/Time → Internal Approval → Customer Approval → Payment Condition → Revision → Release → Execute → Close.

## Acceptance Criteria
- No approved change loses original scope/history.
- Customer price and contractor cost can differ and are stored separately.
- VO approval references exact price/scope/revision.
- Site can identify whether a change is released for execution.
- Changes update relevant cost/time views.

---

# RELEASE 6 — BOQ, COST & PROCUREMENT CORE

## Goal
Give management real budget/commitment/forecast visibility and basic purchasing control.

## Deliverables
- Cost codes
- Estimate
- BOQ
- Budget baseline
- Budget vs committed vs actual vs forecast
- Purchase Request
- RFQ
- Supplier
- Supplier quotation/comparison
- Purchase Order
- Delivery
- Contractor contract basics
- Progress claim basics
- Approval thresholds

## Core Procurement Flow
Requirement → PR → RFQ → Comparison → Approval → PO → Delivery → Inspection.

## Acceptance Criteria
- Approved budget baseline is versioned.
- Management can see cost variance by project/unit/cost code.
- Procurement approval follows authority rules.
- PO creates traceable commitment.
- Supplier quotation data is commercially restricted.
- Customer/contractor cannot access internal margin data.

---

# RELEASE 7 — QA/QC, HANDOVER & WARRANTY

## Goal
Complete the property lifecycle through customer acceptance and after-sales.

## Deliverables
- Inspection checklists
- Defects
- Rectification
- Reinspection
- Practical completion gate
- Customer inspection
- Handover checklist
- Handover documents
- Transfer status
- Warranty definitions
- Customer service requests
- Partner warranty assignment
- Homeowner-mode customer portal

## Core Flow
Inspection → Defect → Rectification → Reinspection → Customer Inspection → Acceptance → Transfer → Handover → Warranty.

## Acceptance Criteria
- Critical defects can block handover.
- Customer can track permitted inspection items.
- Handover evidence is retained.
- Transfer/handover changes portal experience to homeowner mode.
- Warranty request can be assigned and tracked to closure.

---

# RELEASE 8 — MANAGEMENT CONTROL CENTER

## Goal
Turn operational data into decision support for the owner/management.

## Deliverables
- Portfolio dashboard
- Project dashboard
- Unit 360° complete
- Sales funnel
- Cash collection
- Budget/forecast
- Construction health
- Schedule risk
- Procurement risk
- Outstanding customer payments
- Pending approvals
- Critical issues
- Timeline/event drill-down
- Reporting exports where authorized

## Acceptance Criteria
- Every important KPI drills to source records.
- Management can see all five houses on one screen.
- Forecast/actual distinction is clear.
- Sales, construction and cash status are not manually duplicated.
- Restricted finance remains permission-controlled.

---

# RELEASE 9 — AUTOMATION & INTEGRATIONS

## Goal
Reduce manual follow-up after core workflows are stable.

Potential deliverables:
- LINE OA
- Email notifications
- SMS/push where justified
- E-signature
- Payment gateway
- Accounting integration
- Calendar
- Automated reminders/escalations
- Scheduled reports

Only integrate vendors after business workflows are proven.

---

# RELEASE 10 — AI LAYER

## Goal
Use verified project data to accelerate design, analysis and management.

### AI Assistant
Examples:
- Which units are delayed?
- What needs approval today?
- Which payments are due?
- Which materials are at risk?
- Why is cost forecast above budget?
- Summarize Project 001.

### AI Design Studio
- 3D/floor plan input
- Geometry-aware rendering
- Materials/styles
- Furniture/lighting/landscape
- Customer visualization
- Marketing renders

### Future AI
- Document extraction
- BOQ assistance
- Site photo progress analysis
- Risk detection
- Customer-service assistance

AI never bypasses authorization and should cite/link internal source records where practical.

---

## 3. Suggested Build Waves

### Wave A — Get the Business Online
Release 0 + 1 + 2.

Outcome:
Project setup, units, CRM, booking, contract, payments and Customer Portal core.

### Wave B — Control What Gets Built
Release 3 + 4 + 5.

Outcome:
Design/revisions, construction, partner work, progress and variations.

### Wave C — Control Cost & Delivery
Release 6 + 7 + 8.

Outcome:
BOQ/procurement, QA/handover/warranty and management control center.

### Wave D — Scale & Automate
Release 9 + 10.

Outcome:
Integrations, automation and AI.

---

## 4. First Go-Live Definition

A practical first go-live can occur after Wave A if the system can safely manage real customers.

Minimum:
- Project 001 and five units
- Team authentication/permissions
- Lead/CRM
- Booking
- Customer
- Contract
- Payment schedule
- Payment evidence/verification
- Customer Portal
- Documents
- Timeline/Audit
- Thai/English

Construction/design can then enter controlled production in Wave B.

---

## 5. Project 001 Migration Strategy

If operational work starts before all releases are ready:

1. Define canonical import templates.
2. Keep Unit codes/customer IDs consistent.
3. Store important files using agreed naming conventions.
4. Avoid uncontrolled duplicate spreadsheets.
5. Import/migrate into the platform release-by-release.
6. Reconcile financial and contractual data before marking it authoritative.

The system must not fabricate historical approvals that never occurred; imported legacy records should be identified as imported.

---

## 6. Quality Gates Per Release

Every release requires:
- Functional acceptance
- Authorization/RLS tests
- Thai/English checks
- Mobile/responsive checks where relevant
- Audit/history validation
- Error handling
- Migration test
- Backup/recovery awareness
- Basic performance check
- User acceptance with real Project 001 scenarios

---

## 7. Definition of Done for a Feature

A feature is not done because a screen exists.

Done means:
- Data model exists.
- Permission rules exist.
- Workflow/state transitions are defined.
- UI works.
- Validation exists.
- Audit/timeline behavior exists where required.
- Thai/English labels/content work.
- Error/empty/loading states work.
- Mobile works when relevant.
- Tests cover critical logic.
- Source evidence/documents connect correctly.
- Acceptance scenario passes.

---

## 8. Development Priorities

Priority order when tradeoffs occur:

1. Data correctness
2. Authorization/security
3. Traceability
4. Core workflow completion
5. Usability
6. Reporting
7. Automation
8. Advanced AI/visual polish

Do not sacrifice financial/contractual correctness for dashboard appearance.

---

## 9. What Not to Build Too Early

Avoid early over-investment in:
- Full accounting ledger
- Complex warehouse ERP
- BIM authoring platform
- Generic no-code workflow builder
- Highly configurable report designer
- AI before clean source data
- Large integration marketplace
- Native mobile apps before responsive/PWA proves insufficient

These can be added when Project 001 demonstrates actual need.

---

## 10. Immediate Next Step

Create **TECHNICAL-ARCHITECTURE.md** and lock:
- Application framework
- PostgreSQL/Supabase architecture
- Authentication
- RLS strategy
- Storage
- Internationalization
- Deployment
- Background jobs
- Notifications
- Observability
- Testing
- Security
- Environments
- Repository structure

After Technical Architecture is approved:
1. Scaffold application.
2. Create initial migrations.
3. Implement Release 0.
4. Seed Project 001.
5. Begin real workflow validation.

---

**MVP principle:** build the smallest sequence of complete, secure business workflows that can operate Project 001 for real, then expand from verified operational use.
