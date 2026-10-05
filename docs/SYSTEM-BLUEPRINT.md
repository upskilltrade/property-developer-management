# Property Development Management Platform — System Blueprint

**Version:** 1.0  
**Status:** Draft for Review  
**Depends on:** docs/MASTER-BRIEF.md  
**Pilot:** Project 001 — 5 residential houses

## 1. Product Architecture

The product is one platform with one controlled data model and three primary user experiences:

```
                         PROPERTY PLATFORM
                                |
                    CENTRAL DATA + WORKFLOW
                                |
              +-----------------+-----------------+
              |                 |                 |
      DEVELOPER OPERATIONS  CUSTOMER PORTAL   PARTNER PORTAL
              |                 |                 |
        Run the business       My Home          My Work
```

A limited External / Guest access model supports brokers, lawyers, banks, consultants, inspectors and other temporary participants.

## 2. System-of-Record Hierarchy

Primary ownership hierarchy:

```
Organization
  └─ Project
      └─ Phase
          └─ Plot / Unit
              └─ House / Property
                  └─ Customer Relationship
```

Supporting records such as drawings, tasks, costs, contracts, payments, inspections and documents must attach to an appropriate level in this hierarchy.

## 3. Developer Operations Domains

### Development
Owns project definition, land, legal/permit records, master plan, phases, plots, house types, infrastructure and development milestones.

### Design
Owns design disciplines, master house definitions, plot-specific design, materials, specifications, drawings, revisions and design approvals.

### Project & Construction
Owns WBS, schedules, site execution, progress, RFIs, instructions, inspections, defects and handover readiness.

### Cost & Procurement
Owns estimates, BOQ, budgets, commitments, procurement, suppliers, POs, deliveries, contractor claims and construction-related variations.

### Marketing & Sales
Owns campaigns, leads, CRM activity, viewing, pricing, quotation, reservation and booking conversion.

### Customer & Contract
Owns customer identity, buyer relationships, booking, contracts, customer approvals, payment schedule visibility, customer requests, transfer, warranty and after-sales.

### Finance & Management
Owns financial consolidation, cash flow, receivables/payables views, project profitability, forecasts and executive reporting.

## 4. Shared Platform Services

These capabilities are cross-domain and must not be duplicated inside individual modules:

- Identity & Authentication
- Role / Permission / Scope authorization
- Workflow Engine
- Approval Engine
- Notification Engine
- Document Vault
- Revision Control
- Audit Trail
- Event Timeline
- Search
- Reporting / KPI layer
- Integration layer
- AI / Data access layer

## 5. Access Model

Authorization is evaluated using:

```
User
+ Organization Membership
+ Role
+ Project Scope
+ Unit / Customer / Partner Scope
+ Permission
= Effective Access
```

Examples:
- Owner: all authorized company projects and management data.
- Site Manager: assigned projects and operational construction data.
- Sales: CRM/sales data but not confidential contractor costs unless explicitly granted.
- Customer: only customer-safe data linked to their own property relationship.
- Contractor: only assigned scope/projects/work packages.
- Supplier: only relevant procurement/delivery records.
- Guest: explicit limited records for a defined period or purpose.

## 6. Core Business Objects

Initial conceptual entities:

### Organization & Project
Organization, Project, Phase, Plot, Unit, HouseType, PropertyStatus, ProjectMilestone.

### People & Access
User, Membership, Role, Permission, Team, Customer, CustomerProperty, PartnerOrganization, PartnerContact, Assignment.

### Design
DesignPackage, Discipline, RoomZone, Drawing, DrawingRevision, Specification, Material, MaterialSelection, DesignApproval.

### Construction
WorkBreakdownItem, ScheduleActivity, Task, SiteReport, ProgressUpdate, SitePhoto, RFI, SiteInstruction, Inspection, Defect, HandoverItem.

### Commercial / Cost
Estimate, BOQ, BOQItem, Budget, CostCommitment, Supplier, RFQ, Quotation, PurchaseRequest, PurchaseOrder, Delivery, ContractorContract, ProgressClaim, Retention, VariationOrder.

