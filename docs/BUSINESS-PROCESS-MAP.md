# Property Development Management Platform — Business Process Map

**Version:** 1.0  
**Status:** Draft for Operational Review  
**Depends on:** docs/MASTER-BRIEF.md, docs/SYSTEM-BLUEPRINT.md  
**Pilot:** Project 001 — 5 residential houses

## 1. Purpose

This document maps the end-to-end lifecycle of one residential unit so the software is designed around real business operations rather than isolated modules.

Every process should answer:

```
WHO → DOES WHAT → USING WHAT → PRODUCES WHAT
→ WHO APPROVES → COST/TIME IMPACT
→ WHAT EVIDENCE IS STORED
→ WHO CAN SEE IT → WHAT HAPPENS NEXT
```

## 2. End-to-End Lifecycle

```
PROJECT INITIATION
→ LAND / FEASIBILITY
→ PROJECT SETUP
→ MASTER DESIGN
→ BUDGET / BOQ
→ PERMIT / PRE-CONSTRUCTION
→ MARKETING
→ LEAD / CRM
→ VIEWING / NEGOTIATION
→ RESERVATION / BOOKING
→ CONTRACT
→ CUSTOMER DESIGN / SELECTION
→ PROCUREMENT
→ CONSTRUCTION
→ CUSTOMER VARIATION
→ PROGRESS / PAYMENT
→ QA/QC
→ CUSTOMER INSPECTION
→ FINAL PAYMENT / TRANSFER
→ HANDOVER
→ WARRANTY
→ AFTER SALES
```

A unit can move through commercial and construction processes in parallel. The platform must therefore avoid assuming that the lifecycle is one strictly linear status.

---

## 3. Process 01 — Project Initiation

### Actors
Owner / Management, Development Team, Project Manager, Finance.

### Inputs
- Business opportunity
- Land information
- Market assumptions
- Initial development concept
- Target customer / product positioning

### Actions
1. Create Project Opportunity.
2. Record land and legal information.
3. Define preliminary development concept.
4. Estimate unit count / product mix.
5. Create preliminary project timeline.
6. Create preliminary feasibility.

### Outputs
- Project record
- Land record
- Preliminary master plan
- Initial feasibility
- Go / Hold / No-Go decision

### Approval
Management / Owner.

### Evidence
Feasibility versions, land documents, meeting decisions, approvals.

### System Event
`PROJECT_CREATED`, followed by `PROJECT_APPROVED` when authorized.

---

## 4. Process 02 — Land, Legal & Feasibility

### Actors
Development, Finance, Legal/Consultant, Management.

### Inputs
Land title, survey, acquisition cost, legal conditions, planning constraints.

### Actions
- Verify title / plot data.
- Record acquisition and related costs.
- Record legal constraints / encumbrances.
- Identify permits / approvals required.
- Build financial feasibility.
- Run Base / Best / Worst scenarios.

### Key Financial Outputs
- Land cost
- Estimated hard cost
- Soft cost
- Marketing / sales cost
- Finance cost
- Taxes / fees
- Contingency
- Expected revenue
- Expected margin
- Cash requirement

### Approval Gate
No major project commitment without approved feasibility.

### Evidence
Title documents, surveys, assumptions, feasibility revision and approval.

---

## 5. Process 03 — Project / Phase / Plot Setup

### Actors
Project Manager, Development, Admin.

### Actions
Create:

```
Project 001
└─ Phase 01
   ├─ Plot 01
   ├─ Plot 02
   ├─ Plot 03
   ├─ Plot 04
   └─ Plot 05
```

For each unit:
- Plot identity
- Land area
- House type
- Commercial status
- Construction status
- Base selling price
- Plot premium if applicable
- Target completion

### Output
Saleable/buildable unit inventory.

### Control
Plot code / unit code must be unique within the project.

---

## 6. Process 04 — Master House Design

### Actors
Architect, Interior Designer, Engineer, MEP, Landscape, Management.

### Inputs
Project concept, site constraints, target price, target customer, development budget.

### Actions
1. Create Master House Type.
2. Develop Architecture.
3. Coordinate Structure.
4. Coordinate MEP.
5. Develop Interior.
6. Develop Landscape / Pool.
7. Define materials and specifications.
8. Create design package.
9. Review constructability and cost.

### Output
Approved Master House Design.

