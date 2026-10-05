# Property Development Management Platform — UX Information Architecture

**Version:** 1.0  
**Status:** Product UX Structure  
**Languages:** Thai / English  
**Depends on:** MASTER-BRIEF.md, SYSTEM-BLUEPRINT.md, BUSINESS-PROCESS-MAP.md, ROLE-PERMISSION-MATRIX.md, DATA-MODEL.md

## 1. UX Goal

The platform must feel like one operating system, not a collection of disconnected modules.

Primary interaction model:

```
BIG PICTURE
→ PROJECT
→ UNIT / PROPERTY 360°
→ DOMAIN DETAIL
→ SOURCE RECORD / EVIDENCE
```

Every role should quickly answer:
1. What is happening?
2. What requires my attention?
3. What should I do next?
4. What evidence supports the status?

---

## 2. Product Surfaces

### Developer Operations
Desktop-first, responsive. Used for project, commercial, design, construction, sales, customer, finance and management work.

### Customer Portal — My Home / บ้านของฉัน
Mobile-first. Simple, private and action-oriented.

### Partner Portal — My Work / งานของฉัน
Mobile/site-first. Optimized for tasks, drawings, RFIs, progress, photos, inspections, defects, claims and deliveries.

### External / Guest
Focused views reached through explicitly granted resources, not a full general-purpose portal.

---

## 3. Global Application Shell

Authenticated layout:

```
┌─────────────────────────────────────────────────────┐
│ Logo | Project Selector | Search | TH/EN | 🔔 | User│
├──────────────┬──────────────────────────────────────┤
│ Navigation   │ Main Content                         │
│              │                                      │
│              │                                      │
└──────────────┴──────────────────────────────────────┘
```

Global capabilities:
- Organization / project context
- Global search
- Pending Actions
- Notifications
- TH / EN switch
- User profile
- Help
- Role/scope-aware navigation

The UI hides unavailable functions for clarity, but backend authorization remains authoritative.

---

## 4. Language Experience

Language switch is always accessible in the authenticated shell.

```
ไทย | EN
```

Changing language affects:
- Navigation
- Buttons
- Status labels
- Help text
- Notifications
- Customer-facing localized content
- Date/number/currency presentation
- Available document/template language

It does not change:
- Record IDs
- Business status codes
- Original user-generated messages
- Historical signed/generated documents

Where both business-content translations exist, show selected locale. If missing, use defined fallback and optionally indicate source language internally.

---

## 5. Developer Operations — Main Navigation

Recommended top-level navigation:

```
Dashboard / ภาพรวม
Projects / โครงการ
Development / พัฒนาโครงการ
Design / ออกแบบ
Construction / ก่อสร้าง
Cost & Procurement / ต้นทุนและจัดซื้อ
Marketing & Sales / การตลาดและการขาย
Customers / ลูกค้า
Finance / การเงิน
Documents / เอกสาร
Reports / รายงาน
Admin / ตั้งค่าระบบ
```

Cross-cutting functions such as Workflow, Approvals and Notifications appear contextually and in Pending Actions rather than becoming oversized departmental menus.

---

## 6. Developer Dashboard

### Owner / Management Home
Primary cards:
- Active Projects
- Total Units
- Available / Reserved / Contracted / Transferred
- Project Value
- Contracted Revenue
- Cash Received
- Budget
- Committed Cost
- Actual Cost
- Forecast Cost
- Forecast Margin
- Overall Construction Progress
- Pending Decisions
- Critical Issues

Sections:
- Project Portfolio
- Sales Funnel
- Cash Flow
- Construction Health
- Cost Variance
- Upcoming Payments
- Procurement Risks
- Approval Bottlenecks
- Critical Timeline Events

Every card should drill down to source data.

### Role-Based Home
PM sees schedule/issues/approvals.
Design sees reviews/RFIs/revisions.
Site sees today's work/inspections/defects.
QS sees budget/VO/claims.
Sales sees leads/viewings/bookings.
Finance sees receivables/verifications/payables.
Customer Service sees customer actions/handover/warranty.

