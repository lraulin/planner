# Month-ahead zero-based budget

**Status: frozen / complete** (2026-08-25)  
Spec folder: `agent-os/specs/2026-08-25-1154-month-ahead-zero-based/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` — envelope fold, integer cents, opening-position base case. Carryover, overspend absorption, and per-month allocations stay.
- **Extends:** `agent-os/specs/2026-08-23-2313-one-budget/` — the Budget page is the only budgeting surface; a bill envelope's funding demand is intrinsic to its cadence.
- **Extends:** `agent-os/specs/2026-08-24-1311-budget-assign-options/` — Assign is YNAB-shaped and clamped to Ready to Assign; Underfunded's ask is `demandOf` + cover-overspend.
- **Extends:** `agent-os/specs/2026-08-24-2206-single-pool-budget/` — current Ready to Assign reconciles to today's account pool; historical months stay historical.
- **Supersedes:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` **D1 `buffered` / D7 `holdForNextMonth` as Rule 4.** Rule 4 is now: assign leftover money into a future month's categories. Hold is removed from the product. The fold may still read `buffered_cents` (always-0 or leftover) so we do not need a schema drop this slice.
- **Supersedes:** `agent-os/specs/2026-08-23-2313-one-budget/` **D4** only the Actual schedule-template behavior that **sinks a monthly (`n = 1`) bill across months.** A monthly bill asks for its full amount in the month it is due and $0 in every other month. Yearly/quarterly sinking is unchanged.
- **Supersedes:** `agent-os/specs/2026-08-21-1403-commitments-expected-vs-income/` **D1/D3 pay-period column**, as carried onto Budget by `one-budget` D8 — Budget no longer annualizes bills over 26 paychecks or offers a pay-period forecast axis. Insights keeps its pay-period reporting axis.

## Context

The envelope budget shipped, then merged with Commitments, then became one pool. Two paycheck-to-paycheck leftovers are still on `/finances/budget`:

1. **Monthly bills still split in two.** `billFundingDemand` uses Actual's sinking formula `remaining / (monthsUntilDue + 1)`. A monthly bill whose next charge is next month therefore asks for **half** in this month. The already-funded fallback (`baseMonthlyContribution` = `amount / 1`) can also ask for a second full month in the current envelope. That is accruing next month's rent in this month — the old per-paycheck set-aside, not monthly zero-based budgeting.
2. **Budget still speaks pay period.** Expected vs Income has a Pay period column (`annual / 26` ≈ half of monthly). Next 12 months still has a Pay periods axis. `paycheckCents` is still computed on every bill row.

Zero-based budgeting assigns money you have, **per calendar month**. YNAB Rule 4 — stop living paycheck to paycheck — is: once this month is covered, give leftover dollars a job in **next month's** categories so the 1st arrives already funded. When you are a month ahead, it does not matter which day the paycheck lands.

Actual's Hold-for-next-month is a lump with no job except "later." We already have leftover Ready to Assign rolling into `fromLastMonth`. YNAB is the smaller step: navigate forward and assign into those categories; those dollars leave current Ready to Assign immediately. No auto-hold, no Age of Money, no copy-forward-the-year.

Dashboard "X days until payday" and Insights' month vs pay-period charts stay. Those are calendar/reporting, not a budgeting period.

## Decisions

### D1 — A monthly bill is a this-month ask, not a two-paycheck accrual

For `cadence.unit === "month" && cadence.n === 1` (and only that):

- **Due in the viewed month** (`monthsUntilDate === 0`): demand is the full `expectedCents` (same as today's pay-this-month branch).
- **Any other month:** demand is `0`. Next month's rent is funded by opening next month and assigning there.
- **Already funded** (`carryIn >= expected`): demand is `0`. Do not fall through to `baseMonthlyContribution` (which is another full month for `n = 1`).

Unchanged:

- Yearly / quarterly / `n > 1` month cadences still sink: `remaining / (monthsUntilDue + 1)`, and still use the already-funded monthly-rate fallback.
- Day cadences (weekly, biweekly, 28-day) still sum occurrences **in the viewed month**.

This is a recorded divergence from Actual's `schedule-template.ts`. Named in `docs/actual-budget/README.md`.

### D2 — Rule 4 is assign-into-a-future-month, not Hold

Drop **Hold for next month** from the month bar, commands, and `budgetOperation`. Keep `buffered_cents` in the schema and fold so existing rows and the identity do not need a migration. If a month still has `bufferedCents > 0`, leave a one-way **Release** until it is zero (otherwise that money has no UI). Do not add new holds.

Leftover Ready to Assign already becomes next month's `fromLastMonth`. Assigning in a future month already writes that month's allocation rows. What is missing is the YNAB display: those future jobs must leave **this** month's Ready to Assign.

### D3 — Ready to Assign on current and future months is leftover after later assignments

The fold's per-month arithmetic stays. After it, for every month `M` in the fold where `M >= currentMonth`:

```
assignedLater(M) = Σ totalAssigned over months > M (inside the fold)
displayedRTA(M)  = foldRTA(M) − assignedLater(M)
```

Add a term **Assigned in future months** (`−assignedLater`) so `terms` still sum to the headline. Past months (`M < currentMonth`) keep their historical fold RTA (single-pool D3).

Consequence: August, September, and October all show the **same** leftover number once future income is zero — YNAB's "the accurate Ready to Assign lives in the furthest month you've assigned into."

Current-month pool identity becomes:

```
accountPool =
  displayedRTA
  + current envelope balances
  + assigned in future months
  + buffered (0 unless a leftover hold)
