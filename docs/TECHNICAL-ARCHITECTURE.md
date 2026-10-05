# Property Development Management Platform — Technical Architecture

**Version:** 1.0  
**Status:** Baseline Architecture  
**Pilot:** Project 001 — 5 residential houses  
**Languages:** Thai + English

## 1. Architecture Decision

Recommended baseline stack:

- Web application: Next.js + TypeScript
- Rendering: App Router, Server Components by default
- UI: React, responsive web/PWA-ready architecture
- Database: PostgreSQL on Supabase
- Authentication: Supabase Auth
- Authorization: PostgreSQL Row Level Security + application permission checks
- File storage: Supabase Storage
- Hosting/CDN: Vercel
- Source control/CI: GitHub
- Internationalization: route-aware TH/EN application locale layer
- Validation: shared TypeScript schemas at trust boundaries
- Testing: unit + integration + end-to-end + RLS/security tests
- Observability: Vercel/application logs + Supabase database/auth logs
- Background processing: introduce only when workflows require durable asynchronous jobs

This architecture is deliberately a modular monolith for the MVP. Do not split into microservices prematurely.

## 2. System Context

Browser/PWA communicates with Next.js application and authorized Supabase services.

Next.js is responsible for application composition, server-side business actions, portal UX and integration boundaries.

PostgreSQL remains the source of truth.

Supabase Auth establishes identity.

RLS enforces row-level data boundaries even when application code makes a mistake.

Storage policies protect private files.

External integrations later connect through controlled server endpoints, webhooks, queues or edge functions.

## 3. Deployment Topology

GitHub main branch → Vercel production.

Pull Request / feature branch → Vercel preview.

Supabase should have separate non-production and production database environments. Production customer/contract/payment data must never be used casually as development seed data.

Target environments:
- local
- preview/staging
- production

Environment-specific secrets must never be committed.

## 4. Repository Structure

Recommended structure:

app/
  [locale]/
    (auth)/
    (developer)/
    customer/
    partner/
  api/
components/
  ui/
  domain/
features/
  projects/
  units/
  crm/
  customers/
  design/
  construction/
  commercial/
  documents/
  workflow/
  finance/
lib/
  auth/
  permissions/
  supabase/
  i18n/
  validation/
  audit/
  money/
  dates/
locales/
  th/
  en/
supabase/
  migrations/
  seed.sql
tests/
  unit/
  integration/
  e2e/
  security/
docs/

Feature modules should contain business logic close to their domain while shared platform services remain centralized.

## 5. Next.js Architecture

Use Server Components by default for read-heavy pages.

Use Client Components only where browser interactivity is required.

Use server-side actions/route handlers for privileged business transitions rather than allowing the browser to directly perform sensitive multi-step operations.

Examples of server-controlled transitions:
- Confirm booking
- Approve drawing
- Release AFC revision
- Verify payment
- Approve VO
- Verify construction progress
- Close inspection gate
- Transfer/handover

A UI button is never the security boundary.

## 6. Supabase Client Strategy

Use separate browser and server Supabase client utilities.

Browser client:
- Publishable key only
- User-scoped operations protected by RLS
- Never contains secret/service credentials

Server client:
- Uses the authenticated user/session for normal business operations so RLS still applies.

Privileged service credentials are reserved for narrowly controlled backend/system jobs that genuinely require them. They must never be exposed through NEXT_PUBLIC variables.

Prefer modern Supabase publishable keys for new application code.

## 7. Authentication

Initial authentication supports staff, customer and partner identities through Supabase Auth.

Application identity is separated from business identity:
Auth User → Profile → Organization Membership / Customer Link / Partner Link.

Do not store authorization decisions in user-editable metadata.

Sensitive actions can later require re-authentication/MFA depending on policy.

Session handling must work with Next.js SSR.

## 8. Authorization

Authorization has two layers.

### Database Layer
RLS controls which rows can be selected/inserted/updated/deleted.

### Application Layer
Permission service controls business capabilities and UX actions.

Effective authorization:
Identity + Organization + Role + Scope + Resource + Record State.

RLS is mandatory on every table exposed through the Data API.

Authenticated role alone is never sufficient authorization.

## 9. RLS Policy Model