---

## 7. Project Selector & Project Home

User can switch between authorized projects.

Project Home:

```
Project 001
├─ Overview
├─ Units
├─ Schedule
├─ Design
├─ Construction
├─ Cost
├─ Procurement
├─ Sales
├─ Customers
├─ Finance
├─ Documents
├─ Issues / Risks
└─ Timeline
```

Header shows:
- Project status
- Unit count
- Sales status
- Construction %
- Budget / Forecast
- Target completion
- Critical issues

---

## 8. Unit 360° — Core Screen

Unit 360° is one of the most important screens.

Example:

```
PLOT 03 / UNIT 03
House Type A
Commercial: CONTRACTED
Construction: 42%
Customer: [Customer]
Target Completion: [Date]

Overview | Design | Construction | Cost | Procurement
Customer | Contract | Payments | Changes | Documents
Inspection | Handover | Warranty | Timeline
```

### Overview
- Unit identity
- Plot/land information
- House type
- Selling status
- Customer
- Contract status
- Payment status
- Construction progress
- Next milestone
- Open issues
- Pending approvals

### Design
Current released drawing set, revisions, materials, customer approvals.

### Construction
Schedule, progress, site reports, photos, RFIs, inspections, defects.

### Cost
Budget, committed, actual, forecast, variations — permission controlled.

### Customer
Customer profile and interaction summary.

### Contract / Payments
Commercial documents and receivables.

### Changes
Customer VO, contractor VO and internal change impact.

### Timeline
Chronological source-linked history across all domains.

---

## 9. Units / Inventory View

Two primary modes:

### Inventory Table
Columns:
Unit, Plot, House Type, Land Area, Price, Commercial Status, Customer, Construction %, Contract, Payment, Completion.

Filters:
Available, Hold, Reserved, Contracted, Transferred, House Type, Phase, construction stage.

### Visual Master Plan
Future/optional interactive project plan where units are selectable and status-coded.

Clicking a unit opens Unit 360°.

---

## 10. Development UX

```
Development
├─ Land
├─ Feasibility
├─ Master Plan
├─ Phases
├─ Plots / Units
├─ House Types
├─ Permits
├─ Infrastructure
└─ Milestones
```

Feasibility view supports version comparison and approval history.

Permit view highlights:
- Submitted
- Pending
- Approved
- Expiring
- Missing requirement

---

## 11. Design UX

```
Design
├─ Design Packages
├─ House Types
├─ Drawings
├─ Specifications
├─ Materials
├─ Rooms / Zones
├─ Customer Selections
├─ Reviews / Approvals
└─ AI Design Studio [future]
```

### Drawing Register
Columns:
Drawing No., Title, Discipline, Current Revision, Status, Unit/House Type, Updated, Approval.

Drawing detail:
- Preview/file
- Revision history
- Comments
- Approval
- Related RFI
- Related VO
- Units using revision
- Release status

AFC/released revision must be visually unmistakable.

---

## 12. Construction UX

```
Construction
├─ Project Schedule
├─ Unit Progress
├─ Tasks
├─ Daily Reports
├─ Site Photos
├─ RFIs
├─ Site Instructions
├─ Inspections
├─ Defects
├─ Contractors
└─ Handover Readiness
```

### Site Today
Mobile-friendly operational page:
- Today's tasks
- Work by unit
- Inspection requests
- Open defects
- RFIs due
- Material deliveries
- Quick photo upload
- Daily report

---

## 13. Cost & Procurement UX

```
Cost & Procurement
├─ Budget
├─ BOQ
├─ Cost Report
├─ Variations
├─ Purchase Requests
├─ RFQs
├─ Supplier Comparison
├─ Purchase Orders
├─ Deliveries
├─ Contractors
├─ Progress Claims
└─ Suppliers
```

### Cost Dashboard
Project → Unit → Cost Code drill-down.

Show:
Budget | Committed | Actual | Forecast | Variance.

Commercially sensitive data is hidden from unauthorized roles.

---

## 14. Marketing & Sales UX