### Marketing / Sales
Campaign, Lead, LeadActivity, Viewing, PriceList, Promotion, QuotationOffer, Reservation, Booking.

### Customer / Contract / Finance
Contract, ContractRevision, PaymentSchedule, Payment, PaymentEvidence, Receipt, CustomerRequest, CustomerApproval, Transfer, Warranty, ServiceRequest.

### Platform
Document, DocumentVersion, Comment, Notification, WorkflowInstance, WorkflowStep, Approval, AuditEvent, TimelineEvent.

These are conceptual objects only; final database tables will be designed after workflow validation.

## 7. Unit as the Operational Hub

The Plot / Unit is a critical aggregation point.

A unit should expose one operational view containing:
- Property identity and status
- House type
- Customer / buyer
- Current design revision
- Construction progress
- Budget / forecast / actual
- Procurement status
- Booking / contract
- Payment status
- Open customer requests
- Open variations
- Open defects
- Documents
- Timeline

This becomes the primary drill-down destination from management dashboards.

## 8. State Machines

Statuses must be controlled, not free text.

### Unit Commercial State
```
AVAILABLE
→ HOLD
→ RESERVED
→ CONTRACTED
→ SOLD
→ TRANSFERRED
```

Cancellation/release paths must return inventory according to controlled rules.

### Lead State
```
NEW
→ CONTACTED
→ QUALIFIED
→ VIEWING
→ NEGOTIATION
→ BOOKING
→ WON
```

Alternative terminal states: LOST / DISQUALIFIED.

### Drawing State
```
DRAFT
→ INTERNAL REVIEW
→ CLIENT REVIEW (when required)
→ APPROVED
→ RELEASED FOR CONSTRUCTION
→ SUPERSEDED
```

### Customer Request / Variation
```
SUBMITTED
→ UNDER REVIEW
→ COSTED
→ OFFERED
→ APPROVED / REJECTED
→ PAYMENT REQUIRED (optional)
→ RELEASED
→ IN PROGRESS
→ COMPLETED
→ CLOSED
```

### Construction Task
```
NOT STARTED
→ READY
→ IN PROGRESS
→ INSPECTION
→ COMPLETED
```

May enter BLOCKED or REWORK when required.

### Defect
```
OPEN
→ ASSIGNED
→ RECTIFICATION
→ REINSPECTION
→ CLOSED
```

### Payment
```
SCHEDULED
→ DUE
→ EVIDENCE SUBMITTED
→ VERIFYING
→ PAID
```

Alternative states: OVERDUE / REJECTED / WAIVED where policy permits.

## 9. Workflow Engine

Every workflow instance should know:
- Object / record it belongs to
- Current state
- Current responsible actor
- Required actions
- Due date
- Approval requirement
- Dependencies
- History
- Resulting events

Example:

```
Customer requests bathroom tile change
  ↓
CustomerRequest created
  ↓
Design review task
  ↓
QS cost impact
  ↓
Schedule impact
  ↓
Variation generated
  ↓
Developer approval
  ↓
Customer approval
  ↓
Payment condition checked
  ↓
Drawing revision
  ↓
Release to contractor
  ↓
Site execution
  ↓
Verification
  ↓
Customer-safe completion update
```

## 10. Event Timeline

Important business actions create immutable or append-only timeline events.

Example Unit timeline:

```
2026-10-01  Booking confirmed
2026-10-03  Booking payment verified
2026-10-08  Contract signed
2026-10-20  Interior package Rev 03 approved
2026-11-02  Foundation completed and inspected
2026-11-05  Customer variation VO-003 approved
```

Views can filter events by Design, Construction, Commercial, Customer, Finance and Documents.

## 11. Document Model

A document is not only a file.

Each controlled document should support metadata:
- Document type
- Project / Unit / Customer / Partner linkage
- Owner
- Version / revision
- Status
- Visibility
- Approval state
- Effective date
- Superseded reference
- File object
- Audit history

Customer/partner visibility must be explicitly controlled. Internal documents are private by default.

## 12. Data Publication Model

Internal operational data and portal data should not be assumed identical.

Recommended flow:

```
Raw / Internal Update
      ↓
Verification / Approval
      ↓
Published Business State
      ↓
Customer-safe / Partner-safe View
```