### Design Structure
```
House Type
├─ Architecture
├─ Structure
├─ MEP
├─ Interior
├─ Landscape
├─ Pool
├─ Materials
├─ Furniture
├─ Specifications
└─ Drawings
```

### Approval Gate
Master design approved before controlled release.

### Evidence
Drawing revisions, comments, approval records, specifications.

---

## 7. Process 05 — Plot-Specific Design

### Actors
Design Team, Project Manager.

### Actions
- Clone Master House to Plot.
- Apply orientation/site adaptations.
- Apply approved plot-specific changes.
- Maintain relationship back to Master House.
- Generate Plot Design Package.

### Rule
A plot variation must not silently overwrite the Master House.

### Output
Plot-specific approved design baseline.

---

## 8. Process 06 — Estimate, BOQ & Budget Baseline

### Actors
QS / Cost Control, Design Team, Project Manager, Management.

### Inputs
Approved design and specifications.

### Actions
- Create estimate.
- Build BOQ.
- Assign cost codes.
- Allocate budget by unit/work package.
- Compare target vs estimated cost.
- Value-engineer where required.
- Freeze approved baseline.

### Output
```
Approved Budget
+ BOQ Baseline
+ Cost Codes
+ Procurement Packages
```

### Approval
According to approval matrix.

### Evidence
Estimate versions, BOQ versions, value-engineering decisions, approval.

---

## 9. Process 07 — Permit & Pre-Construction Readiness

### Actors
Development, Architect/Engineer, Project Manager, external consultants.

### Actions
- Prepare permit documents.
- Submit applications.
- Record submissions and authority responses.
- Track approval / expiry.
- Complete required pre-construction documents.
- Verify latest approved design.

### Readiness Gate
Construction should not be released until required readiness criteria are satisfied.

### Output
Construction Readiness status.

---

## 10. Process 08 — Marketing Launch

### Actors
Marketing, Sales, Management.

### Inputs
Approved product information, price list, renders, project information, sales inventory.

### Actions
- Create campaign.
- Create marketing assets.
- Define source/channel.
- Publish campaign.
- Capture incoming leads.

### Attribution Chain
```
Campaign → Ad/Source → Lead → Viewing → Booking → Contract → Sale
```

### Output
Leads with traceable acquisition source.

---

## 11. Process 09 — Lead & CRM

### Actors
Sales, Marketing.

### Lead States
```
NEW
→ CONTACTED
→ QUALIFIED
→ VIEWING
→ NEGOTIATION
→ BOOKING
→ WON
```

Terminal alternatives: LOST / DISQUALIFIED.

### Activities
- Call / message / email
- Requirement capture
- Budget
- Preferred plot
- Viewing appointment
- Follow-up
- Offer / quotation

### Evidence
Contact history and key decisions.

### Rule
A lead should not be duplicated unnecessarily; identity matching rules will be defined later.

---

## 12. Process 10 — Viewing & Negotiation

### Actors
Sales, Customer.

### Inputs
Qualified lead, available unit inventory, price list.

### Actions
- Schedule viewing.
- Record attendance.
- Record units viewed.
- Record customer interest.
- Prepare quotation / offer.
- Apply promotion / discount request.

### Approval
Discount beyond sales authority requires configured approval.

### Output
Customer + selected unit + agreed commercial proposal.

---

## 13. Process 11 — Reservation / Booking

### Actors
Sales, Customer, Finance/Accounting.

### Actions
1. Check unit availability.
2. Temporarily hold unit where policy allows.
3. Create booking record.
4. Capture buyer/co-buyer information.
5. Generate booking document.
6. Receive booking payment/evidence.
7. Finance verifies payment.
8. Confirm booking.

### Unit State
```
AVAILABLE → HOLD → RESERVED
```

### Evidence
Booking document, payment evidence, receipt, customer acceptance.

### Customer Portal
Account can be invited/activated at this stage.

### Failure Paths
Expired hold, cancelled booking, rejected payment, released inventory.

---

## 14. Process 12 — Contract

### Actors
Sales/Admin, Customer, Management/Legal, Finance.

### Inputs
Booking, customer identity, property data, agreed price, payment terms.

### Actions
- Prepare contract.
- Review contract.
- Issue contract.
- Sign / accept.
- Collect required contract payment.
- Verify payment.
- Activate contractual obligations.

### Unit State
`RESERVED → CONTRACTED`