```
Marketing & Sales
├─ Marketing Dashboard
├─ Campaigns
├─ Leads
├─ CRM Pipeline
├─ Viewings
├─ Inventory
├─ Pricing
├─ Offers
├─ Reservations
├─ Bookings
└─ Agents / Brokers
```

### CRM Pipeline
Kanban:
New → Contacted → Qualified → Viewing → Negotiation → Booking → Won.

Lead detail includes:
- Contact
- Source/campaign
- Requirements
- Units interested
- Activity timeline
- Next action
- Viewing
- Offer
- Booking

---

## 15. Customer Management UX

```
Customers
├─ Customer List
├─ Customer 360°
├─ Bookings
├─ Contracts
├─ Payments
├─ Design Approvals
├─ Requests / VO
├─ Inspections
├─ Handover
└─ Warranty / Service
```

### Customer 360°
Header:
Customer, preferred language, linked units, stage, next action.

Tabs:
Overview, Properties, Communication, Contracts, Payments, Requests, Documents, Timeline.

Sensitive KYC appears only to authorized roles.

---

## 16. Finance UX

```
Finance
├─ Overview
├─ Receivables
├─ Payment Verification
├─ Receipts
├─ Payables
├─ Cash Flow
├─ Project Finance
├─ Forecast
└─ Profitability
```

### Payment Verification Queue
Shows submitted customer evidence requiring Finance action.

Evidence → Schedule → Contract → Customer → Verify/Reject.

Verification requires explicit action and creates audit event.

---

## 17. Documents UX

Global Document Vault:

Filters:
Project, Unit, Customer, Partner, Type, Discipline, Status, Language, Revision, Date.

Document detail:
- Current version
- Version history
- Classification
- Visibility
- Related records
- Approval/release status
- Audit trail

Users normally access documents contextually; Document Vault provides global discovery.

---

## 18. Pending Actions — Core Productivity Feature

A universal inbox:

```
Pending Actions
├─ My Approvals
├─ My Tasks
├─ Waiting for Others
├─ Due Soon
├─ Overdue
└─ Recently Completed
```

Examples:
- Approve Drawing Rev 04
- Verify Payment
- Review VO-003
- Respond RFI-018
- Inspect Foundation Plot 03
- Approve PO-021
- Follow up Lead
- Prepare Handover

This prevents workflows from being buried inside modules.

---

## 19. Notifications Center

Notifications are informational; Pending Actions are actionable.

Notification categories:
- Approval
- Payment
- Construction
- Customer
- Procurement
- Sales
- Document
- System

Users can open the related source record directly.

---

## 20. Global Search

Search box supports authorized results across:
- Project
- Unit/Plot
- Customer
- Partner
- Drawing
- Contract
- Booking
- PO
- VO
- RFI
- Defect
- Document

Results grouped by entity type.

Thai and English search are both required.

---

## 21. Customer Portal — Main Navigation

Mobile-first navigation:

```
Home / หน้าหลัก
Progress / ความคืบหน้า
Design / แบบและวัสดุ
Payments / การชำระเงิน
Documents / เอกสาร
Requests / คำขอ
More / เพิ่มเติม
```

More:
Inspection/Handover, Warranty/Service, Profile, Language, Help.

---

## 22. Customer Home — My Home

Customer should immediately see:

```
My Home / บ้านของฉัน

Plot 03 — House Type A
Status: Under Construction
Overall Progress: 42%

Next milestone:
Structure completion

Your next action:
Approve Bathroom Tile Selection

Next payment:
THB xxx,xxx — Due [date]
```

Below:
- Latest progress/photos
- Milestones
- Pending approvals
- Upcoming payment
- Recent documents
- Recent messages/updates

Avoid exposing complex internal project terminology.

---

## 23. Customer Progress

Two levels:

### Project Progress
Infrastructure/common project milestones that are appropriate to publish.

### My House Progress
Foundation, Structure, Roof, MEP, Finishes, Interior, Pool, Landscape, Inspection, Handover.

Only verified/published progress is shown.

