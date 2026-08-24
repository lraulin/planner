# Collapse Budget, Schedules and Commitments into one budget

**Status: frozen / complete** (2026-08-24)

## Context

Since 2026-08-22 the Finances module has run **two budgeting systems in parallel** by
deliberate decision. Tier 1/2 Commitments (`finance_recurring_bills`,
`finance_recurring_spend`) accrue set-asides into a single Available to Spend headline;
the Actual-derived envelope budget (`finance_budget_categories` + allocations) assigns
every dollar. `finance_schedules` was added as a third representation of the same
recurring charge. Both the schedules spec and the nested-groups spec explicitly deferred
the merge decision, built the evidence for it (drift badges, `source_bill_id`
provenance), and required a new delta-spec to make it.

**This is that spec.** The parallel phase is over: zero-based budgeting was the original
intent all along, Actual showed how, and the app is for one person, so it does not need
Actual's generality. One bill is currently three rows across three tables, edited on three
pages, with two vocabularies for "held" and two recurrence engines. That is the
"two workarounds for one missing concept" signal in
`agent-os/standards/development/clean-code.md`, three times over.

**Outcome:** one page, one table, one row per bill. Bills are envelopes that happen to
have recurrence, a status and a URL. Recurring spend is just an envelope. Available to
Spend and its accrual are retired rather than left as a corpse reading dropped tables.

## Decisions

**D1 — A bill is an envelope.** The bill facet moves onto `finance_budget_categories` as
nullable columns behind a `kind` discriminator. `finance_recurring_bills`,
`finance_recurring_spend` and `finance_schedules` are all dropped, along with
`finance_budget_categories.source_bill_id` (the row _is_ the bill, so there is nothing to
point at) and `finance_transactions.schedule_id`.

**D2 — Bill cadence wins; Actual's RecurConfig retires.** `cadence_months` /
`cadence_days` / `due_day` / `anchor_date` / `scheduled` move onto the envelope row, and
next-due stays _derived_ from charge history via `nextDueFrom` — so a missed or early
charge self-corrects and an explicit skip cursor is not needed. **This is a recorded
divergence from Actual** (`docs/actual-budget/README.md`): `conditions` JSONB, the stored
`next_date` cursor, skip, Post now and Discover all go. Payee claims already do the
matching that `conditions` did, with stable ids instead of strings.

**D3 — One claim column replaces the two-table CHECK.** `finance_payees` drops
`commitment_bill_id` / `commitment_spend_id` and the
`num_nonnulls(...) <= 1` CHECK that existed only because the rule spanned two tables. It
gains `budget_category_id` — "this merchant's charges belong to this envelope" — which
means the same thing for a bill and for Pizza. A dismissed Review row stops creating a
fake `status: 'ignored'` bill and becomes `finance_payees.not_a_commitment`.

**D4 — A bill envelope funds itself.** The `{type: "schedule", scheduleId}` template
retires; a bill's funding demand is intrinsic — sink `expected_cents` over the months
until due, or fund it in full when it is due this month. The existing sinking-fund math in
`src/lib/finances/budget/templates/schedule.ts` is re-pointed at the row's own cadence.
`templates` JSONB stays for ordinary envelopes (`simple` / `by` / `remainder`).
Apply/Overwrite stay explicit clicks — nothing runs unattended.

**D5 — Available to Spend is retired.** The per-paycheck accrual with catch-up
(`assignment.ts`, the commitment half of `available.ts`) is deleted. The Dashboard keeps
cash position, card debt and the payday series — none of which depend on commitments —
and its spendable panel becomes budget-derived.

**D6 — One page, one grid.** `/finances/budget`. `/finances/schedules` and
`/finances/commitments` are deleted. Groups already separate Bills from other spending, so
bills and envelopes render as **one `DataGrid`** over the existing tree, giving one totals
footer for free; bill columns read `—` on non-bill rows. The grid gains `GridToolbar` /
`useModuleViews`, which it now needs at a dozen columns.

**D7 — Income gets a section.** Income envelopes already render (activity only, no
balance). What is missing is _expected_ income, which the retired Commitments comparison
was the only place to see it: show received-this-month beside the payday-derived forecast
from `incomeFromPaydays`. Expected income is a forecast line, never assignable — you
assign money you have.

