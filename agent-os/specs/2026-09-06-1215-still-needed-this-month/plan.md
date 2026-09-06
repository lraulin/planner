# Still needed this month

**Status: active**  
Spec folder: `agent-os/specs/2026-09-06-1215-still-needed-this-month/`

## Spec relationships

All **Extends**; this spec supersedes nothing.

- **Extends:** `agent-os/specs/2026-08-24-1311-budget-assign-options/` — `underfundedGapCents`
  and the Underfunded ranking (`compareUnderfunded`) are reused unchanged.
- **Extends:** `agent-os/specs/2026-08-28-1000-ynab-target-engine/` — the target demand the
  gap is built from.
- **Extends:** `agent-os/specs/2026-08-28-2039-target-refill-basis/` — D3, the deadline-free
  floor that "asks this month, ranked last", is why D4 below exists.
- **Extends:** `agent-os/specs/2026-08-25-1310-budget-funding-indicators/` — the per-row
  `moreNeededCents` pill this aggregates. The header must sum to the pills.
- **Extends:** `agent-os/specs/2026-08-29-2206-ready-to-assign-derivation/` — D2's
  derivation-as-equation pattern (labels left, tabular amounts right, rule, total restated)
  is reused for the new disclosure rather than reinvented as chips.
- **Extends:** `agent-os/specs/2026-09-05-1200-finances-envelope-workflow/` — Budget is the
  default finance page and keeps its section order, four money columns and summary chrome.

## Context

Lee asked for a good way to see **how much more money he still needs for the month** —
concretely, _"total needed − total assigned. Since I'm still waiting on the second paycheck
to fully fund everything."_

The app already computes that number and never shows it.

- `underfundedGapCents(month, envelopes, bills)` — `src/lib/finances/budget/assign/plan.ts:112`
  — sums `max(0, neededAssigned − assigned)` over every eligible envelope. That is exactly
  "total needed − total assigned".
- `currentMonthUnderfundedGap(...)` — `src/lib/finances/budget/assign/fromBudget.ts:138` —
  wraps it for the current month and is **already imported by `BudgetView.tsx`**, where its
  only use is `> 0` as a boolean, to decide whether to print one sentence when you have paged
  to a future month (`BudgetView.tsx:1592`). The figure itself is discarded.
- Per envelope the same figure is already on screen as `EnvelopeIndicator.moreNeededCents`
  (`indicator.ts:124`), rendered as an amber pill reading `"$X more needed this month"`.
  There is no total.

So today the only way to answer the question is to read the pills and add them up.

Adjacent numbers that do **not** answer it, and are staying as they are:

- **Ready to Assign** (`BudgetSummary.tsx`) — money without a job. The inverse question.
- **Plan margin** (`FundingPlanSummary`, `incomePlan.ts:30`) — expected regular income −
  planned funding. A whole-month _planning_ figure that ignores what has already landed or
  already been spent, and excludes Savings.

**Outcome:** the Budget header states the shortfall as a figure, beside Ready to Assign, for
the month on screen.

## Decisions

- **D1 — One seam, no second opinion.** The headline is `underfundedGapCents`, unchanged in
  meaning. `plan.ts:95` already records that `neededAssigned` is "the single seam —
  `underfunded`, `underfundedGapCents`, the inspector's Assign and the indicator all read it,
  so none of them can grow a second opinion." The header must sum to the pills below it and
  match the Assign → Underfunded preview. Do **not** add a Savings-excluded variant the way
  `monthlyFundingPlan` does; that would fork the math.

- **D2 — Per-envelope clamp, not a net.** An overassigned envelope contributes `0`; it does
  not offset an underfunded one, because that money is not available without moving it. This
  is already how `underfundedGapCents` behaves; this spec only makes it explicit and tested.

- **D3 — The month on screen.** Computed for the viewed month, from the same
  `assignScanInputs` the grid uses, so the header and the rows beneath it cannot disagree.
  No rollup into next month. The existing future-month sentence at `BudgetView.tsx:1592`
  stays as it is.

- **D4 — The derivation is grouped by section, and Savings is visible.** `eligible()`
  (`plan.ts:51`) admits Savings, and a `balance`/`none` floor asks its whole remaining amount
  this month (`target-refill-basis` D3 — a real shortfall, only ranked last). A large house
  fund could therefore dominate the headline. The answer is not to exclude it, which would
  break D1, but to make it **separable at a glance**: the disclosure subtotals Bills /
  Regular spending / Savings before listing envelopes.

- **D5 — The disclosure also answers "how much has to arrive".** The user's framing is that
  he is waiting on a paycheck. Inside the same collapsed disclosure, after the total,
  subtract Ready to Assign and restate the remainder (clamped at `≥ 0`). Two readings of the
  same question, one calculation, both provably summing. The headline itself stays the
  literal ask: total needed − total assigned.

- **D6 — Amber, never red.** `--goal-unmet` when `> 0`; `--chart-income` when `$0.00`.
  `globals.css` is explicit: red is `--chart-spend`, and an envelope merely short of its ask
  has not spent past Available.

- **D7 — Out of scope.** Income forecasting (there is no per-paycheck expected-amount model,
  only `expectedMonthlyIncomeCents` and `nextPayday()`, so no "income still to come" series).
  A before-payday cash view. Schema changes. New mutations. Any change to Plan margin, Fix
  This, Assign, or the row pills.

## Acceptance criteria

