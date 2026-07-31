# Standards that applied — task recurrence

Four standards bear on this feature. The rest of `agent-os/standards/` was reviewed and does
not apply (no new API surface, no new modal, no new drawer).

---

## `database/migrations` — the strictest constraint here

**Why it applies:** this slice adds two columns and a table.

**What it demands:**

```sh
# 1. edit src/db/schema.ts
npm run db:generate     # writes drizzle/NNNN_name.sql + meta/NNNN_snapshot.json + journal entry
# 2. read the generated SQL before trusting it
npm run db:migrate      # applies it locally
```

Commit the **`.sql`, the snapshot, and the `_journal.json` entry together.** They are one
change.

> **Never hand-write a migration without its snapshot.** `db:generate` diffs the _last
> snapshot_ against `schema.ts`. Drop one and the next generate diffs from a stale baseline
> and has to be hand-written too — which drops another snapshot. **One omission poisons every
> migration after it.** That is not hypothetical: `0004` shipped SQL and a journal entry with
> no snapshot, `0005`–`0008` were then all hand-written, and `0007` made it worse by adding a
> _wrong_ snapshot. Repaired as of `0008`.

`db:push` is local scratch only — it produces no migration file, so "the change is not real
until `db:generate` has produced a migration."

**How this feature complies:** the design deliberately reuses the **existing**
`recurrence_frequency` enum rather than defining a new unit enum, so the migration is pure
`ADD COLUMN` + `CREATE TABLE` with no `CREATE TYPE` — nothing that needs hand-editing, and
nothing that trips Neon's transaction-mode pooler on `ALTER TYPE … ADD VALUE`.

---

## `development/testing` — what earns a test

**Why it applies:** this touches `src/lib/**` pure logic _and_ database mutations, the two
categories the standard says are always tested.

> Tests here are not a quality ritual and not a coverage target — they are a **tripwire**. […]
> A test earns its place if it would **fail loudly on a plausible mistake**.

The clauses that bind this feature:

- **Pure logic in `src/lib/**` — always.** "Recurrence expansion, sort keys, tree slicing,
  date geometry, filters. These are cheap to test, hold the trickiest reasoning in the
  codebase, and are exactly where a wrong answer looks plausible." → `nextDue.test.ts`.
- **"If the logic branches on dates, include a DST or month-boundary case."** → the Jan 31 +
  1 month clamp, Feb 29 in a common year, and a DST spring-forward case.
- **Database mutations — always, as `*.integration.test.ts`**, and "not done until it has a
  case where a second user tries to read, change, and delete the first user's row and fails
  at every step." → isolation cases on both the node and its `task_completions` rows.
- **No React component tests.** → the Recurrence form section gets none; all its reasoning
  lives in `src/lib/recurrence/`.
- **No server-action tests.** → `setStateAction` is a thin wrapper; test what it delegates to.
- **"Cover the boundary, not every value."** → one `isDeferred` test for "a defer date of
  today is available", not six for various future dates.
- **The skip trap:** "a green `npm run test:unit` does **not** mean the database logic
  passed. Check for the skip warning." This change touches `mutations.ts` and `queries.ts`,
  which is exactly the case the standard names.

---

## `components/ux-principles` — why there is no Set Recurrence dialog

**Why it applies:** AP puts recurrence behind a modal dialog (`Actions → Set Recurrence`), and
copying that would violate our own rule.

The standard permits modals for exactly three things: destructive confirmations, critical
blocking decisions, and fast capture. A recurrence editor is none of them — it is routine
editing bound to an existing record, which belongs in the record's drawer.

**How this feature complies:** two inline fields in a `<Section title="Recurrence">` on
TaskForm's General tab, directly beneath the `Dates` section that already holds **Deferred
until**. Progressive disclosure (the interval field appears only when Repeats ≠ Never)
carries the little conditionality there is.

---

## `components/drawer-pattern` — the save path

**Why it applies:** the new fields ride the existing detail drawer.

The relevant rule is the save ordering, which the new fields inherit without change:

```tsx
const result = await saveNodeDetailAction(detail.id, values);
if (!result.ok) {
  setError(result.error);
  return;
} // check error first, stay open
setDirty(false);
onClose(); // revalidatePath already refreshed
```

**How this feature complies:** by adding nothing. The two columns go into `TASK_KEYS` and are
patched with `patchTask`, so they flow through `saveNodeDetailAction` with **no new server
action** and no new save path.

---

## Reviewed and not applicable

| Standard                                                                         | Why not                                                                                                                        |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `components/modal-pattern`                                                       | No modal is added — see `ux-principles` above.                                                                                 |
| `api/agent-auth`, `api/agent-tools`, `api/response-format`, `api/error-handling` | No agent-facing API surface changes in this slice. The agent tools read nodes generically and pick the new fields up for free. |