**D8 — Carried-over Commitments surfaces are secondary, not sections.** Review is
on-demand (a page command with a count badge, opening a drawer) rather than a permanent
block. Annualized cost columns (A year / Monthly / Pay period) become hideable columns on
the grid. _Reading your "keep those for now, maybe collapsable" broadly:_ the Next 12
Months forecast and the Expected vs Income table also carry over, as `<details>` collapsed
by default. Say so if you'd rather drop those two outright.

## Acceptance criteria

- [x] One row per bill. `finance_recurring_bills`, `finance_recurring_spend`,
      `finance_schedules` are gone from the schema and from every reader.
- [x] `/finances/budget` is the only budgeting page; Schedules and Commitments are gone
      from nav, Find and the route tree.
- [x] Every bill on the real file survives the cutover with its name, cadence, due day,
      URL, status, expected amount, payee claims, envelope, assigned history and charge
      history intact — verified against a pre-cutover receipt.
- [x] Each recurring-spend row became an envelope holding its payee claims, with a
      `simple` monthly template seeded from its computed rate.
- [x] Apply/Overwrite funds bill envelopes from their own cadence with no template rows,
      and reproduces today's sinking-fund numbers for the same bills.
- [x] The income section shows received and expected for the month, and Ready to Assign
      still counts only received.
- [x] Totals footer sums bills and ordinary envelopes together.
- [x] No page reads a dropped table: `npm run lint`, `npm run typecheck`,
      `npm run test:unit` (with Postgres up), `npm run build`, and `npm run smoke` on a
      running dev server all pass.

## Changes from original plan

| #   | Change                                                                                                                                                                                                                                | Why                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | The grid kept `useGridState` rather than moving to `GridToolbar` / `useModuleViews` (D6).                                                                                                                                             | Bill columns fit inside the existing show/hide + width + density controls without the heavier module-views machinery; that upgrade is real but separable, and nothing in this spec depended on it. Left as a follow-up, not silently dropped.          |
| 2   | Dropped **Pay period** from the hideable annualized trio, keeping only A year / Monthly (D8/Task 5).                                                                                                                                  | Per-paycheck figures need the payday cadence, which the grid's pure column module has no access to without threading payday data through every row; A year and Monthly already answer "what does this cost."                                           |
| 3   | "Bills" vs. "Recurring spend" as two rows of the Expected-vs-income comparison collapsed into one **Bills** row.                                                                                                                      | Recurring spend retired as a tracked tier (D0/D1) — Pizza and groceries are ordinary envelopes now, with no separate comparison line to keep.                                                                                                          |
| 4   | The failed `drizzle-kit migrate` run (mid-implementation) surfaced that four `DROP CONSTRAINT` statements in the drop migration named constraints Postgres had already removed via `DROP TABLE ... CASCADE`, truncated past 63 bytes. | Root-caused and fixed by deleting the four redundant statements with an explanatory comment, then re-verified with a rollback-wrapped dry run before applying for real. Recorded here per the user's "write the cutover first, then migrate" decision. |

---

## Task 1: Save spec documentation

Create `agent-os/specs/{YYYY-MM-DD-HHMM}-one-budget/` with `plan.md` (this file, **Status:
active**), `shape.md`, `standards.md`, `references.md`.

`references.md` must record the **Supersedes** set, naming the specific decision in each:

- `2026-08-16-1938-commitments` — D0's two-tier model and the tier-2 admission test;
  D1's two tables and `setAsideHeld`; D3's cross-table matcher rule
- `2026-08-18-2058-commitments-clarity` — D2's Set aside accrual meter
- `2026-08-21-1403-commitments-expected-vs-income` — D3's comparison table moves pages
- `2026-08-21-2038-paused-bills-assignment` — D1's catch-up accrual, D5's claims bar, and
  "Roadmap envelopes item stays closed"
- `2026-08-22-1948-zero-based-budget` — the "fully parallel, use decides" deferral
- `2026-08-22-2124-actual-schedules` — the whole spec; D5's RecurConfig engine
- `2026-08-22-2242-budget-goal-templates` — D3's `schedule` template type
- `2026-08-23-1807-nested-budget-groups-bill-import` — "Commitments is a seed, not
  ongoing synchronization"; the import itself