Core helper concepts should answer:
- Is this user a member of this organization?
- Does this user have this project scope?
- Is this unit in an authorized project?
- Is this customer account linked to this unit?
- Is this partner assigned to this project/unit/work package?
- Does this role have the requested permission?

Policies should use ownership/scope predicates rather than only checking authenticated status.

UPDATE policies require both row visibility and valid new-row constraints.

Views exposed to application users must preserve underlying RLS/security semantics.

## 10. Customer Isolation

Customer authorization chain:

Auth User → Profile → Customer Account → CustomerProperty → Unit → Customer-visible resource.

Customer queries must additionally enforce publication/visibility rules.

Customer must never gain access merely from project membership or a guessed UUID.

## 11. Partner Isolation

Partner authorization chain:

Auth User → Profile → Partner Contact/Membership → Active Assignment → Project/Unit/Work Package → Partner-visible resource.

Commercial documents additionally require ownership/relevance to the partner.

## 12. Staff Scope

Staff normally access data through Organization Membership plus assigned role/scope.

Examples:
- Owner: organization scope.
- PM: project scope.
- Site: assigned project/unit.
- Sales: project + lead/customer scope.
- Finance: finance permissions in assigned organization/projects.

Admin and business approval authority remain separate.

## 13. Database Design Rules

- UUID primary keys.
- Human-readable codes separate from IDs.
- timestamptz for event timestamps.
- date for date-only contractual obligations.
- numeric/decimal for money; never floating point.
- ISO-style currency code.
- Machine status codes remain language-neutral.
- Foreign keys and constraints enforce structural integrity.
- Unique constraints protect business invariants.
- Version important evidence instead of overwriting.
- Prefer normalized operational data.
- Reporting views/materializations may denormalize later.

## 14. Database Schemas

For MVP, avoid unnecessary physical schema complexity.

A practical starting point is:
- public/exposed application tables with strict RLS
- private/internal schema for privileged helper functions/internal tables where required
- reporting schema or protected views later

Logical domain boundaries still follow Project, CRM, Customer, Design, Construction, Commercial, Documents, Workflow and Audit.

## 15. Migrations

Database structure is migration-controlled and committed to Git.

Workflow:
1. Develop/test schema change in non-production.
2. Review constraints/RLS.
3. Run security/performance advisors.
4. Generate/commit clean migration.
5. Test from empty database.
6. Apply through controlled deployment process.

Never manually patch production without capturing the resulting migration.

## 16. Storage Architecture

Private buckets should be the default for:
- Contracts
- Customer identity/KYC
- Payment evidence
- Drawings
- BOQ/commercial documents
- Site evidence
- Handover/warranty documents

Public marketing assets may use a separate explicitly public bucket.

Storage object paths should be deterministic but not treated as authorization.

Example conceptual path:
organization/project/unit/domain/document/version/file.

Access is enforced through Storage policies and signed/authorized retrieval.

## 17. Document Versioning

Database Document and DocumentVersion records remain authoritative; Storage contains binary objects.

Replacing an important file creates a new version.

Checksum can help prove whether binary content changed.

Signed contracts and released drawings are immutable versions.

## 18. Internationalization

Routes are locale-aware:
- /th/...
- /en/...

UI strings come from version-controlled translation resources.

Business content uses localized database content when appropriate.

Original user-generated language is preserved.

Status codes never change with locale.

Locale preference can be stored per profile/customer.

Fallback:
preferred locale → project/org default → Thai → English.

## 19. Thai-Specific Presentation

Support Thai text throughout the stack using Unicode.

Thai Buddhist Era display may be enabled for appropriate Thai UI/documents, while database values remain Gregorian.

Address and legal-name fields preserve official entered values.

Search quality for Thai must be tested with real Project 001 data before choosing advanced full-text search architecture.

## 20. Validation

Validate at multiple levels:
- UI for immediate feedback.
- Server/business action for authoritative business rules.
- Database constraints for structural invariants.

Never rely solely on frontend validation.

Examples:
- Unit cannot have conflicting active booking.
- Payment amount cannot use floating point.
- Approved revision cannot be edited.
- Customer approval must reference exact revision/entity.
- Partner assignment must be active.

## 21. Business Transaction Boundaries

