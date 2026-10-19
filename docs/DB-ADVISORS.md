# Database advisor review

Supabase's database linter (security + performance advisors) was run against the project
(roadmap §6: authorization/RLS checks, basic performance). Fixes are in
`supabase/migrations/202610190600_db_advisor_fixes.sql`; nothing was dropped.

## Fixed

| Lint | Before | After | Fix |
|---|---|---|---|
| 0011 function_search_path_mutable | 12 | 0 | `alter function … set search_path = public` on trigger guards and import helpers |
| 0003 auth_rls_initplan | 8 | 0 | policies use `(select auth.uid())` so it's evaluated once per query |
| 0001 unindexed_foreign_keys | 239 | 144 | 95 indexes on FKs used to filter or join: `project_id`, `unit_id`, `partner_id`, `cost_category_id`, parent ids (`pr_id`, `po_id`, `handover_id`, …) |

## Reviewed and accepted

- **authenticated_security_definer_function_executable (175).** By design: tables are read-only
  through RLS and every write goes through a `security definer` RPC that checks permission itself
  (`can_*` helpers). `supabase/tests/*.sql` exercises the refusals.
- **anon_security_definer_function_executable: `calendar_events(text)`.** Calendar apps fetch the
  ICS feed without a session. The function returns nothing unless the token matches a
  `calendar_feeds` row and is at least 32 characters, and every event is filtered with
  `user_can_access_project` for the token's owner.
- **rls_enabled_no_policy: `audit_events`, `document_counters`.** Deny-all on purpose; only
  security-definer functions write them.
- **multiple_permissive_policies (22).** The `*_manage` (FOR ALL) policies require OWNER or
  FINANCE_MANAGER at organization scope, people who may read those rows anyway, so OR-ing them with
  the narrower `*_select` policies widens nothing. Performance-only at current scale.
- **unindexed_foreign_keys (144 remaining).** Audit columns (`created_by`, `approved_by`, …) and
  `organization_id`; they aren't used in filters or joins.
- **unused_index.** Includes the new indexes, which have not served queries yet. Revisit after
  real use before removing any.

## Needs the dashboard

- **auth_leaked_password_protection.** Turn on "Leaked password protection" under
  Authentication → Settings in the Supabase dashboard (it checks new passwords against
  HaveIBeenPwned). It can't be set from SQL.

## Re-run 2026-10-19

After the house-delete, member, contract-ownership and schedule migrations: security findings are
the same accepted set (194 security-definer RPCs, `calendar_events` for anon, two deny-all tables,
leaked-password protection still needs the dashboard). `202610191300_more_fk_indexes.sql` adds 14
indexes on foreign keys the code filters or joins on (VO links, design-package parent, interested
unit, schedule parent / assigned partner, defects partner, online payments, RFI drawing, forecast
cost category). The remaining unindexed foreign keys are audit columns, `organization_id` and
rarely joined references.