Each milestone can contain:
- Status
- Completion date
- Photos
- Customer-safe note

---

## 24. Customer Design

```
Design
├─ Floor Plan
├─ Interior
├─ Materials
├─ Selections
├─ Renders
└─ Approvals
```

Customer sees only released/customer-review versions.

Approval screen clearly shows:
- What is being approved
- Revision/version
- Images/documents
- Price/time impact if applicable
- Approve / Request Change

---

## 25. Customer Payments

```
Purchase Price
Paid
Outstanding

Payment Schedule
1. Booking — Paid
2. Contract — Paid
3. Installment — Due [date]
4. Final — Upcoming
```

Payment detail:
Amount, due date, status, upload evidence, verification status, receipt.

Do not label evidence submission as Paid before Finance verification.

---

## 26. Customer Requests

Customer can create:
- Design change
- General question
- Appointment
- Document request
- Construction/customer service request
- Warranty/service request depending on lifecycle stage.

Request detail shows:
Submitted → Reviewing → Waiting for Customer → Approved → In Progress → Completed.

Important internal workflow remains hidden.

---

## 27. Customer Inspection & Handover

Customer can:
- View appointment
- View inspection checklist/items
- Add permitted observations/photos
- Track correction status
- Confirm reinspection/acceptance
- Access handover documents

After handover, Home changes emphasis from construction to ownership/service.

---

## 28. Customer Homeowner Mode

Post-handover navigation emphasizes:

```
My Home
Documents
Warranty
Service Requests
Equipment / Manuals
Service History
```

The same account and property history continue.

---

## 29. Partner Portal — Main Navigation

Mobile/site-first:

```
My Work / งานของฉัน
Tasks / งาน
Drawings / แบบ
RFI
Progress / ความคืบหน้า
Inspections / ตรวจงาน
Defects / แก้ไขงาน
Claims / เบิกงวด
Documents / เอกสาร
```

Navigation adapts to partner type. Supplier may see Orders/Deliveries instead of construction functions.

---

## 30. Partner Home — My Work

Shows:
- Assigned project/work packages
- Today's/next tasks
- Latest released drawings
- RFIs awaiting response
- Inspection requests
- Open defects
- Deliveries
- Claim/VO status

No unrelated project/customer/commercial data.

---

## 31. Partner Drawing Experience

Partner sees only drawings released for their authorized scope.

Drawing card prominently displays:
- Drawing number
- Revision
- RELEASED / AFC state
- Release date
- Superseded warning if outdated

If an old saved link opens a superseded revision, UI must warn and link to current revision.

---

## 32. Partner Progress Update

Mobile flow:

```
Select Project
→ Unit / Work Package
→ Activity
→ Enter progress
→ Add photos
→ Add note
→ Submit
```

Submitted progress is Reported, not Verified.

Site/Engineer verifies separately.

---

## 33. Partner RFI

Fast site flow:
Select drawing/work → question → photo/markup → due need → submit.

RFI detail shows response and any resulting revised drawing/instruction.

---

## 34. Partner Defect Workflow

Partner sees assigned defects:
Open → Rectification → Request Reinspection → Closed.

Upload before/after photos.

Partner cannot self-close a defect requiring developer inspection.

---

## 35. Responsive Strategy

### Desktop
Optimized for management, design registers, BOQ/cost, CRM and reporting.

### Tablet
Useful for meetings, inspections and design/customer review.

### Mobile
Optimized for:
- Customer portal
- Site updates
- Photos
- Inspections
- Defects
- RFI
- Approvals
- Sales follow-up
- Notifications

Avoid forcing desktop tables onto mobile; use cards/task flows.

---

## 36. UX Status Language

Every status has:
- Machine code
- Thai label
- English label
- Optional icon/badge treatment

Do not rely on color alone to communicate status.

Examples:
AVAILABLE = ว่าง / Available.
CONTRACTED = ทำสัญญาแล้ว / Contracted.
AWAITING_APPROVAL = รออนุมัติ / Awaiting Approval.
OVERDUE = เกินกำหนด / Overdue.

---