### Evidence
Contract version, signatures/acceptance, payment, attachments.

### Control
Signed/accepted contract versions must not be silently replaced.

---

## 15. Process 13 — Customer Design & Material Selection

### Actors
Customer, Interior/Architect, Sales/Customer Service, QS when cost changes.

### Actions
- Publish customer-safe design.
- Present standard selections.
- Customer selects materials/options.
- Record approval.
- Identify non-standard requests.
- Convert non-standard changes into Change Request / VO process.

### Customer Portal
Shows only published design revisions.

### Evidence
Selected option, approval timestamp, relevant drawing/material revision.

---

## 16. Process 14 — Customer Change / Variation

### Actors
Customer, Customer Service/Sales, Design, QS, Project Manager, Finance, Contractor.

### Workflow
```
Customer Request
→ Scope Review
→ Design Review
→ Cost Impact
→ Time Impact
→ Internal Approval
→ VO Offered
→ Customer Approval / Rejection
→ Payment Condition
→ Drawing / Specification Revision
→ Release for Construction
→ Execute
→ Inspect
→ Close
```

### Mandatory Data
- Request description
- Original scope
- Revised scope
- Cost delta
- Time delta
- Relevant drawing/spec
- Approval history
- Payment condition
- Execution evidence

### Critical Rule
No customer-requested change should reach site execution without required approval and controlled release.

---

## 17. Process 15 — Procurement

### Actors
Site/Project, QS, Procurement, Management, Supplier.

### Workflow
```
Requirement
→ PR
→ RFQ
→ Supplier Quotations
→ Comparison
→ Approval
→ PO
→ Supplier Confirmation
→ Delivery
→ Inspection
→ Accepted / Rejected
→ Invoice / Payment Process
```

### Inputs
BOQ, schedule, material specification, inventory.

### Controls
- Approved specification
- Budget availability
- Approval threshold
- Delivery requirement date

### Evidence
RFQ, quotations, comparison, approval, PO, delivery note, inspection.

---

## 18. Process 16 — Contractor / Subcontractor Appointment

### Actors
Project Manager, QS, Management, Contractor.

### Actions
- Define scope/work package.
- Tender / negotiate.
- Compare offers.
- Approve contractor.
- Execute contract.
- Define milestones/payment terms.
- Assign project/unit/work scope.

### Partner Portal
Contractor sees only assigned scope and released information.

### Evidence
Scope, tender, contract, commercial terms, assignment.

---

## 19. Process 17 — Construction Release

### Actors
Project Manager, Design, Site Manager, Contractor.

### Preconditions
- Required permit/readiness
- Approved-for-Construction drawings
- Approved specifications
- Contractor assignment
- Schedule
- Required procurement readiness

### Action
Release controlled work package to site.

### Evidence
Release date, drawing revisions, scope and responsible parties.

---

## 20. Process 18 — Construction Execution

### Actors
Contractor, Site Manager, Engineer, Project Manager.

### Typical Work Sequence
```
Site Preparation
→ Foundation
→ Structure
→ Roof
→ MEP Rough-in
→ Walls / Openings
→ Waterproofing
→ Finishes
→ Interior / Built-in
→ MEP Fixtures
→ Pool
→ Landscape
→ Testing / Commissioning
```

Actual WBS remains configurable.

### Daily / Periodic Records
- Work completed
- Manpower
- Equipment
- Weather
- Materials received
- Issues
- Site photos
- Safety/incident record where applicable
- Planned next work

### Rule
Contractor-reported progress is not automatically official progress.

---

## 21. Process 19 — Progress Verification

### Workflow
```
Contractor Progress Update
→ Evidence / Photos
→ Inspection / Verification
→ Accepted Progress
→ Official Unit Progress
→ Management Dashboard
→ Customer-safe Published Progress
```

### Actors
Contractor → Site/Engineer → Project Manager.

### Customer View
Only verified/published milestones or percentages.

---

## 22. Process 20 — RFI / Site Instruction

### RFI
Contractor raises question when drawing/spec/site condition is unclear.

```
RFI Raised
→ Assigned
→ Design/Engineer Response
→ Clarification / Drawing Revision if needed
→ Closed
```

### Site Instruction
Authorized developer role issues controlled instruction.

### Rule
If instruction changes cost/time/scope, it must link to Change / VO process rather than remain an informal instruction.

---

## 23. Process 21 — Contractor Variation

