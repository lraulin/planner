# Standards that applied — the Day tab

Four standards bear on this feature. The rest of `agent-os/standards/` was reviewed and does
not apply (no new API surface, no new modal, no new drawer).

---

## `database/migrations` — one new table

**Why it applies:** this slice adds `daily_items`.

**What it demands:**

```sh
# 1. edit src/db/schema.ts
npm run db:generate     # writes drizzle/NNNN_name.sql + meta/NNNN_snapshot.json + journal entry
# 2. read the generated SQL before trusting it
npm run db:migrate      # applies it locally
```

Commit the **`.sql`, the snapshot, and the `_journal.json` entry together.** They are one
change. Never hand-write a migration without its snapshot — `db:generate` diffs the _last
snapshot_ against `schema.ts`, so one omission poisons every migration after it (the `0004`–
`0008` incident, repaired at `0008`).

**How it was followed:** `drizzle/0015_square_beyonder.sql` was generated, read, and applied.
It is purely additive — one `CREATE TABLE`, two FKs, one index, one partial unique index, and
no `ALTER` against any existing table. All three artefacts are committed together.

**One judgement call worth recording:** `day` and `forwarded_to` are `date` columns, the first
in this schema — every other date is `timestamp with time zone`. A calendar day genuinely has
no time component, and storing one would let a server running in UTC shift Lee's Tuesday into
Monday. `YYYY-MM-DD` string comparison was already the app-wide convention for day arithmetic
(`src/lib/chooser/dates.ts`, `src/lib/tree/status.ts`); `date` with `mode: "string"` lines the
column up with it exactly. This deliberately does not propagate the `deferred_date` shape.

---

## `development/testing` — what earned a test

**Why it applies:** this slice adds pure logic and a full set of database mutations.

**What it demands:** pure logic in `src/lib/**` always gets an adjacent `foo.test.ts`; anything
touching the database gets a `*.integration.test.ts`, and **is not done until a second user has
tried to read, change and delete the first user's row and failed at every step**. No React
component tests. A test earns its place if it would fail on a plausible mistake.

**How it was followed:**

- `src/lib/day/forward.test.ts` — 9 tests on the carry-over rule. The ones that would catch a
  real mistake: future-dated rows are left alone (otherwise planning ahead is undone by
  opening the app), cancelled rows do not carry (otherwise forwarding silently reverses a
  decision not to do something), and an already-forwarded row is skipped (which is what makes
  running carry-over on every page load safe).
- `src/lib/day/mutations.integration.test.ts` — 42 tests, of which 12 are the cross-user block
  covering every mutation plus both queries and the journal.
- The recurrence test is the one that justifies a design decision rather than just covering a
  line: completing a repeating task from the day page must leave the row checked while the
  node resets to `not_started`. Derive the checkbox from `nodes.state` and that test fails —
  which is precisely why `completed_at` lives on the row.
- **No component tests**, per the standard. The Day tab was verified in a real browser instead.
- The refactor of `tcPriority.ts` was gated on its existing 30 tests passing **untouched**.

**The trap this standard exists for:** `npm run test:unit` passing does not mean the database
tests ran — they skip when Postgres is down. This slice was verified with `npm test` and the
container up; 800 tests, no skip warning.

---

## `components/ux-principles` — why there is no "add item" dialog

**Why it applies:** this slice adds a tab, a grid, and inline editors.

**What it demands:** grid + inline edit is the default; modals only for confirmations,
blocking decisions, or fast capture; keyboard-first; minimise required fields.

**How it was followed:** the entire premise of the tab is that adding a line costs nothing, so
there is no New Item dialog and no drawer — a persistent input at the foot of the list, Enter
commits, focus stays put for the next one. Priority, title and state are all inline cells,
because they are all grid columns. The Appointments pane is read-only and links out rather
than duplicating the Weekly Schedule's editing, which keeps one place to drag a block to.

---

## `api/error-handling` — actions never throw

**Why it applies:** this slice adds `src/app/day/actions.ts`.

**What it demands:** server actions return `{ ok: false, error }` rather than throwing, so a
rejected save renders inline instead of crashing the view.

**How it was followed:** `src/app/day/actions.ts` uses the same `run()` wrapper as
`src/app/notes/actions.ts`; `DayView` and `WeekPlanView` surface failures through
`ErrorBanner`. Where a constraint could surface as a raw Postgres violation — re-opening a
completed row whose task has since been planned elsewhere — `setDailyItemState` pre-checks and
throws a sentence a person can read ("That task is already planned for 2026-08-03").

---

## Reviewed and not applicable

- `components/drawer-pattern` — no new drawer. `PlanForDayField` is a field inside the
  existing detail drawer, and it deliberately saves on change rather than on the drawer's Save,
  because it writes to `daily_items` rather than to the record being edited.
- `components/modal-pattern` — no new modal.
- `api/response-format`, `api/agent-auth`, `api/agent-tools` — no new HTTP surface. Agent tools
  for the day list are listed as a follow-up.