## 37. Breadcrumb / Context Pattern

Desktop example:

```
Projects > Project 001 > Unit 03 > Design > Drawing A-101 > Rev 04
```

Always preserve context so users know which project/unit/customer they are changing.

---

## 38. Create/Edit Pattern

Complex records use:
Draft → Validate → Submit → Approve/Reject → Release.

Autosave may be used for drafts, but approval/release is explicit.

Destructive or irreversible actions require confirmation and appropriate authority.

---

## 39. Evidence Pattern

Important record screens show an Evidence/History area:
- Attachments
- Photos
- Comments
- Approvals
- Related documents
- Timeline
- Audit where authorized

This reduces reliance on external chats and personal memory.

---

## 40. Empty / Error / Permission States

UX must explicitly support:
- No data yet
- No assigned project
- Waiting for approval
- Permission denied
- Superseded document
- Expired guest access
- Offline/upload retry for future site resilience
- Missing translation fallback

Never expose sensitive record existence through overly detailed permission errors.

---

## 41. MVP Screen Set

### Developer
Login, Dashboard, Projects, Project Home, Units, Unit 360°, Leads/CRM, Customer 360°, Booking, Contract, Payment Verification, Design/Drawings, Construction Progress, Site Photos, Customer Requests/VO, Documents, Pending Actions, Notifications, Admin Users/Roles.

### Customer
Login/OTP later, My Home, Progress, Design/Approval, Payments/Evidence, Documents, Requests, Inspection/Handover, Warranty/Service, Notifications/Profile/Language.

### Partner
Login, My Work, Assignments, Tasks, Drawings, Progress Upload, RFI, Inspection/Defects, Documents, Notifications/Profile/Language.

---

## 42. Recommended Initial Route Structure

Conceptual web routes:

```
/[locale]/app
/[locale]/app/projects
/[locale]/app/projects/[projectId]
/[locale]/app/units/[unitId]
/[locale]/app/customers/[customerId]
/[locale]/app/leads/[leadId]
/[locale]/app/drawings/[drawingId]
/[locale]/app/actions
/[locale]/app/documents

/[locale]/customer
/[locale]/customer/home
/[locale]/customer/progress
/[locale]/customer/design
/[locale]/customer/payments
/[locale]/customer/documents
/[locale]/customer/requests

/[locale]/partner
/[locale]/partner/work
/[locale]/partner/tasks
/[locale]/partner/drawings
/[locale]/partner/progress
/[locale]/partner/rfi
/[locale]/partner/defects
```

Final route architecture depends on technical framework choice.

---

## 43. Design System Direction

Before detailed UI mockups, define:
- Typography supporting Thai + Latin well
- Spacing scale
- Form controls
- Tables
- Cards
- Status badges
- Timeline
- File preview
- Approval panel
- KPI cards
- Charts
- Mobile bottom navigation
- Desktop sidebar
- Modal/drawer rules
- Loading/skeleton states
- Accessibility baseline

The visual direction should feel professional, architectural, clean and information-dense without looking like generic accounting software.

---

## 44. UX Acceptance Principles

1. User knows current project/unit context.
2. User sees their next required action.
3. Management can reach source evidence from a KPI.
4. Customer sees only verified, understandable information.
5. Partner sees only assigned/released information.
6. Current drawing revision is obvious.
7. Payment evidence is distinct from verified payment.
8. Thai/English switching does not change business state.
9. Mobile site tasks require minimal steps.
10. Every important approval clearly identifies what version/value is being approved.

---

## 45. Next Artifact

Next: **MVP-ROADMAP.md**

It should convert the architecture into buildable releases:
- Foundation
- Developer Operations core
- Customer Portal
- Partner Portal
- Workflow/Audit
- Project 001 go-live
- Expansion

Each release should define deliverables, dependencies and acceptance criteria.

After MVP Roadmap: **TECHNICAL-ARCHITECTURE.md**, then repository/application scaffolding and production database migrations.

---

**UX principle:** show the right truth, to the right person, at the right level of detail, with the next action always clear.