Changes can originate from:
- Customer
- Developer
- Design
- Site condition
- Contractor proposal
- Authority requirement

### Workflow
```
Change Identified
→ Scope Defined
→ Cost / Time Assessed
→ Approval
→ Contractor VO
→ Budget Updated
→ Schedule Updated
→ Drawing/Instruction Updated
→ Execute
```

Customer VO and Contractor VO may be related but are not necessarily financially identical.

---

## 24. Process 22 — Contractor Progress Claim

### Actors
Contractor, QS, Site/Engineer, Finance, Management.

### Workflow
```
Claim Submitted
→ Work Verification
→ Quantity / Value Verification
→ Deduction / Retention / Advance Recovery
→ Approval
→ Finance Payable
→ Payment
```

### Evidence
Claim, measurement, inspection, approval, payment.

---

## 25. Process 23 — Customer Payment Schedule

### Actors
Finance, Customer, Sales/Customer Service.

### Flow
```
Scheduled
→ Due
→ Evidence Submitted
→ Finance Verification
→ Paid
```

Exceptions:
- Overdue
- Rejected evidence
- Adjusted schedule
- Waived/credited under authorized policy

### Customer Portal
Shows:
- Amount
- Due date
- Status
- Evidence
- Receipt
- Outstanding balance

### Notification
Upcoming due and overdue events can trigger reminders.

---

## 26. Process 24 — QA/QC & Defects

### Actors
Site, Engineer, Contractor, Project Manager.

### Workflow
```
Inspection
→ Pass
OR
→ Defect Created
→ Assigned
→ Rectification
→ Reinspection
→ Closed
```

### Evidence
Checklist, photos, responsible party, dates, before/after evidence.

### Rule
Critical defects block relevant completion/handover gates.

---

## 27. Process 25 — Practical Completion / Handover Readiness

### Preconditions
- Construction scope substantially complete
- Required inspections passed
- Critical defects closed
- Required testing completed
- Required documents prepared
- Financial / contractual conditions checked

### Output
Unit marked ready for customer inspection subject to policy.

---

## 28. Process 26 — Customer Inspection

### Actors
Customer, Customer Service, Project/Site Team.

### Workflow
```
Inspection Scheduled
→ Customer Inspection
→ Customer Defect / Observation List
→ Developer Review
→ Contractor Rectification
→ Reinspection
→ Customer Acceptance
```

### Customer Portal
Customer can view inspection items and status.

### Evidence
Inspection record, photos, acknowledgements, completion evidence.

---

## 29. Process 27 — Final Payment & Transfer

### Actors
Customer, Finance, Sales/Admin, Legal/Transfer team.

### Preconditions
Configured according to actual contract and legal process.

### Actions
- Confirm outstanding balance.
- Collect / verify final payment.
- Prepare transfer documents.
- Complete ownership transfer.
- Record transfer details.

### Unit State
`SOLD / CONTRACTED → TRANSFERRED` according to final commercial model.

### Evidence
Payment, receipts, transfer documents, ownership evidence.

---

## 30. Process 28 — Handover

### Actors
Customer, Customer Service, Project/Site Team.

### Handover Package
May include:
- Keys / access
- Meter information
- Equipment list
- Manuals
- Warranties
- Approved/as-built documents where applicable
- Final inspection acceptance
- Handover acknowledgement

### Output
Handover completed.

### Customer Account
Transitions naturally into Home Owner / After-Sales experience.

---

## 31. Process 29 — Warranty

### Actors
Customer, Customer Service, Project/Site, Contractor/Supplier.

### Workflow
```
Service Request
→ Warranty Eligibility Review
→ Assigned Party
→ Appointment
→ Repair
→ Verification
→ Closed
```

### Data
- Warranty category
- Start/end dates
- Responsible contractor/supplier
- Issue history
- Photos
- Resolution
- Cost responsibility

---

## 32. Process 30 — After Sales

After warranty or outside warranty:
- Service request
- Maintenance
- Repair history
- Equipment/manual lookup
- Owner documents
- Paid service if business policy later supports it

The property record should survive beyond the original sales transaction.

---

## 33. Cross-Process Approval Gates

Important approval gates include:
- Project feasibility approval
- Master design approval
- Budget baseline approval
- Drawing release approval
- Discount approval
- Booking confirmation
- Contract approval
- Customer variation internal approval
- Customer variation acceptance
- PR / PO approval
- Contractor appointment
- Contractor VO approval
- Progress claim approval
- Customer payment verification
- Practical completion
- Transfer readiness
- Handover acceptance