**Extends:** `2026-08-22-1948-zero-based-budget` (the envelope arithmetic is unchanged),
`2026-08-23-2023-actual-categories-and-tags` (the envelope is the transaction's category).

Add the D2 divergence to `docs/actual-budget/README.md` under "Where we diverge".

## Task 2: The schema

`src/db/schema.ts` + a Drizzle migration under `drizzle/`.

`financeBudgetCategories` gains, with doc comments carrying over the reasoning from the
retired tables (the Vetsource day-cadence note, the propane `scheduled` note, the
`status`-is-the-whole-answer note — these are the record and must not be lost):

```
kind            text     not null default 'envelope'   check in ('envelope','bill')
status          text     not null default 'active'     check in ('active','paused','cancelled')
cancelled_on    date
url             text     not null default ''
cadence_months  smallint
cadence_days    smallint
due_day         smallint
anchor_date     date
scheduled       boolean  not null default true
expected_cents  integer
```

Constraints: a `bill` row must have `cadence_months`; an `envelope` row must have every
bill column null and `status = 'active'`. Carry over the range checks
(`cadence_months` 1–24, `cadence_days` 2–200, `due_day` 1–31). `hidden` stays orthogonal —
it folds a row away; `status` states a fact about the obligation.

`financePayees`: drop `commitment_bill_id`, `commitment_spend_id` and the
`finance_payees_single_commitment` CHECK; add `budget_category_id` (`on delete set null`)
and `not_a_commitment boolean not null default false`.

Drop: `financeRecurringBills`, `financeRecurringSpend`, `financeSchedules`,
`financeBudgetCategories.source_bill_id`, `financeCategoryGroups.source_commitment_key`,
`financeTransactions.schedule_id`.

## Task 3: Guarded data cutover

Follow the pattern the last three cutovers used (previewed, re-runnable, receipt written
before the destructive step — see `budget/commitmentsImportMutations.ts` and
`financeCategoryCutovers`). One transaction, `userId`-scoped throughout:

1. **Receipt first** — record every bill's name/cadence/next-due/annual cost, every
   recurring-spend rate, every payee claim, and the current Ready to Assign and per-envelope
   balances, so the post-cutover comparison is mechanical.
2. **Bills** — for each `finance_recurring_bills` row, if an envelope already points at it
   via `source_bill_id`, promote that envelope to `kind = 'bill'` and copy the bill facet
   onto it; otherwise create the envelope under `Spending › Bills › ‹group›` exactly as
   `planCommitmentsImport` does. Non-active bills (`paused`, `cancelled`) promote too and
   carry their status; `ignored` rows become `finance_payees.not_a_commitment` and create
   no envelope.
3. **Recurring spend** — one ordinary envelope each under a `Spending › Everyday` group,
   with a `simple` monthly template seeded from `recurringSpendRate` (weekly rate × 52 ÷
   12; `pinned` rows use `expected_cents`).
4. **Claims** — rewrite each payee's `commitment_bill_id` / `commitment_spend_id` to
   `budget_category_id`.
5. **Templates** — delete every `{type: "schedule"}` template line; the bill row's own
   cadence replaces it. Refuse the cutover if a schedule template points at a schedule with
   no corresponding bill, rather than silently dropping funding.
6. **Drop** the three tables and the dead columns.

`*.integration.test.ts` beside it, and it is not done until a second user has tried to read,
change and delete the first user's rows and failed at every step.

## Task 4: Bill-envelope domain logic

Keep and re-point, in `src/lib/finances/`:

- `recurringBills.ts` — `cadenceOf`, `nextDueDate`, `nextDueFrom`, `annualCents`,
  `detectCadence`, `billAnchor` all survive; retype them against the envelope row. This is
  the machinery D2 chose, so it stays intact.
- `budget/templates/schedule.ts` — `isPayThisMonth` and the sinking-fund split re-point
  from a `ScheduleSnapshot` to the bill facet on the row. A bill's demand is computed, not
  stored as a template line; `budget/templates/apply.ts` gains bill envelopes as an
  implicit demand source ahead of `remainder`.
- `commitments.ts` — keep `projectForwardMonths` / `projectForwardPayPeriods` (Next 12
  Months) and the cost math; delete `StoredSpend`, `recurringSpendRate`, `periodIndex` and
  the tier-2 clamp.

Delete: `src/lib/finances/schedules/` entirely (`conditions.ts`, `recur.ts`, `nextDate.ts`,
`discover.ts`, `fromBill.ts`, `match.ts`, `status.ts`, `upcoming.ts`, mutations, queries),
`assignment.ts`, and the `setAsideHeld` / commitment half of `available.ts`. Keep
`available.ts`'s cash position, card debt and payday series.

Every pure module keeps its `foo.test.ts` beside it; the ones for deleted modules go with
them.

## Task 5: The merged page

`src/app/finances/budget/page.tsx` + `src/components/finances/budget/`.

- One `DataGrid` over the existing group tree, now with `GridToolbar` / `useModuleViews`
  (module id `finance-budget`) for filters, Show Fields, saved views and export — replacing
  the bare `useGridState` at `BudgetView.tsx:88`.
- Columns: Envelope, **Next charge**, **Cadence**, **Amount**, **Status**, **URL**,
  Assigned, Activity, Balance, plus hideable **A year / Monthly / Pay period**. Bill columns
  render `—` on ordinary envelopes. Borrow the cells from `commitmentColumns.tsx`
  (`dollarsInput`, the URL link cell, `CadenceSelect`, `FundingMeter`) rather than writing
  them twice — that duplication is one of the things this spec exists to remove.
- **Income section** above the grid: received this month, expected from
  `incomeFromPaydays`, and the note that Ready to Assign counts only received.
- Totals footer sums bills and envelopes together (`budgetTotals` over all non-income rows).
- Row menu gains the bill commands: Pause / Cancel / Reactivate, Edit bill…, Open URL.
- **Review** as a page command with a count badge, opening `ReviewList` in a drawer.
- `<details>` for **Next 12 months** (`ForwardPanel`) and **Expected vs income**, collapsed.
- Delete `AddFromSchedulesDialog` and `CommitmentsImportDialog` — both are bridges between
  systems that no longer exist.

## Task 6: Re-point the rest of the app

- **Register** — `Track as bill…` creates a bill envelope plus the payee claim (reuses
  `TrackAsBillDialog`, new mutation). Upcoming preview rows come from bill-envelope cadence
  instead of schedules; transaction↔schedule linking goes with `schedule_id`.
- **Dashboard** — delete the Available to Spend headline and the stacked claims bar; the
  spendable panel becomes Ready to Assign, underfunded bill envelopes, and charges due in
  the next 14 days. `dashboardQueries.ts` and `analytics.ts` lose their commitment reads.
- **Categorisation** — `finance_payees.budget_category_id` is consulted where the
  commitment claim was, at the same precedence (row override > payee claim > rules >
  learning). No change to the rules engine itself.
- **Find** — `src/lib/find/{sources,targets,searchable,queries,types}.ts` drop the
  commitments and recurring-spend sources; budget envelopes become the searchable target.
- **Agent tools** — `src/lib/agent/{financeTools,tools,contracts}.ts`:
  `upsert_recurring_bill` → `upsert_bill_envelope`, `upsert_recurring_spend` and
  `delete_commitment` retire, `list_commitment_candidates` re-points at Review. This is a
  deliberate strict-schema break, as `commitments-clarity` D1 was.
- **Nav** — `src/lib/navigation/pages.ts` drops the `schedules` and `commitments` entries
  and folds their keywords into `budget`. Delete both route folders.

## Task 7: Verify, freeze spec, update roadmap

- `npm run lint`, `npm run typecheck`, `npm run test:unit` — **check for the Postgres skip
  warning**; the integration tests are the ones that matter here.
- `npm run build`, then `npm run dev` and **`npm run smoke`** — 61 routes after the two
  deletions. A green gate is not proof the app runs, and this change touches nearly every
  `src/app/finances/**` module.
- Run the cutover against the real file and diff every figure on the receipt from Task 3.
  Push to `master` so it can be checked on the phone.
- Mark `plan.md` / `shape.md` **frozen / complete**, complete **Changes from original
  plan**, move leftovers to **Follow-ups**.
- Roadmap: close the Commitments/Schedules/parallel-systems line, and note that
  "Shortfall attribution" is now answered per bill envelope.

---

**Standing rule while this spec is active:** material changes to requirements, design or
scope — including your feedback on what gets built — go into `plan.md` / `shape.md` and get
a row in **Changes from original plan**. Skip pure implementation details.
