# Property Development Management Platform — Master Brief

**Version:** 1.0  
**Status:** Draft for Review  
**Pilot:** Project 001 — 5 residential houses  
**Repository:** upskilltrade/property-developer-management

## 1. Vision

Build a single operating platform for a property-development business, covering the complete lifecycle from land and project setup through design, construction, marketing, sales, booking, contracts, payments, handover, warranty, and after-sales.

The platform must start with the first real 5-house project and scale to future projects without rebuilding the system.

Core hierarchy:

```
Company → Project → Phase → Plot / Unit → House → Customer
```

Every important record should connect back to this hierarchy so management can move from a portfolio-level view down to an individual house, room, task, document, cost item, customer, or transaction.

## 2. Primary User Groups / Portals

### A. Developer Operations
Internal operating system for the developer. Roles may include:
- Owner / Management
- Project Manager
- Architect / Interior Designer
- Engineer
- Site Manager
- QS / Cost Control
- Procurement
- Finance / Accounting
- Marketing
- Sales
- Customer Service
- Administrator

Access is role- and permission-based.

### B. Customer Portal
Each customer receives a private account linked only to their own property. The portal follows the customer from booking through ownership and after-sales.

Customer-facing areas:
- My Home
- Project & House Progress
- Design / Material Approval
- Payment Schedule & Payment Evidence
- Contracts & Documents
- Requests / Change Requests
- Communication History
- Inspection & Handover
- Warranty / Service Requests

### C. Contractor / Partner Portal
For main contractors, subcontractors, suppliers, consultants, factories, inspectors and other delivery partners.

Partner-facing areas:
- Assigned Projects / Scope of Work
- Approved Drawings & Specifications
- Tasks & Schedule
- RFI / Site Instructions
- Progress Updates & Site Photos
- Material / Delivery Records
- Inspection / QA-QC / Defects
- Variation Orders
- Progress Claims / Payment Status
- Documents

### D. External / Guest Access
Limited temporary access for agents, brokers, lawyers, banks, consultants or other professionals without creating another full portal.

## 3. Developer Operations — Main Business Domains

### 3.1 Development
- Land and title information
- Legal / encumbrance records
- Feasibility
- Master plan
- Project / phase setup
- Plot / unit inventory
- House types
- Permits and government documents
- Infrastructure
- Project milestones
- Development budget

### 3.2 Design
Disciplines:
- Architecture
- Interior
- Structure
- MEP
- Landscape
- Pool
- Furniture / built-in

Capabilities:
- Master House Type
- Clone master design to plots
- Plot-specific variations
- Drawings
- Specifications
- Material library
- Furniture library
- Revision control
- Design review and approval
- Approved-for-Construction status

### 3.3 AI Design Studio
Future integrated AI design environment linked to real project data rather than a standalone image generator.

Potential capabilities:
- Floor plan / SketchUp / 3D input
- AI rendering
- Style and material variations
- Furniture variations
- Lighting / landscape visualization
- Selective image editing
- Upscaling
- Marketing visualization

AI assets must be linked to Project → Plot → Room → Design Version.

### 3.4 Project & Construction
- WBS
- Baseline schedule
- Dependencies / milestones
- Actual progress
- Forecast completion
- Delay reasons
- Site tasks
- Daily site reports
- Site photos
- Manpower / equipment
- RFI
- Site instructions
- Meeting minutes
- Contractor / subcontractor management
- Inspection
- QA/QC
- Defect / punch list
- Handover preparation

### 3.5 Cost & Procurement
- Estimate
- BOQ
- Project budget
- House / unit budget
- Budget vs committed vs actual vs forecast
- Purchase Request (PR)
- RFQ
- Supplier comparison
- Purchase Order (PO)
- Supplier database
- Price history
- Delivery
- Material inspection
- Inventory / allocation
- Contractor contracts
- Progress claims
- Retention
- Variation Orders

### 3.6 Marketing & Sales
Marketing:
- Campaigns
- Ads / channels
- Content
- Website leads
- Lead source
- Marketing spend
- Cost per lead / viewing / booking / sale

Sales / CRM:
- Lead
- Qualification
- Contact history
- Viewing
- Follow-up
- Negotiation
- Quotation
- Pricing / promotion / discount
- Agent / broker
- Reservation
- Booking

