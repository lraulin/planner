# Bill due dates and lead time

**Status: active**
Spec folder: `agent-os/specs/2026-09-05-1401-bill-due-dates-and-lead-time/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-14-1012-recurring-bill-cadences/` — its own Follow-ups
  section names this work: _"Reconciling a forecast against the charge that arrives… nothing
  marks a bill paid or late. That needs a notion of a bill instance."_ Answered by derivation
  rather than by instance rows.
- **Extends:** `agent-os/specs/2026-09-05-1200-finances-envelope-workflow/` — "Passed expected
  dates ask for review, never assert missed payment" still holds; this makes the expected date
  correct.
- **Extends:** `agent-os/specs/2026-08-28-1000-ynab-target-engine/` — the target engine reads
  `expectedKey` through `ScheduleBill`; it inherits the fix without change.
- **Supersedes:** `agent-os/specs/2026-08-23-2313-one-budget/` **D2, in part** — only the claim
  that "a missed or early charge self-corrects". It does not: it re-anchors. The rest of D2
  (cadence wins, RecurConfig retires, no stored `next_date` cursor, no skip) stands. The
  matching line in `docs/actual-budget/README.md` (lines 75–77) is updated with it.
- **Supersedes:** `agent-os/specs/2026-08-25-0901-bill-next-charge/` **D1/D2, narrowed** — see
  D5. Undeclared bills are unaffected; that spec's D4 write guard is untouched.

## Context

Rent is due the **1st** of the month. Autopay is set to fire **7 days before** the due date, at
the landlady's request, and the bank then posts it on whatever business day it lands on. The app
has no way to say any of that, so it kept reporting that rent had never arrived.

**Root cause.** A bill has no due date in this model. `billAnchor`
(`src/lib/finances/commitments.ts:187`) derives the next expected charge as **last posted charge

- one cadence**. That is a random walk: every deviation is absorbed permanently instead of
  correcting, so an early posting drags the whole expectation forward and the next normal payment
  reads as late.

Evidence, replayed over 24 cycles of the real rent history (2024-09 → 2026-08, postings ranging
from the 17th to the 31st of the month):

| Rule                                                                               | False alarms                                                                                                                                        |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today: `last charge + 1 cadence`, and the review panel applies **no grace at all** | **16 of 24 occurrences**, 42 total days on the "Still active? · dates to review" list — worst `2025-04-17 → expected 2025-05-17, actual 2025-05-27` |
| Proposed: due day 1, lead 7, nearest-occurrence matching, 7-day grace              | **0 of 24**, every occurrence matched to exactly one charge, max deviation 7 days                                                                   |

The affordance that should have solved this already exists and is **inert**: `due_day` is a
column (`src/db/schema.ts:2732`), CHECK-constrained, validated in `mutations.ts:836`, carried
through `queries.ts` / `cutover.ts` / `dashboardQueries.ts`, and editable as "Due day (optional)"
in `BillFields.tsx:51-66` — and **no arithmetic anywhere reads it**. A user can type into that box
and nothing happens. Meanwhile `anchorDate` carries three meanings, which `billAnchor`'s own
13-line doc comment is an essay about.

That is the "two workarounds for one missing concept" signal in
`agent-os/standards/development/clean-code.md`: a fact stored in a column nobody reads, and a
second column overloaded to cover for it. This spec fixes the model.

## Decisions

- **D1 — A bill declares its due schedule; charges are matched to it, not walked from.**
  `dueDay` becomes load-bearing and gains a partner, `leadDays`. Occurrences are pure calendar
  arithmetic — `dueAt(k) = shiftDateKeyMonths(seedDue, k × cadenceMonths)`,
  `expectedAt(k) = dueAt(k) − leadDays` — always measured from the seed so month clamping cannot
  accumulate (the technique already used by `occurrenceDatesInMonth`,
  `budget/targets/cadence.ts:77`). A posted charge is assigned to its **nearest** occurrence
  rather than becoming the next anchor.

- **D2 — Undeclared bills keep today's behavior.** `dueDay === null` (or a day cadence, or
  `scheduled: false`) walks from the last charge exactly as now. A 28-day autoship genuinely is a
  walk; only a calendar-anchored bill has a due day. This is one engine with two branches, not
  two engines — `billAnchor` already has that shape.

- **D3 — Grace floor rises from 5 days to 7.** On the real data a posting ran at most 6 days late
  relative to its calendar occurrence. Grace 0 flags 16/24, grace 5 flags 3/24 for one day each,
  grace 7 flags 0/24. Proportional scaling for long cadences is unchanged.

- **D4 — Next charge stays the primary column; Due becomes a hideable one.** "Next charge" keeps
  meaning the **posting** date — that is what hits the bank, what the envelope funds, and what the
  Before payday / On payday cue is about. Saved views and `budget/dueCue.ts` keep working
  untouched.

