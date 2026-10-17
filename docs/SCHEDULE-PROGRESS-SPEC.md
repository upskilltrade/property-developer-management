# Schedule & Progress — Feature Spec

**Status:** Steps 1–4 implemented (data model, house schedule with report/verify/publish and photos, progress matrix, project Gantt, photo log). Step 5 (dashboard additions, customer portal view) not yet.
**Depends on:** DATA-MODEL.md §10, BUSINESS-PROCESS-MAP.md Process 18–19, MVP-ROADMAP.md Release 4
**Pilot:** Project 001 — 5 houses

Three connected features:

1. **Unit progress** — verified construction progress per house.
2. **Project schedule** — the whole project's programme (all houses plus project-level works) on one timeline.
3. **Unit house schedule** — the activity schedule of one house inside Unit 360°.

## 1. Principles

- Progress is derived from schedule activities, not typed in as one number.
  Today `unit_construction.progress_percent` and `stage` are entered manually; they become a summary computed from verified activity progress.
- Reported ≠ verified. Contractor/site report a percent; Site Engineer / PM verify it. Only verified progress counts as official progress (DATA-MODEL §10, §32).
- The customer sees only published progress (SYSTEM-BLUEPRINT §12).
- A house-type schedule template is cloned into each unit (Master → Plot, same idea as design).
- Status codes stay language-neutral; Thai/English names come from dictionaries or localized names.

## 2. Data model (new migration)

### schedule_templates / schedule_template_activities
Reusable activity list per house type: `house_type_id`, `code`, `name_th`, `name_en`, `stage`, `sequence`, `duration_days`, `weight`, predecessor codes.

### schedule_activities
| Column | Notes |
|---|---|
| organization_id, project_id | required, for RLS |
| unit_id | null = project-level work (road, drainage, fence, show house, utilities) |
| parent_id | WBS hierarchy (group → activity) |
| code, name_th, name_en, stage, sequence | stage uses the existing construction stage codes |
| weight | numeric; share of the unit's progress (weights in one unit sum to 100) |
| baseline_start, baseline_finish | approved plan; changes only through a re-baseline |
| forecast_start, forecast_finish | current expectation |
| actual_start, actual_finish | from progress |
| status | NOT_STARTED → READY → IN_PROGRESS → INSPECTION → COMPLETED; also BLOCKED / REWORK |
| responsible_partner_id | contractor/subcontractor (when partner tables exist) |
| is_milestone | e.g. foundation inspected, structure topped out, handover |

### activity_dependencies
`predecessor_id`, `successor_id`, `type` (FS for MVP), `lag_days`.

### progress_updates (append-only)
`activity_id`, `report_date`, `reported_percent`, `reported_by`, `verified_percent`, `verified_by`, `verified_at`, `note`, `publication_status` (INTERNAL / PUBLISHED), photo/document references.

### activity_photos
Every activity (every work category in the template) carries photo evidence.

| Column | Notes |
|---|---|
| organization_id, project_id, unit_id, activity_id | required; unit_id null for project-level works |
| progress_update_id | the report the photo belongs to (null = general site photo for the activity) |
| storage_path, thumbnail_path | private bucket objects (see §2a) |
| caption, taken_at, uploaded_by, uploaded_at | taken_at from EXIF when present, else upload time |
| publication_status | INTERNAL / PUBLISHED — customer sees only PUBLISHED |
| voided_at, voided_by, void_reason | photos are voided, never hard-deleted (evidence) |

### Derived (SQL view or RPC)
- **Unit progress %** = Σ(activity weight × latest verified %) / Σ weight.
- **Unit current stage** = stage of the earliest activity that is not completed.
- **Project progress %** = unit progress weighted by unit budget (fallback: equal weight), plus project-level activities.
- **Delay days** = forecast_finish − baseline_finish (per activity, unit and project).
- **At risk** = in progress or not started while forecast_finish is after baseline_finish, or a predecessor is late.

`unit_construction` stays as a cached summary, refreshed by `verify_progress()`, so existing screens keep working.

### RLS & permissions
- Read: `can_access_project(project_id)`; contractors only through assignments (later).
- Report progress: SITE_ENGINEER, contractor (later).
- Verify progress: SITE_ENGINEER / PROJECT_MANAGER, never the same user who reported.
- Edit baseline: PROJECT_MANAGER; re-baseline is audited.
- Publish to customer: PROJECT_MANAGER / Customer Service.
- Server functions: `verify_progress(update_id, percent)`, `publish_progress(update_id)`, `apply_schedule_template(unit_id, template_id, start_date)`.

## 2a. Photo storage & upload rules