Critical multi-record transitions should execute atomically where possible.

Examples:
Confirm Booking:
- validate unit state
- confirm booking
- update unit commercial state
- create customer relationship
- create timeline/audit events

Verify Payment:
- validate permission/evidence
- create/update payment
- update payment schedule
- create receipt workflow event
- create timeline/audit event

Use database functions/transactions carefully for invariants that must not partially succeed.

Privileged database functions require explicit security review; SECURITY DEFINER is not a shortcut around RLS.

## 22. Workflow Engine MVP

Do not build a generic enterprise BPM engine first.

MVP uses:
- workflow definitions
- workflow instances
- tasks
- approvals
- state transition services
- configurable approval rules

Domain services trigger workflow transitions.

Later, if real use demonstrates need, configuration can become more dynamic.

## 23. Audit Architecture

Two histories:

Timeline:
Business-readable events for Project/Unit/Customer.

Audit:
Restricted append-only security/compliance evidence.

Critical server actions write audit records as part of the business transition.

Audit records should not be editable through normal application CRUD.

## 24. Notification Architecture

Domain event → Notification record → delivery channel.

MVP:
- In-app notifications
- Pending Actions

Later:
- Email
- LINE OA
- SMS/push where justified

Notification content is localized using recipient locale.

Delivery failure must not roll back the underlying business transaction.

## 25. Background Jobs

Avoid adding infrastructure until required.

Candidates:
- Email/LINE delivery
- Document generation
- Scheduled reminders
- Escalations
- Reporting refresh
- Large imports
- AI processing

Jobs must be idempotent and retry-safe.

Choose final Supabase/Vercel/background mechanism when implementing the first real asynchronous requirement.

## 26. API Strategy

The application does not need a large public REST API for MVP.

Use:
- Server Components for reads where suitable
- Server Actions / Route Handlers for application commands
- Supabase Data API for safe RLS-protected use cases
- Webhook endpoints for external integrations

Future external API can be versioned separately.

## 27. Domain Service Pattern

Sensitive business transitions should be represented by named services rather than scattered table updates.

Examples:
confirmBooking()
verifyPayment()
approveDrawingRevision()
releaseDrawingForConstruction()
approveVariation()
verifyProgress()
closeDefect()
completeHandover()

Each service handles:
permission → validation → transaction → workflow → audit/timeline → notification.

## 28. Error Handling

Errors should distinguish:
- validation
- unauthorized
- forbidden
- conflict/business state
- not found
- infrastructure failure

Do not reveal sensitive record existence through authorization errors.

User-facing errors are localized TH/EN.

Server logs preserve technical context without logging secrets or unnecessary PII.

## 29. Observability

MVP should capture:
- application errors
- failed server actions
- authentication failures/important auth events
- database errors
- webhook failures
- job failures
- deployment health

Attach correlation/request IDs where practical.

Business audit remains separate from technical logs.

## 30. Testing Strategy

### Unit
Business rules, calculations, locale utilities, state transitions.

### Integration
Database constraints, domain services, storage/document behavior.

### RLS/Security
Explicit tests for:
- Customer A cannot read Customer B.
- Partner A cannot read Partner B.
- Staff project scope is enforced.
- Unauthorized finance user cannot verify payment.
- Draft/released drawing visibility.
- Sensitive document access.

### End-to-End
Critical Project 001 journeys:
Lead → Booking.
Booking → Contract → Payment.
Design → Approval → Release.
Contractor Progress → Verification → Customer Publication.
Customer Change → VO → Approval.
Inspection → Handover.

### Regression
Every production bug in critical business logic should gain a regression test.

## 31. CI/CD

GitHub is source of truth.

Pull Request checks should eventually include:
- Type checking
- Lint
- Unit tests
- Build
- Migration validation
- Security/RLS tests where environment permits
- E2E on critical flows

Merge to main deploys production only after required checks/approval policy.

Vercel previews support UX review before merge.

## 32. Secrets

Use environment management provided by hosting/platform.

Never commit:
- Supabase secret/service keys
- Database passwords
- webhook secrets
- provider credentials
- signing secrets

NEXT_PUBLIC variables are assumed visible to every browser user.

## 33. Backups & Recovery