Approval authority should be configurable by project, role, amount and workflow.

---

## 34. Cross-Process Evidence Model

For every material decision, the platform should preserve:

```
WHO
WHAT
WHEN
RELATED RECORD
BEFORE / AFTER STATE
DOCUMENT / PHOTO / MESSAGE
APPROVAL
COST IMPACT
TIME IMPACT
VISIBILITY
```

This supports disputes, management review, customer trust and future AI analysis.

---

## 35. Source-of-Truth Rules

### Unit
Authoritative property identity and current commercial/operational status.

### Drawing Revision
Authoritative design version; only released revision is valid for construction.

### BOQ / Budget
Approved baseline plus controlled revisions/variations.

### Contract
Accepted/signed version is immutable; amendments are additional controlled records.

### Payment
Finance verification determines official paid status.

### Construction Progress
Verified progress determines official progress.

### Customer Approval
Explicit approval record with timestamp and revision/reference.

### Documents
Controlled metadata + version history determine authoritative document.

---

## 36. Visibility Rules

### Internal Only by Default
- Internal cost
- Margin
- Supplier quotations
- Contractor commercial comparison
- Internal notes
- Management discussions
- Unverified progress
- Draft drawings

### Customer-Safe
- Own property data
- Published progress
- Approved customer drawings
- Customer payment schedule/status
- Customer contracts/documents
- Customer requests/approvals
- Inspection/handover/warranty records

### Partner-Safe
- Assigned scope
- Released drawings/specifications
- Relevant schedule/tasks
- RFIs/instructions
- Their own commercial documents
- Their own claims/variations
- Relevant inspections/defects

---

## 37. Key Automations to Support Later

- Unit automatically becomes unavailable after confirmed booking.
- Expired hold returns unit according to policy.
- Drawing approval can trigger controlled release.
- Approved VO can create budget/schedule/design actions.
- Verified progress can update dashboards.
- Verified payment updates receivable status.
- Upcoming payments generate reminders.
- Overdue approvals generate escalation.
- Defect closure can unlock completion gates.
- Transfer can activate warranty periods.
- Handover can transition portal mode to homeowner.

Automations should execute only after explicit business rules are validated.

---

## 38. Project 001 Operational Minimum

For the first five houses, the platform must be able to run these connected chains reliably:

### Sell a Unit
```
Lead → Viewing → Offer → Booking → Contract → Payment
```

### Control Design
```
Master Design → Plot Design → Revision → Approval → Release
```

### Build a Unit
```
Schedule → Contractor → Work → Progress → Inspection → Verified Progress
```

### Manage a Change
```
Request → Review → Cost/Time → Approval → VO → Revision → Build → Close
```

### Manage Customer
```
Booking → Portal → Design Approval → Progress → Payment → Inspection → Transfer → Warranty
```

### Preserve Evidence
Every chain above must retain documents, decisions, approvals and timeline events.

---

## 39. Open Operational Questions for Review

These should be answered before the relevant database/workflow is finalized:

1. Exact booking/hold expiration policy.
2. Required booking and contract approval levels.
3. Standard customer payment schedule.
4. When a unit is considered SOLD versus CONTRACTED.
5. Customer design-selection deadline.
6. Variation markup/pricing policy.
7. Whether customer VO requires payment before release.
8. Contractor retention and progress-claim rules.
9. Official construction progress measurement method.
10. Practical-completion criteria.
11. Transfer workflow and required documents.
12. Warranty periods by work/equipment category.
13. Which project progress information is published to customers.
14. Which partner types require portal accounts versus guest access.
15. Which approvals must support e-signature.

These are business-policy decisions, not reasons to delay the overall architecture.

---

## 40. Next Artifact

The next document should be **ROLE-PERMISSION-MATRIX.md**.

It will convert the actors in this process map into an explicit authorization model for:
- Developer Operations
- Customer Portal
- Partner Portal
- External / Guest access

After permissions are validated, the conceptual objects and workflows can be converted into the first ERD / data model.

---

**Process principle:** no important business event should exist only in a person's memory, chat history or uncontrolled file. If it changes scope, money, time, responsibility, approval, customer commitment or construction output, it should become a traceable platform record.