- [ ] `/finances/budget` header shows **Still needed** beside Ready to Assign, for the viewed
      month.
- [ ] It equals the sum of the amber `moreNeededCents` pills on the grid, and equals the
      total the Assign → Underfunded preview would fund given unlimited Ready to Assign.
- [ ] `$0.00` renders green with copy saying every envelope has what it asked for.
- [ ] The disclosure lists Bills / Regular spending / Savings subtotals and their envelopes,
      ranked bills-by-due-date first, and its rows sum exactly to the headline.
- [ ] With Ready to Assign `> 0`, the disclosure ends with the Ready-to-Assign subtraction and
      the remainder that must still arrive.
- [ ] Paging to another month recomputes it; the existing future-month sentence is unchanged.
- [ ] Readable on phone and desktop, both themes.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save spec documentation

Create this folder with `plan.md` (Status: active), `shape.md`, `standards.md` (pinned to
standards commit `a1645dc6cde7`), and `references.md`. No visuals.

## Task 2: `stillNeeded()` in the assign module

In `src/lib/finances/budget/assign/plan.ts`:

```ts
export type StillNeededRow = {
  id: string;
  name: string;
  kind: EnvelopeKind;
  gapCents: number;
};
export type StillNeeded = { totalCents: number; rows: StillNeededRow[] };

export function stillNeeded(month, envelopes, bills): StillNeeded;
```

Same `eligible()` filter, same `neededAssigned`, same `gapOf`. Rows carry only envelopes with
`gapCents > 0`, sorted by the existing `compareUnderfunded`. `totalCents` is the sum of
`rows`, by construction — the `month.terms` invariant, applied here.

Then **redefine `underfundedGapCents` as `stillNeeded(...).totalCents`**, so there is still
one implementation (D1). `AssignEnvelope` already carries `id`, `name` and `kind`
(`assign/types.ts:38`), so no new inputs are needed.

Tests in `plan.test.ts` — pure logic, nothing touches the database, so no integration test:
total equals the row sum; an overassigned envelope contributes `0` and does not offset an
underfunded one; income, hidden, paused and cancelled bills are excluded; a snoozed envelope
contributes only its overspend floor; `underfundedGapCents` returns the same number after the
refactor.

## Task 3: The header figure

`src/components/finances/budget/BudgetSummary.tsx` takes a new `stillNeeded: StillNeeded` prop
and stays presentational — the arithmetic arrives computed, per the component's own doc
comment ("the terms come from the fold, not from this component").

The header row becomes a pair on one baseline, the existing `flex-wrap` handling phone:

```
 $327.15   [Assign]      $2,940.00                   Account pool  $12,481.03
 Ready to Assign          Still needed
```

Ready to Assign keeps `2.25rem` and its existing tone rules; Still needed sits at `1.5rem` in
`--goal-unmet`, or `--chart-income` at zero. Both get a `0.75rem` muted label beneath — Ready
to Assign has none today, and a second unlabelled figure would be ambiguous. No vertical rule
between them: spacing and the labels carry the separation, and a rule survives the wrap
badly. `readyToAssignNote(ready)` and the uncategorized strip are unchanged.

## Task 4: The "What's still asking" disclosure

A second `<details>` sibling to "How this adds up", same chrome, collapsed by default, using
the same `<dl>` equation idiom — labels left, `.tabular` amounts right, hairline before the
total:

```
  Bills                          $1,492.00
    Rent                           $900.00
    Car insurance                  $412.00
    Electric                       $180.00
  Regular spending                 $948.00
    Groceries                      $211.21
    ...
  Savings                          $500.00
    House fund                     $500.00
  -----------------------------------------
  Still needed                   $2,940.00
  Ready to Assign               -$  327.15
  -----------------------------------------
  Still to arrive                $2,612.85
```

Group with `pageSectionOf(kind)` (`rows.ts:151`) plus `kind === "bill"` to split Bills from
Regular spending. The last two lines appear only when Ready to Assign `> 0`, and the
remainder is clamped at `≥ 0`. At `$0.00` the disclosure is replaced by a single line saying
every envelope has what it asked for.

## Task 5: Wire it up

`BudgetView.tsx` already builds `assignInputs` via `assignScanInputs` and already passes
`month` to `BudgetSummary`. Call
`stillNeeded(data.month, assignInputs.envelopes, assignInputs.bills)` in the existing
`useMemo` block beside `indicators`, and pass it down. No page, query, mutation, action or
schema change — `src/app/finances/budget/page.tsx` is untouched.

## Task 6: Verify, freeze spec, update roadmap

- `npm run lint`, `npm run typecheck`, `npm run test:unit`.
- Start the dev server and open `/finances/budget`: confirm the headline equals the sum of the
  row pills, and that the Assign → Underfunded preview total agrees. Page back and forward a
  month. Check the `$0.00` state by funding everything in a scratch month. Phone width and
  desktop, light and dark.
- `npm run smoke` is optional here (nothing under `src/app/**` changes) but cheap; run it.
- Confirm acceptance criteria, complete **Changes from original plan**, mark files
  **Status: frozen / complete** with the date, and add a roadmap entry under the Budget
  lineage in Phase 3 of `agent-os/product/roadmap.md`.

## A note for the implementer

While this spec is **active**, record material changes to requirements, design or scope in
`plan.md` / `shape.md` and append a row to **Changes from original plan**. Skip pure
implementation detail. Freeze when verified.