Production requires:
- Supabase/platform backup policy appropriate to plan
- migration history in Git
- document/storage recovery consideration
- documented restore procedure
- periodic restore/recovery test before platform becomes business-critical

A backup that has never been tested is not a recovery plan.

## 34. Security Baseline

- RLS on exposed tables.
- Private storage by default.
- Least privilege.
- No service secret in browser.
- No authorization from user-editable metadata.
- Immutable/versioned evidence.
- Short-lived signed file access where applicable.
- Audit sensitive actions.
- Validate all external input.
- Protect webhook authenticity.
- Rate-limit abuse-sensitive public endpoints when introduced.
- Review security advisors after schema/RLS changes.
- PDPA-aware handling of customer data.

## 35. PII / KYC Separation

Do not place passport/ID details in broad customer rows.

Use restricted records/documents with dedicated permissions.

General CRM screens should expose only data necessary for that role.

Exports of customer data should be permissioned and auditable.

## 36. Performance Direction

MVP scale is small, but architecture should avoid obvious future bottlenecks.

Use:
- indexes on foreign keys and common filters
- pagination
- server-side filtering
- optimized dashboard queries
- reporting views/materializations when needed
- image/document thumbnails where appropriate

Do not prematurely cache financial truth in multiple places.

## 37. Realtime

Realtime is optional, not foundational.

Useful future cases:
- Pending Actions
- progress updates
- comments
- notification badges

Normal page refresh/revalidation is acceptable initially unless real workflow benefits from live updates.

## 38. PWA / Mobile

Start with responsive web.

Design Customer and Partner portals PWA-ready.

Consider installable PWA/offline support only after field testing proves value.

Native apps are not MVP requirements.

## 39. Integration Boundary

External systems connect through an Integration layer, never directly manipulate core tables without controlled business logic.

Future:
- LINE OA
- Email
- E-sign
- Payment gateway
- Accounting
- Calendar
- AI providers

Store external IDs/mapping and webhook history for traceability.

## 40. AI Boundary

AI is a consumer/assistant of authorized platform data, not a source of financial/legal truth.

AI requests inherit user authorization.

Generated recommendations/content must identify their source records where practical.

AI cannot silently approve, verify payment, release drawings or change contractual state.

## 41. Initial Package Direction

Keep dependencies minimal.

Core categories:
- Next.js / React / TypeScript
- Supabase JS + current SSR integration
- i18n library compatible with App Router
- schema validation
- forms
- accessible UI primitives/design system
- testing stack

Exact package versions must be verified and pinned when scaffolding begins. Commit the lockfile.

## 42. Release 0 Technical Scope

Release 0 implementation order:

1. Scaffold Next.js/TypeScript.
2. Configure TH/EN routing.
3. Add Supabase browser/server clients.
4. Authentication.
5. Core database migration.
6. RLS helpers/policies.
7. Organization/Profile/Membership.
8. Project/Phase/Plot/Unit/HouseType.
9. Developer shell/navigation.
10. Project and Unit screens.
11. Document storage foundation.
12. Timeline/Audit foundation.
13. Admin role/scope UI.
14. Tests.
15. Seed Project 001.
16. Deploy preview/staging.
17. Security review/advisors.
18. Production go-live of Foundation.

## 43. Architecture Decisions Locked for MVP

Locked:
- Next.js + TypeScript
- PostgreSQL/Supabase
- Supabase Auth
- Supabase Storage
- RLS-first authorization
- Vercel
- GitHub
- Responsive web first
- Thai + English from Foundation
- Modular monolith
- Migration-controlled database
- Unit 360° as operational hub
- Timeline + Audit separation

Not locked until implementation need:
- background job provider/mechanism
- email provider
- LINE integration
- e-sign provider
- payment gateway
- accounting integration
- advanced search engine
- AI provider
- native mobile

## 44. Next Implementation Artifact

Before code generation, create an implementation checklist for Release 0 and inspect the existing repository state.

Then:
- scaffold the application without overwriting existing docs
- connect/configure Supabase environment
- create first reviewed migration
- implement authentication + organization/project/unit foundation
- verify RLS with automated negative tests
- seed Project 001

**Technical principle:** keep the application architecture simple, but make identity, authorization, evidence, multilingual support and data correctness strong from the first release.