Example: a contractor claiming 80% progress does not automatically show 80% to the customer. A responsible developer role verifies the progress before it becomes official.

## 13. Notification Model

Notifications should be event-driven.

Examples:
- Drawing waiting for approval
- Payment approaching due date
- Payment overdue
- Customer submitted a change request
- VO awaiting customer approval
- Inspection requested
- Defect overdue
- PO awaiting approval
- Delivery due
- Task becoming critical
- Contract waiting for signature
- Warranty request created

Channels can later include in-app, email, LINE OA, SMS or push.

## 14. Management Information Architecture

Top level:

```
Portfolio
  ↓
Project
  ↓
Phase
  ↓
Unit
  ↓
Source Record
```

Executive views should aggregate:
- Inventory / sales
- Revenue / collections
- Budget / commitments / actual / forecast
- Construction progress
- Schedule risk
- Marketing conversion
- Customer pending actions
- Procurement risk
- Open defects
- Approval bottlenecks

Every KPI should drill down to the source records used to calculate it.

## 15. Customer Portal Information Architecture

```
My Home
├─ Overview
├─ Progress
├─ Design
├─ Payments
├─ Documents
├─ Requests
├─ Inspection / Handover
└─ Warranty / Service
```

Customer UX principles:
- Simple language
- Mobile-first
- Show current status and next action
- Never expose internal confidential data
- Make approvals explicit
- Preserve evidence of customer decisions
- Separate project-wide progress from private house progress

## 16. Partner Portal Information Architecture

```
My Work
├─ Assignments
├─ Drawings / Specifications
├─ Schedule / Tasks
├─ RFI / Instructions
├─ Progress / Photos
├─ Deliveries
├─ Inspection / Defects
├─ Variations / Claims
└─ Documents
```

Partner UX principles:
- Scope-limited
- Mobile/site friendly
- Latest approved information prominent
- Clear pending actions
- Fast photo/document upload
- Strong revision awareness

## 17. MVP Boundary for Project 001

### Must Have
- Authentication and roles
- Project / Plot / Unit setup
- Customer / CRM core
- Unit inventory and status
- Booking
- Contract/document records
- Payment schedule and evidence
- Document Vault
- Drawing revision / approval
- Construction milestones / progress / photos
- Customer Portal
- Partner assignments / basic progress
- Customer requests / basic VO
- Audit / timeline
- Basic management dashboard

### Next
- Full BOQ / cost control
- Procurement / PR / RFQ / PO
- Contractor claims / retention
- Advanced scheduling
- QA/QC / defect workflow
- Handover / warranty
- Marketing attribution
- Finance forecasting

### Later
- AI Design Studio
- BIM / deeper 3D integration
- AI document analysis
- AI site progress analysis
- Advanced automation
- Portfolio analytics
- External accounting/payment/e-sign integrations

## 18. Non-Functional Requirements

The implementation should be:
- Multi-project from day one
- Permission-first
- Audit-friendly
- Mobile-responsive
- Secure for customer PII/documents
- Version-aware
- Recoverable / backed up
- Designed for configurable workflows
- API/integration ready
- Capable of future multi-language support
- Observable through application/error logs

## 19. Architecture Decisions Still Open

Do not lock these until the next design stage:
- Final database schema
- Exact framework / deployment stack
- Auth provider
- Storage provider
- Queue / job architecture
- Search implementation
- Notification vendors
- Accounting integration
- E-signature provider
- Payment provider
- AI model/provider
- LINE integration details

## 20. Next Design Artifacts

The next documents should be produced in this order:

1. BUSINESS-PROCESS-MAP.md — one house, end-to-end.
2. ROLE-PERMISSION-MATRIX.md — who can see/do what.
3. DATA-MODEL.md — ERD and source-of-truth rules.
4. UX-INFORMATION-ARCHITECTURE.md — screens/navigation for all portals.
5. MVP-ROADMAP.md — delivery phases and acceptance criteria.
6. TECHNICAL-ARCHITECTURE.md — technology choices and deployment design.

---

**Architecture principle:** one platform, three primary portals, controlled workflows, one source of truth, full traceability.
