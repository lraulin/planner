# Standards that apply — the deferred-date model

Three standards bear on this work. The rest of `agent-os/standards/` was reviewed and does not
apply: no new API surface, no new modal, no new drawer, and the one UI change is a checkbox in
an existing control row.

---

## `database/migrations` — a data-preserving move across three tables

**Why it applies:** `target_start_date`, `target_end_date` and `deferred_date` move from
`task_details` onto `nodes`, absorbing `project_details.project_start` and
`project_details.target_end`, and a CHECK constraint is added.

**What it demands:**

```sh
# 1. edit src/db/schema.ts
npm run db:generate     # writes drizzle/NNNN_name.sql + meta/NNNN_snapshot.json + journal entry
# 2. read the generated SQL before trusting it
npm run db:migrate      # applies it locally
```

Commit the **`.sql`, the snapshot, and the `_journal.json` entry together.** They are one
change.

**The trap this work walks straight into.** `db:generate` will emit `ADD COLUMN` and `DROP
COLUMN` with nothing in between, which loses every date in the database. The SQL must be
hand-edited to backfill between them. But `db:generate` diffs the _last snapshot_ against
`schema.ts`, so a hand-written migration that ships without its snapshot poisons every
migration after it — that is the `0004`–`0008` incident, repaired at `0008` and still visible
as the missing `0004`–`0006` snapshots and the wrong `0007`.

The safe path, and the one this spec follows: **generate first** to obtain both the SQL and a
correct snapshot, then hand-edit _only the `.sql`_, leaving the generated snapshot untouched.
The snapshot describes the end state, which the edit does not change.

Order inside the migration matters:

1. add the new columns;
2. backfill from `task_details`, then from `project_details` (no row is ever both);
3. backfill `state = 'postponed'` for rows with a future deferred date;
4. normalise rows that would violate the constraint, and delete the day lines orphaned by
   that normalisation;
5. **then** add the CHECK — a pre-existing bad row would otherwise fail the migration;
6. drop the old columns.

Add the column, backfill it, then drop the old one — never drop first.

**Connections:** migrations run over `DIRECT_DATABASE_URL`, never the pooler. **Production**
migrates during `npm run build`, gated on `VERCEL_ENV === "production"` because preview
deployments share the one Neon database. **`db:push` is local scratch only** — it writes
`schema.ts` straight to a database and produces no migration file. **`db:seed` is
destructive** and deletes the dev user's nodes.

---

## `development/testing` — the gate that cannot be automated

**Why it applies:** this spec adds real logic (`shelving.ts`, the `derive.ts` ancestor walk)
and changes several database mutations, including one that now takes an explicit instant.

**What it demands:**

- **Real logic goes in `src/lib/**`, not components**, with a `foo.test.ts` beside it. That is
  where the tricky reasoning lives and where a wrong answer looks plausible — which describes
  the inheritance rules here exactly (latest-wins, indefinite-as-infinity, completed beating
  inherited shelving, expiry at read time).
- **Anything touching the database gets a `*.integration.test.ts`, and it is not done until a
  second user has tried to read, change and delete the first user's row and failed at every
  step.** Every mutation takes a `userId` and must scope by it.
- **No React component tests.** The type-aware ESLint rules already cover that bug class.
- A test earns its place if it would **fail on a plausible mistake**. No snapshots, no mocking
  Drizzle, no tests that restate the implementation.
- **`npm run test:unit` passing does not mean the database tests ran** — they skip when
  Postgres is down. Check for the skip warning. This spec changes `mutations.ts` and
  `queries.ts`, so that check is mandatory before calling anything verified.

**Plausible mistakes worth a test here**, chosen on that rule: an ancestor's _expired_ shelf
still hiding a descendant; a child's later date being overwritten by its parent's earlier one;
a completed task under a shelved project reading as shelved; a backdated completion writing
history at `now` instead of the given date; the day line vanishing in the
defer-Feb/plan-Mar case.

---

## `components/ux-principles` — inline controls, not modals

**Why it applies:** the "Show deferred" checkbox moves from component state into the persisted
grid settings, and the Project form gains a Deferred field.

**What it demands:** grid-level controls stay inline in the existing control row; modals are
for confirmations, blocking decisions and fast capture only. The Project form's new field
follows the drawer pattern already used by `TaskForm`, saving through the same server action
rather than immediately.
