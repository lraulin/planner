# Collapse Budget, Schedules and Commitments into one budget

**Status: active** — reopened 2026-08-24 after the first real look at the page. The freeze
below was premature: acceptance was confirmed by the implementer rather than by use, and two
criteria that were ticked had no test behind them. Freeze again only once the page has been
used.

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
gains a single claim column — "this merchant's charges belong to this envelope" — which
means the same thing for a bill and for Pizza. A dismissed Review row stops creating a
fake `status: 'ignored'` bill and becomes `finance_payees.not_a_commitment`.

_Revised by `2026-08-24-1522-category-by-kind-and-history`._ The claim column is
`claimed_budget_category_id` (renamed from `budget_category_id`) so it is not confused
with a learned/fixed default on the same row. The meaning is unchanged. Ingest no longer
runs Rules or the taxonomy auto-map; a claim still files matching historical on-budget
charges when it is created or changed, and later manual corrections stay.

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

**D6 — One page, three sections.** `/finances/budget`. `/finances/schedules` and
`/finances/commitments` are deleted.

_Revised 2026-08-24, from use._ This first read "one page, one grid", and that was a
misreading of "Subscriptions & bills, Schedules, and the bills in Budget can be one UI
element" — one table for the three **bill** representations, not one table for bills and
envelopes together. Built as one grid it put six columns (Next charge, Cadence, Amount,
Status, URL, A year) on every ordinary envelope, reading `—` on two thirds of the rows.

The page is now **Income**, then **Spending** containing a **Bills** table and a **Regular
spending** table:

- Bills keep the Commitments columns, with Assigned / Activity / Balance in place of the
  retired funding meter. Regular spending is Actual's three columns and nothing else.
- Each table carries its own subtotal; one footer under Spending sums both, which is the
  figure that has to agree.
- Income has neither Assigned nor Balance — see D7.
- The sections are **derived**, not user structure: Income from the group's `isIncome`,
  Bills from the envelope's `kind`. A user group whose rows all land in one section renders
  no header, so the seeded "Income" and "Spending" groups became invisible chrome and any
  group made _inside_ a section still shows.

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
      and reproduces today's sinking-fund numbers for the same bills. _Ticked without a test
      on 2026-08-23; `apply.test.ts` now covers a `kind: "bill"` envelope, and the real file
      dry-runs to 1Password $8.99 / Geico $119.00 / Rent $2,100.00 / Taylor Gas $164.33._
- [x] The income section shows received and expected for the month, and Ready to Assign
      still counts only received.
- [x] Totals footer sums bills and ordinary envelopes together — now the Spending footer
      under both tables, with a subtotal on each. `budgetSections` is tested for counting
      every spending row exactly once, which is the property that keeps the two agreeing.
- [x] A charge whose payee is claimed by an envelope is **filed in that envelope**. Required
      by Task 6 and missed: the cutover rewrote every claim and nothing read one when filing
      a charge, so every bill envelope showed no Activity at all.
- [x] No page reads a dropped table: `npm run lint`, `npm run typecheck`,
      `npm run test:unit` (with Postgres up), `npm run build`, and `npm run smoke` on a
      running dev server all pass.

## Changes from original plan

| #   | Change                                                                                                                                                                                                                                | Why                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | The grid kept `useGridState` rather than moving to `GridToolbar` / `useModuleViews` (D6).                                                                                                                                             | Bill columns fit inside the existing show/hide + width + density controls without the heavier module-views machinery; that upgrade is real but separable, and nothing in this spec depended on it. Left as a follow-up, not silently dropped.                                                    |
| 2   | Dropped **Pay period** from the hideable annualized trio, keeping only A year / Monthly (D8/Task 5).                                                                                                                                  | Per-paycheck figures need the payday cadence, which the grid's pure column module has no access to without threading payday data through every row; A year and Monthly already answer "what does this cost."                                                                                     |
| 3   | "Bills" vs. "Recurring spend" as two rows of the Expected-vs-income comparison collapsed into one **Bills** row.                                                                                                                      | Recurring spend retired as a tracked tier (D0/D1) — Pizza and groceries are ordinary envelopes now, with no separate comparison line to keep.                                                                                                                                                    |
| 4   | The failed `drizzle-kit migrate` run (mid-implementation) surfaced that four `DROP CONSTRAINT` statements in the drop migration named constraints Postgres had already removed via `DROP TABLE ... CASCADE`, truncated past 63 bytes. | Root-caused and fixed by deleting the four redundant statements with an explanatory comment, then re-verified with a rollback-wrapped dry run before applying for real. Recorded here per the user's "write the cutover first, then migrate" decision.                                           |
| 5   | **Reopened after freezing.** D6 became three sections — Income, then Spending holding a Bills table and a Regular spending table — instead of one grid.                                                                               | The one-grid reading put six bill columns on every ordinary envelope, `—` on two thirds of the rows. The freeze itself was premature: acceptance was self-confirmed rather than confirmed by use.                                                                                                |
| 6   | Payee claims now file a charge in the envelope that claims it (`applyPayeeClaims`), ahead of the taxonomy auto-map, and it **moves rows already filed elsewhere**.                                                                    | Task 6 required this and it was never implemented, which is why every bill read $0.00. Filling nulls only would have left the existing charges pooled forever. A hand placement is not yet distinguishable from an auto-mapped one, so the claim wins — recorded here rather than left implicit. |
| 7   | `DataGrid` gained `autoHeight`, for a grid sharing a scrolling page with another.                                                                                                                                                     | The default fills its parent and scrolls internally, which is right for a grid that _is_ the page and collapses both to a single row when two are stacked.                                                                                                                                       |
| 8   | Claim column renamed to `claimed_budget_category_id`. Ingest no longer consults Rules or taxonomy auto-map (D3 / Task 6).                                                                                                             | `2026-08-24-1522-category-by-kind-and-history` retires Rules and the derived taxonomy. The claim is still the hard envelope relationship; a separate learned/fixed default lives beside it. Change #6's "ahead of the taxonomy auto-map" no longer applies because that map is gone.             |
| 9   | Each Budget DataGrid gets a `commandScope` and the focused one also keeps unscoped File ▸ Export / Copy rows.                                                                                                                         | After D6 became three tables, all three registered `grid.export-csv`. Last-wins silently exported Savings (the last-mounted grid). Same targeting as `navigation.md` dual-grid pages; Copy to Clipboard is the same registration. Combined whole-budget file left as a follow-up.                |

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
`finance_payees_single_commitment` CHECK; add the claim column (`on delete set null`)
and `not_a_commitment boolean not null default false`. Shipped as `budget_category_id`;
renamed to `claimed_budget_category_id` by `2026-08-24-1522-category-by-kind-and-history`.

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
- **Categorisation** — `finance_payees.claimed_budget_category_id` is consulted where the
  commitment claim was. Precedence is now row Category > payee claim > payee learned/fixed
  default > uncategorised (`2026-08-24-1522-category-by-kind-and-history` D7). The rules
  engine is retired; the taxonomy auto-map is retired.
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
