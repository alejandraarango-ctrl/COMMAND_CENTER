---
description: Write a Supabase migration for COMMAND_CENTER following the house conventions — RLS service-role policy on every new table, partial indexes, dedup constraints, and the enum-in-its-own-transaction rule. Use when the user says "new migration", "add a table", "add a column", "create a migration", "alter the schema", or "add an enum value".
argument-hint: [what the migration should change]
---

# Write a Supabase migration

Change to make: $ARGUMENTS

Migrations live in `supabase/migrations/<timestamp>_<slug>.sql` and apply in filename order. Match the existing ~20 files for style. Look at neighbors before writing: `20260412105433_rls_and_dedup.sql` (RLS + dedup), `20260519120000_add_snapchat_enum.sql` (enum), `20260519120001_platform_session_state.sql` (new table). Per CLAUDE.md, open every migration with a comment block explaining **why** it exists.

## Filename

`supabase/migrations/<YYYYMMDDHHMMSS>_<short_slug>.sql`. Use a timestamp strictly later than the newest existing migration so ordering holds (don't invent a clock — check `ls supabase/migrations/ | tail -1` and go after it).

## Non-negotiable conventions

**1. RLS on every new table.** This codebase is service-role-only — the anon/authenticated keys get zero access, all server code uses the service key. A new table without RLS is the exact gap the Supabase Security Advisor flags (see commit history). Always:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on <table>"
    ON <table> FOR ALL
    USING (auth.role() = 'service_role');
```

The service key bypasses RLS automatically, but the explicit policy documents intent and satisfies the advisor.

**2. Enum additions go in their own migration, alone.** `ALTER TYPE platform_enum ADD VALUE IF NOT EXISTS '<x>';` — Postgres forbids using a new enum value in the same transaction that adds it. Never combine an enum add with a migration that consumes the value (a table/column/index referencing it). Use `IF NOT EXISTS` so re-runs are safe.

**3. Partial indexes for hot, filtered queries.** The schedulers query narrow slices, so indexes are partial. Examples in the tree:
- claim lookup: `... ON schedules (scheduled_for) WHERE picked_up_at IS NULL`
- pending jobs: `... ON video_batch_jobs (created_at) WHERE status = 'pending'`
- active templates: `... WHERE is_active = true`

**4. Caption dedup uses `md5()`, excludes failed rows.** The dedup guard is `UNIQUE (platform, md5(caption)) WHERE status NOT IN ('failed', 'buffer_error')` — `md5()` because captions are TEXT and can exceed the B-tree size limit; failed/error rows drop out so retries can re-insert. Mirror this shape for any new "no duplicates per platform" rule.

**5. Comment the why.** Lead with a block comment: what the migration does, why it's needed, and any Postgres gotcha (the enum-transaction rule is worth restating inline when relevant).

## After writing

Apply with `supabase db push`. This hits the real database — confirm with the user before running it if they haven't already asked. Then verify the change landed (e.g. `\d <table>` semantics: query the table, or check the enum with `SELECT enum_range(NULL::platform_enum);`).

## Quick checklist before handing back

- [ ] Timestamp later than the newest existing migration
- [ ] New table → `ENABLE ROW LEVEL SECURITY` + service-role policy
- [ ] Enum add is isolated in its own file with `IF NOT EXISTS`
- [ ] Indexes are partial where the query is filtered
- [ ] Leading comment explains the why
- [ ] `supabase db push` run (with user's go-ahead) and verified