```

Do **not** change how `accountReconciliationCents` is computed (it is the residual against fold RTA + balances + buffered + uncategorized). The new term is applied after that, so the identity above holds by construction.

Assign (clamped) uses the **displayed** Ready to Assign of the month on screen. Inline Assigned-cell edits stay unclamped (already true). Over-assigning by hand can still make a later month's Ready to Assign negative; the fix is to move money back — same as YNAB, no extra machinery.

### D4 — Any future month, no hard gate

Month navigation already reaches `BUDGET_HORIZON_MONTHS` (12). You may assign in any of them. There is no block requiring current-month RTA = $0 or underfunded = 0. When viewing a future month, if the **current** month still has underfunded envelopes (Underfunded gap > 0), show a single muted note: this month still has envelopes to cover — assigning here is how you get ahead, but current-month holes are the first job. Do not mention paychecks.

### D5 — Budget drops the pay-period axis

On `/finances/budget` only:

- Expected vs Income: Monthly and A year. No Pay period column. Copy talks about a typical month, not a typical paycheck.
- Next 12 months: calendar months only. Delete the Pay periods toggle.
- `BillRow.paycheckCents` / `MoneyTotals.paycheckCents` / `SpendingVsIncome.*.paycheckCents` go away if nothing outside Budget+those panels reads them (verify; Insights uses its own analytics, not these fields).

Out of scope (leave them):

- Insights month vs pay-period charts and `PAYCHECKS_PER_YEAR` in `classify/income.ts`.
- Jobs `payPeriod`.
- Dashboard payday countdown next to Ready to Assign.
- Detected paydays as the Income section's expected-income forecast.

### D6 — Keep the rest of Assign

Underfunded, Assigned Last Month, etc. already take the viewed `month`. After D1, Underfunded in August will not half-fund September rent; Underfunded in September will ask for the full amount. No new auto-assign option. No "copy last month's budget across the year."

## Acceptance criteria

- [x] A monthly bill due this month still asks for the full amount; the same bill due next month asks for $0 **this** month and the full amount in next month. A test names this; it would fail on today's `/ (monthsUntil + 1)` formula.
- [x] A yearly/quarterly bill still sinks over the months until due (existing tests stay green).
- [x] Assigning $X to an envelope in a future month reduces current (and other current-or-future) Ready to Assign by $X and shows **Assigned in future months**. The current-month pool identity still holds, now counting that $X.
- [x] Hold for next month is gone. A leftover `bufferedCents > 0` can still be Released; new holds cannot be created.
- [x] Expected vs Income and Next 12 months on Budget have no pay-period column or axis. Bill rows no longer compute `paycheckCents`.
- [x] Viewing a future month with current-month underfunded envelopes shows the note, and Assign still writes.
- [x] Historical months' Ready to Assign is not rewritten by today's future assignments.
- [x] A second user cannot read or change the first user's future-month allocations.
- [x] `docs/actual-budget/README.md` records D1 and D2 as divergences.
- [x] Lint, typecheck, budget unit+integration (Postgres up), and `npm run smoke` on the running dev server. Browser: Hold gone; Expected vs Income is Monthly/A year; Next 12 months is calendar months; assigning $10 to September Rent dropped August Ready to Assign by $10 and showed Assigned in future months. `npm run build` skipped while the dev server is up (they fight over `.next`).

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                        | Why                                                                                                       |
| --- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | Underfunded order fixture for Geico needed `cadenceMonths: 6` | Default `snapshot()` is monthly; after D1 a monthly bill due next month is not an underfunded line at all |

## Task 1: Save Spec Documentation

Create this folder with `plan.md` (this file, **Status: active**), `shape.md`, `standards.md`, `references.md`.

## Task 2: Monthly bill demand is per calendar month

In `src/lib/finances/budget/templates/schedule.ts` (`billFundingDemand`):

- Split the monthly `n === 1` case out of sinking / `baseMonthlyContribution`.
- Tests in `schedule.test.ts` (and `demand` / `apply` if they assume half): rent due 2026-09-01 asks $0 in August and full in September; due 2026-08-01 still full in August; yearly sink tests unchanged.
- Confirm Underfunded in August no longer proposes half of next month's rent (`assign/plan.test.ts` if a fixture exists).

## Task 3: Displayed Ready to Assign after future assignments

In `src/lib/finances/budget/envelope.ts` `buildBudget`:

- Need the current month (`input.current?.month` already names it; when unconfigured/historical-only, skip).
- After the existing fold + reconciliation, for `M >= currentMonth` subtract `assignedLater` and append the term.
- Property tests: terms sum to headline; current pool identity including future assigned; past month RTA unchanged when a future month is assigned; August/September displayed RTA match when September has no income.
- `BudgetSummary` pool sentence: Ready to Assign + envelope balances + assigned in future months (+ held only if buffered > 0).
- Show **Assigned in future months** in the summary whenever the term is non-zero (the term list is enough; no second widget).

## Task 4: Remove Hold from the product

- `BudgetView` month bar: delete Hold. Keep Release iff `bufferedCents > 0`.
- `budgetOperation` / mutations: stop accepting a hold; keep release if it shares the same op and buffered can still be non-zero.
- Delete or stop exporting `holdForNextMonth` from the UI path. Fold + `buffered` column remain. Update `operations.test.ts` so hold is no longer a user-facing op (fold tests that seed `buffered` stay — they prove leftover still moves).
- Copy/tooltips that say "Keep money back so next month starts funded" go away.

## Task 5: Strip pay-period from Budget

- `ForwardPanel.tsx`: drop Pay period column and Pay periods axis; Expected vs Income copy is monthly.
- `expectedSpending.ts` / `commitmentRows.ts` / `dashboardQueries.ts` (`BillForecast`): stop computing and passing `paycheckCents` and `projectForwardPayPeriods` unless another live caller needs them. Delete dead helpers rather than leaving a second unused axis.
- Tests that assert `paycheckCents` on these types are rewritten to monthly/annual only.

Do not touch Insights `payPeriodBuckets` or Jobs.

## Task 6: Future-month Assign UX

- Viewing `month > currentMonth`: Assign already targets that month — verify Underfunded uses D1 demand for that month.
- Add the D4 note (pure helper for "current month still has underfunded envelopes," rendered in `BudgetView` / `BudgetSummary`). No gate.
- Optional one-line on a future month: money assigned here is a job for that month and leaves Ready to Assign now. Keep it short.

## Task 7: Verify, freeze spec, update roadmap

- Named tests from D1 and D3; integration cross-user on a future-month assignment.
- Record D1/D2 in `docs/actual-budget/README.md` (Where we diverge).
- Browser: `/finances/budget` current month — monthly bill not asking for half of next month; assign into next month; Ready to Assign drops; next month shows the assignment; identity line still adds up; Hold gone; Expected vs Income has no Pay period. Also check Dashboard still loads (payday subtitle unchanged).
- `npm run lint`, `typecheck`, `test:unit` (Postgres up), `build`, `smoke`.
- Update `plan.md` / `shape.md` for as-built drift; **Changes from original plan**; mark **Status: frozen / complete** (date).
- `agent-os/product/roadmap.md`: Finances next-item — Rule 4 / month-ahead delivered; earmarked savings stays later.

## Follow-ups (not this spec)

- Dashboard payday framing of Ready to Assign.
- Dropping `finance_budget_months.buffered_cents` once every row is 0.
- Age of Money, auto-hold on income, copy budget forward through the year, Actual Tracking mode.
- Earmarked savings / Goals (roadmap, still open).

---

While this spec is **active**, when we make a material change to requirements, design, or scope (including from feedback on what was implemented), update the relevant sections and append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.