- **D5 — For a bill with a declared due day, Next charge is derived, not typed.** The cell renders
  read-only with a title explaining that due day + lead govern it; clearing `dueDay` returns the
  editable `anchorDate` cell. Two writable sources for one date is how `anchorDate` got overloaded
  in the first place.

- **D6 — Lead time is suggested, never applied.** Setting a due day offers a lead prefilled from
  the median (due date − posting date) over recent charges; the user confirms. Same "flags, never
  applies" rule the cadence detection already follows.

- **D7 — One review check, in lib.** `BillsView.tsx:202-208` filters `expectedKey < todayKey`
  inline in a component, with no grace; `staleSubscriptions` (`commitments.ts:316`) is a better
  version of the same check with **no callers at all**. Both are replaced by one exported function
  the panel calls. Logic belongs in lib (`standards/development/clean-code.md`).

- **D8 — No stored cursor, no new table.** Occurrences stay derived. This keeps the half of
  one-budget D2 that was right and supersedes only the half the rent data falsifies.

## Acceptance criteria

- [ ] Rent, set to due day 1 / lead 7, shows **Next charge 2026-09-24** and **Due 2026-10-01**,
      and does not appear on the Bills review list.
- [ ] Replaying the 24 real rent postings produces 24 matched occurrences and 0 review entries.
      Pinned by a unit test using the real date series.
- [ ] A bill with `dueDay: null` produces identical anchors to today's code. Pinned by a test,
      because this is the regression that would be invisible.
- [ ] Setting a due day on a bill with history offers a suggested lead and does not apply it.
- [ ] The Budget page's Before payday / On payday cue, the 12-month forward projection, the
      Upcoming strip and the derived bill target all read the corrected expected date with no
      change to their own code.
- [ ] A second user cannot read or write the first user's `dueDay` / `leadDays`.
- [ ] Every item in the Task 7 cleanup list is gone, and `npm run lint`, `npm run typecheck`,
      `npm run test:unit` (Postgres up — check for the skip warning), `npm run build` and
      `npm run smoke` all pass.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

---

## Task 1: Save spec documentation

Create this folder with `plan.md` (**Status: active**), `shape.md`, `standards.md` (references
only, pinned to standards commit `81b5fe3`), `references.md`. No `visuals/` — none provided.

## Task 2: Schema and migration

`src/db/schema.ts`, then `npm run db:generate` — never hand-write a migration
(`standards/database/migrations.md`).

- `finance_budget_categories.lead_days smallint not null default 0`, CHECK `0..60`.
- Add `lead_days = 0` to the existing `finance_budget_categories_bill_facet` CHECK
  (`schema.ts:2785`), beside the `due_day is null` clause it already carries.
- Rewrite the `due_day` doc comment (`schema.ts:2728-2732`): it currently describes behavior that
  does not exist. Same for the stale claims at `commitments.ts:8-9` and `recurringBills.ts:69`.

No backfill. Every existing bill keeps `due_day = null` and behaves exactly as today; Rent is set
by hand during verification.

## Task 3: The occurrence arithmetic

New pure module `src/lib/finances/billSchedule.ts` + `billSchedule.test.ts`, so `commitments.ts`
does not grow a fourth concern:

- `declaresSchedule(bill)` — month cadence, `scheduled`, `dueDay !== null`.
- `occurrenceAt(bill, k)` → `{ dueKey, expectedKey }`, measured from the seed every time.
- `nearestOccurrence(bill, dateKey)` — the occurrence a posted charge belongs to.
- `nextOccurrenceAfter(bill, occurrence)`.
- `suggestLeadDays(dueDay, chargeKeys, cadence)` → median offset, or null under 2 charges.

Seed phase comes from `anchorDate`'s period when set, else the last charge's; irrelevant for
monthly, load-bearing for a semi-annual bill. Reuse `shiftDateKeyMonths` / `shiftDateKey` /
`daysBetweenKeys`; no `Date` for calendar work (`standards/development/dates.md`).

Tests must fail on a plausible mistake: a due day of 31 across February, a leap year, a 6-month
cadence's phase, and the **24 real rent postings** as a fixture.

## Task 4: Rewire `billAnchor` and the review check

`src/lib/finances/commitments.ts`:

- `billAnchor` gains a declared-schedule branch (D1/D2) and `BillAnchor` gains
  `dueKey: string | null`. Signature is otherwise unchanged, so `loadBillAnchors`,
  `loadBillSnapshots`, the target engine, `projectForwardMonths` and `upcomingBillOccurrences`
  all inherit the fix with no edit.
- `billOccurrences` (`commitments.ts:430`) uses the declared series when there is one.
- New `billsNeedingReview(bills, lastCharges, todayKey)` replacing both the dead
  `staleSubscriptions` and the inline filter in `BillsView.tsx` (D7). `graceDays` is rescued from
  the dead function and its floor raised to 7 (D3).
- Plumb `dueKey` through `loadBillAnchors` (`budget/queries.ts:577`) and `managementBillRows` /
  `BudgetBillRow`.