Sales inventory statuses may include:
Available → Hold → Reserved → Contracted → Sold → Transferred.

### 3.7 Customer & Contract
- Customer profile
- Buyer / co-buyer / authorized person
- KYC documents
- Booking
- Sales contract
- Addendum
- Payment schedule
- Payment evidence
- Receipts
- Customer communication
- Design approvals
- Customer change requests
- Variation approval
- Inspection
- Transfer
- Handover
- Warranty
- After-sales

### 3.8 Finance & Management
- Project feasibility
- Land cost
- Hard cost
- Soft cost
- Marketing cost
- Commission
- Finance cost
- Taxes / fees
- Contingency
- Revenue
- AP / AR
- Cash flow
- Profitability
- Forecast margin
- Scenario planning
- Management dashboard

## 4. Customer Journey

```
Lead
→ Qualified
→ Viewing
→ Negotiation
→ Booking
→ Contract
→ Payment
→ Design / Selection
→ Construction
→ Inspection
→ Transfer
→ Handover
→ Warranty
→ After Sales
```

The same customer account should continue through the complete lifecycle rather than creating disconnected records at each stage.

## 5. Customer Portal Experience

Customer dashboard should show:
- Property / Plot / House Type
- Current status
- Overall house progress
- Overall project progress
- Expected completion
- Key milestones
- Pending customer actions

Example milestone view:

```
Booking ✓
Contract ✓
Design ✓
Foundation ✓
Structure 65%
MEP 25%
Interior 0%
Inspection
Transfer
```

Customers should see only approved/published information, never internal developer costs, supplier margins, internal notes, or restricted operational information.

## 6. Customer Change Workflow

A customer request must become a controlled business process rather than remain only in chat.

```
Customer Request
→ Design Review
→ Cost / Time Impact
→ Variation Order
→ Customer Approval
→ Payment (when applicable)
→ Drawing Revision
→ Construction Release
→ Completion / Evidence
```

The system must preserve who requested, reviewed and approved each change, the relevant revision, price impact and time impact.

## 7. Contractor / Partner Workflow

Example construction event:

```
Contractor completes work
→ Upload progress / photos
→ Request inspection
→ Site / Engineer review
→ Approve or issue defect
→ Update verified project progress
→ Publish customer-safe progress where appropriate
→ Feed management dashboard
```

One verified event should update all relevant views without duplicate data entry.

## 8. Document & Revision Control

All important project documents require controlled storage and traceability.

Examples:
- Land / legal
- Permits
- Contracts
- Drawings
- Specifications
- BOQ
- PO
- VO
- Payment evidence
- Receipts
- Inspection records
- Handover records
- Warranty records

Drawing example:

```
A-101
Rev 01
Rev 02
Rev 03
Rev 04 — APPROVED FOR CONSTRUCTION
```

The system must identify the current revision and record who created, reviewed, approved and released it.

## 9. Workflow & Approval Engine

Workflow is a platform-level capability shared across modules.

It should support:
- Assigned actions
- Status transitions
- Approval steps
- Approval matrix by role / value / project
- Due dates
- Escalation
- Notifications
- Pending-action inbox
- Event history

Approval rules should be configurable rather than hard-coded wherever practical.

## 10. Communication & Evidence

Important project communication must be preserved as structured evidence.

Records may include:
- Messages
- Comments
- Requests
- Approvals
- Attachments
- Site instructions
- Customer decisions
- Meeting decisions

Future integrations may include LINE OA, email and notifications, while preserving important outcomes in the platform timeline.

## 11. Central Timeline

Project, Unit and Customer should each have an auditable event timeline.

Example Unit timeline:

```
Design
→ Permit
→ Procurement
→ Construction
→ QC
→ Booking / Contract
→ Customer Variation
→ Inspection
→ Transfer
→ Warranty
```

This timeline is a major architectural principle and should connect events from multiple business domains.

## 12. Management Dashboard

Management requires Big Picture → Drill Down.

Portfolio / project view should include:
- Project value
- Units available / reserved / contracted / sold / transferred
- Revenue contracted
- Cash received
- Budget
- Committed cost
- Actual cost
- Forecast cost
- Forecast margin
- Construction progress
- Sales performance
- Marketing performance
- Cash requirements
- Outstanding payments
- Pending approvals
- Critical issues
- Schedule risk

