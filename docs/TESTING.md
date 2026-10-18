# Testing

Roadmap §6–7 require authorization/RLS tests and tests for critical logic. Two suites cover that.

## Unit tests — `npm test`

Vitest, in `tests/unit/`. Pure logic with no database: CSV parsing, import templates, payment
schedule maths (always sums to the price), schedule delay/progress, inspection references, error
mapping, and Thai/English dictionary parity (same keys, same list lengths, no empty text).

## Database tests — `npm run test:db`

SQL files in `supabase/tests/`, run against `DATABASE_URL`. They check the rules that live in the
database: who can see which rows, payment evidence → verification → receipt, separation of duties,
reversals, bank accounts, legacy import, and that money/audit tables can't be written directly.

- Each file runs after `_fixtures.sql` inside its own transaction, which is **always rolled back**.
- Fixtures create their own throwaway users, roles and projects (`pg_temp.t_user`, `t_grant`,
  `t_project`, `t_customer`), act as a user with `t_as(uid)`, and assert with `t_ok` / `t_refused`.
- They need an organization that already has an owner (the seeded one), and nothing else.
- Prefer a staging or branch database. Without `DATABASE_URL` the script skips.

Adding a test: create `supabase/tests/NNN_topic.sql` with one `do $$ … $$;` block; any
`raise exception 'FAIL: …'` fails it.

## CI

`.github/workflows/ci.yml` runs lint, typecheck, unit tests, prettier and a build on every pull
request. The database job runs only when the repository secret `SUPABASE_TEST_DATABASE_URL` is set.