## Task 5: Write path

- `mutations.ts` — `BillEnvelopeEdit.leadDays`, validation beside the existing `dueDay` check
  (`:836`), and both write sites (`:981`, `:1033`). Only fields supplied are written, as now.
- `budget/mutations.ts:909` — a kind change clears `leadDays` with the rest of the bill facet.
- `budget/queries.ts`, `dashboardQueries.ts`, `budget/cutover.ts` — carry the column.
- `agent/contracts.ts`, `agent/financeTools.ts`, `agent/tools.ts` — `leadDays` on bill
  create/update with an intent-shaped description (`standards/api/agent-tools.md`).
- `mutations.integration.test.ts` — **a second user must fail to read, change and delete the
  first user's `dueDay` / `leadDays`** (CLAUDE.md).

## Task 6: UI

- `BillFields.tsx` — "Due day" gains a "Charged N days before due" field beside it, with the D6
  suggestion. 16px inputs, 44px tap targets (`standards/components/responsive.md`).
- `bills/billColumns.tsx` — new hideable **Due** column; Next charge renders read-only with an
  explanatory title when the bill declares a due day (D5). Filterable/sortable like its
  neighbours (`standards/components/data-grid.md`).
- `bills/BillsView.tsx` — the review panel calls `billsNeedingReview` and names both dates
  ("expected 9/24, due 10/1"). "Still active · reset expected date" still writes `anchorDate` for
  undeclared bills; for a declared one it offers the due-day fields instead.

## Task 7: Cleanup

Verified dead by a repo-wide sweep separating production from test callers. The repo has **no**
dead-export tooling (no knip/ts-prune; `@typescript-eslint/no-unused-vars` is module-local), so
none of this was ever going to be flagged automatically.

**Delete outright — zero references, or tests only:**

| What                                                        | Where                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| `asBillCommitment` + `Commitment`                           | `commitments.ts:52-64` — zero references, not even tests                  |
| `aliasOverlap` + `AliasOverlap` + `OVERLAP_RATIO`           | `commitments.ts:257-303`                                                  |
| `periodLengthDays`, then `periodStartKey` (its only caller) | `commitments.ts:116-135`                                                  |
| `staleSubscriptions` + `StaleSubscription`                  | `commitments.ts:150-165, 316-355` — superseded by D7                      |
| `spendingVsIncome`                                          | `expectedSpending.ts:29` — see note below                                 |
| `amountRangeLabel` + the `amountRange` field it formats     | `commitmentRows.ts:32, 110-117` — computed on every row, rendered nowhere |
| `targets/fromTemplates.ts` + `.test.ts`                     | whole module; nothing imports it                                          |

`spendingVsIncome` is the sharpest one: the **type** `SpendingVsIncome` is a live contract, but
the function that builds it is bypassed — `dashboardQueries.ts:326-337` hand-constructs the
literal and **does not agree with it** (`incomePlan.knownCents` and a hardcoded
`medianPaycheckCents: 0` against `incomeFromPaydays`). It is a dead second answer to a live
question. Keep the type, move it, delete the module and its test; check `incomeFromPaydays` /
`Payday` still have callers.

**Drop the `export` keyword** where the symbol has no importer and no test needs it:
`billOccurrences`, `ForwardItem`, `CommitmentRef`, `shiftByCadence`, `occurrenceDatesInMonth`.
Leave the rest exported-for-test — that is a legitimate reason to export here.

**Collapse three exports into one operation:** `nextDueDate` (`recurringBills.ts:228`) is a
one-line alias for `shiftByCadence`, and `previousDueDate` re-implements it with the sign flipped.
One function taking a signed count.

Delete the corresponding test blocks; do not leave tests asserting deleted behavior.

## Task 8: Verify, freeze spec, update roadmap

1. `npm run lint`, `npm run typecheck`, `npm run test:unit` — **check for the Postgres skip
   warning**; the ownership tests are the ones that matter.
2. `npm run build`, then dev server + `npm run smoke` (all routes) — a green gate is not proof the
   app runs, and this touches `src/app/finances/**`.
3. In the running app on the real file: set Rent to due day 1 / lead 7, confirm Next charge reads
   9/24 and Due reads 10/1, confirm it leaves the review list, confirm the Budget row's payday cue
   and the 12-month forecast still agree. Confirm day-cadence and unscheduled bills are untouched.
4. Freeze `plan.md` / `shape.md`, complete **Changes from original plan**, update
   `docs/actual-budget/README.md` lines 75-77 and the roadmap if it names this.
5. Commit and push to `origin/master` — validation happens on the deployed phone, and
   branch-parked work reads as a broken feature.

---

**Standing rule while this spec is active:** material changes to requirements, design or scope —
including feedback on what gets built — go into `plan.md` / `shape.md` and get a row in **Changes
from original plan**. Skip pure implementation details. Freeze when verified.