Users should be able to drill down from portfolio → project → plot/unit → detailed source records.

## 13. Legal / Permit / Property Records

The platform should accommodate:
- Land title / deed information
- Plot data
- Encumbrance / legal notes
- Construction permits
- Government approvals
- House registration
- Utility / meter records
- Ownership / transfer records
- Expiry / renewal dates where applicable

Specific legal workflows must be validated against actual project and jurisdiction requirements before implementation.

## 14. Security, Privacy & Governance

Because the platform will contain identity, contractual and financial evidence, it must include:
- Authentication
- Role-Based Access Control
- Record-level authorization where required
- Customer data isolation
- Partner scope isolation
- Audit trail
- Secure file access
- Backup / recovery
- Data retention policy
- Privacy / consent handling
- PDPA-aware design

## 15. Core Platform Capabilities

These are shared infrastructure, not separate departmental silos:
- Central database
- Document Vault
- Workflow Engine
- Approval Engine
- Notification Engine
- Audit Trail
- Search
- Event Timeline
- Reporting
- Data / AI layer
- Integration layer

## 16. Core Principles

### Single Source of Truth
Important project information should have one authoritative record.

### Traceability
Important changes, approvals and transactions must be reconstructable.

### Big Picture → Drill Down
Management sees the portfolio while operations can reach source-level detail.

### Customer Transparency
Customers receive clear, controlled visibility into their own home and obligations.

### Data Once, Use Many Times
Verified data entered once should feed operations, management and customer-facing views where appropriate.

### Reusable Knowledge
Project 001 should create templates, data and operational knowledge reusable in Project 002 and beyond.

### Configurable, Not Project-Hardcoded
House types, workflows, approval limits, statuses and project settings should be reusable/configurable wherever possible.

## 17. Pilot — Project 001

The first five-house development will serve simultaneously as:
1. A real property development and sales project.
2. The pilot dataset and workflow validation environment for the platform.

Project 001 should establish reusable:
- Project templates
- House types
- Design standards
- BOQ structures
- Supplier / contractor records
- Procurement workflows
- Construction schedules
- QC checklists
- Sales process
- Customer journey
- Contract / document structure
- Handover / warranty workflow

## 18. Delivery Strategy

Do not attempt to build every feature in the first release.

Recommended sequence:

**Stage 1 — Business Process Mapping**
Map one house from project setup through warranty:
Actor → Action → Input → Output → Approval → Cost impact → Time impact → Evidence → Customer visibility.

**Stage 2 — System Blueprint**
Define domains, workflows, permissions, states, integration boundaries and source-of-truth rules.

**Stage 3 — Data Architecture**
Design entities and relationships only after core workflows are validated.

**Stage 4 — UX Architecture**
Design Developer Operations, Customer Portal and Partner Portal around user tasks.

**Stage 5 — MVP**
Implement only the workflows required to operate Project 001 reliably.

**Stage 6 — Expansion**
Add advanced finance, automation, integrations and AI capabilities based on real operational usage.

## 19. Future AI Direction

Long-term objective: a Property Development AI Assistant grounded in live platform data.

Examples:
- Which units are behind schedule and why?
- What will affect completion in the next 30 days?
- Which payments are due this week?
- Which materials must be ordered in the next 14 days?
- Which project costs are trending over budget?
- Which marketing campaign produces actual sales?
- Summarize Project 001 before the management meeting.
- Identify unresolved approvals that could delay construction.

AI must answer from authorized system data and preserve permission boundaries.

## 20. Out of Scope for Master Brief

This document defines product direction and functional scope. It intentionally does not yet lock:
- Final database schema
- Final technology stack
- UI visual design
- Exact legal forms
- Accounting implementation
- External integration vendors
- AI model vendors
- Detailed API contracts

Those decisions belong to subsequent architecture documents after business-process review.

---

## Definition of Success

The platform succeeds when the developer can manage a house from development through warranty in one traceable system; the customer can securely understand and act on everything relevant to their own home; contractors and partners can execute assigned work using controlled information; and management can see accurate portfolio-level status and drill down to the evidence behind it.

**Master principle:** One Property Platform — different portals, one controlled source of truth.