- Supabase Storage **private** bucket `site-photos`; path `org/project/unit-or-project/activity/update/<uuid>.jpg`. Paths are not authorization (DATA-MODEL §19).
- Storage policies mirror table RLS: read requires `can_access_project`; write requires report permission on that project.
- Viewing uses short-lived signed URLs; thumbnails for lists, full image on click.
- Upload from phone: multiple files at once, opens the camera directly (`accept="image/*" capture="environment"`), works on weak site signal (one file at a time, retry on failure).
- Client resizes to max 2048 px JPEG (~80%) before upload and creates a ~400 px thumbnail; limit 10 MB per original, images only.
- **A progress report needs at least 1 photo** (configurable per activity); verification shows the photos next to the reported %.
- Publishing a progress update to the customer publishes only the photos the verifier selects.

## 3. Default template — Thai detached house (editable)

| # | Activity | Stage | Weight |
|---|---|---|---|
| 1 | Site preparation / setting out (เตรียมพื้นที่ / วางผัง) | FOUNDATION | 3 |
| 2 | Piling & footing (เสาเข็ม / ฐานราก) | FOUNDATION | 10 |
| 3 | Ground beams & slab (คานคอดิน / พื้นชั้นล่าง) | STRUCTURE | 8 |
| 4 | Columns, beams, upper slab (เสา คาน พื้นชั้นบน) | STRUCTURE | 14 |
| 5 | Roof structure & roofing (โครงหลังคา / มุงหลังคา) | ROOF | 9 |
| 6 | Masonry walls (ก่ออิฐ) | STRUCTURE | 8 |
| 7 | MEP rough-in (ท่อ / สายไฟ / งานระบบ) | MEP | 9 |
| 8 | Plastering (ฉาบปูน) | FINISHING | 7 |
| 9 | Doors & windows (ประตู หน้าต่าง) | FINISHING | 6 |
| 10 | Floor & wall tiles, ceiling (กระเบื้อง / ฝ้า) | FINISHING | 9 |
| 11 | Painting (ทาสี) | FINISHING | 5 |
| 12 | Sanitary & electrical fixtures (สุขภัณฑ์ / ดวงโคม) | FINISHING | 5 |
| 13 | External works / landscape (งานภายนอก / จัดสวน) | FINISHING | 4 |
| 14 | QC inspection & defects (ตรวจ QC / แก้ไข) | INSPECTION | 3 |
| ◆ | Ready for handover (พร้อมส่งมอบ) — milestone | COMPLETED | 0 |

## 4. Screens

### A. Project schedule — new tab under the project (`/projects/[id]/schedule`)
- Gantt timeline: rows grouped by **Project-level works** then **each unit (A-01 … A-05)**, with activities collapsible under each unit.
- Bars: baseline (thin grey) vs forecast/actual (coloured by status); milestones as diamonds; "today" line.
- Late activities highlighted red, with delay days shown.
- Zoom week / month; filter by stage, status, contractor; "only late" toggle.
- Header KPIs: project progress %, planned vs actual %, activities late, forecast completion vs target.

### B. Unit progress matrix — on project overview
- Grid of units × stages (all 5 houses on one screen): each cell shows % and colour (done / in progress / late / not started).
- Click a cell → that unit's schedule.

### C. Unit house schedule — new section/tab in Unit 360°
- Activity table: code, activity, planned dates, forecast/actual dates, status, reported %, verified %, delay.
- Mini Gantt for the house.
- Actions: **Report progress** (percent, note, photos — at least 1) → **Verify** (photos shown side by side) → **Publish to customer** (choose which photos).
- **Photo gallery per activity**: thumbnails grouped by activity and date, filter by stage; tap to enlarge with caption, who uploaded and when.
- Progress history (who reported, who verified, when).
- "Apply template" when the unit has no schedule yet (pick house-type template + start date).

### C2. Project photo log
- All photos of the project in one feed, filter by unit, activity/stage, date, published or not — for site meetings and management review.

### D. Dashboard additions
- Portfolio: average progress per project, number of late activities, next milestones in 14 days.

## 5. Delivery order

1. Migration: tables (incl. `activity_photos`), RLS, storage bucket + policies, derived view, RPCs; seed the default template.
2. Unit house schedule (C) + report/verify flow — this feeds everything else.
3. Unit progress matrix (B) and refresh of `unit_construction` summary.
4. Project schedule Gantt (A).
5. Dashboard additions (D); customer-safe published progress for the Customer Portal (Release 2/4).

## 6. Acceptance

- All 5 houses' progress visible on one screen, matching verified updates.
- Reported progress never changes official progress until verified by a different authorized user.
- Changing a forecast date shows delay against the untouched baseline.
- Customer view shows only published progress and published photos.
- Every activity can hold photos; a progress report cannot be submitted without the required photo(s); photos open via signed URL only.
- Thai/English labels, Buddhist Era dates in Thai UI, usable on mobile at site.
