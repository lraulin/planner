# Zero-based budgeting — an envelope budget beside Available to Spend

**Status: active**
Spec folder: `agent-os/specs/2026-08-22-1948-zero-based-budget/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-16-1338-finances-dashboard-available/` — the cash
  position, the on-budget account set (`SPENDABLE_KINDS` plus the full card balance), and
  payday detection.
- **Extends:** `agent-os/specs/2026-08-18-2005-period-result/` — `positionAt` / `balancesAt`,
  which reconstruct a historical balance by anchoring to today's headline and walking back.
  That is how the budget gets its opening figure without backfilling history.
- **Extends:** `agent-os/specs/2026-08-21-1122-commitments-curation/` — the category a
  commitment carries, which feeds the auto-map.
- **Supersedes:** `agent-os/specs/2026-08-16-1938-commitments/` — **D0's tier-3 rejection
  only.** Every other decision in that spec stands: the two tiers, the two tables, the shared
  accrual arithmetic, the cadence admission test for tier 2. Both tiers keep running untouched
  and keep feeding Available to Spend.

## Context

Available to Spend works. That is the problem.

The headline subtracts the full forward accrual of every declared bill from present cash
(`src/lib/finances/available.ts`). As the bill list approached completeness — and especially as
the large annual bills that were never being saved for went in — the number went deeply negative
and stayed there. A large negative Available to Spend carries exactly one instruction: _spend as
little as possible_. That was already true before the app said it, and it cannot be acted on,
because the next twelve days will not cost zero dollars.

The diagnosis is not that the arithmetic is wrong. The app is finally telling the truth, and
that is the feature working. It is that **one collapsed number cannot express partial
funding.** Underfunding four annual bills by $300 each reads identically to being $1,200 short
this week, and only one of those has a move attached to it.

Zero-based/envelope budgeting expresses the same facts differently: you assign only money you
actually have, each envelope shows how funded it is, and being short is a per-envelope fact you
can attack in priority order. "Roll with the punches" — moving money between envelopes — is the
mechanic Available to Spend structurally cannot offer, because there is nowhere to move money
from.

**This reverses a decision recorded in the schema itself.** `2026-08-16-1938-commitments` D0
says tier 3 is "a deliberate non-feature… per-category discretionary envelopes encode a decision
the user already makes correctly on the fly," and the doc comment on `finance_recurring_spend`
repeats it. The reversal is narrow, and the user named its terms: the busywork they blamed on
YNAB came from adopting YNAB's _default suggested category list_ and then shuffling money
between two dozen envelopes. That was a configuration choice, not a property of envelope
budgeting; a single Discretionary envelope would have served better. **D0's reasoning holds
for the category list. It does not hold for the model.** D5 below is what keeps the reversal
honest.

[Actual Budget](https://github.com/actualbudget/actual) (MIT, cloned at `../actual`) is a mature
open-source implementation of exactly this model. Its budget semantics are precise, load-bearing,
and easy to get subtly wrong, so we reimplement them deliberately rather than reinvent them.

### Confirmed scope decisions

- **First slice: the Budget page only.** Schedules, Rules, Payees and Reports are follow-on specs.
- **New user-editable category tables**, seeded from the existing taxonomy. Transactions gain a
  nullable FK; the existing string columns and the classifier are untouched.
- **Fully parallel.** Dashboard, Available to Spend and Commitments keep running exactly as they
  are. Which system survives is a later decision made from use, not from this spec.
- **Fresh start at the current month.** History is not backfilled with assignments.

---

## Decisions

### D1 — Actual's envelope math, reproduced exactly

Ported in prose from `packages/loot-core/src/server/budget/envelope.ts` and `base.ts` (MIT,
© James Long). All integer cents. Sign convention is ours — **positive is money in** — so
spending activity is negative, which happens to match Actual's.

Per category, per month:

```
balance(c, m) = assigned(c, m) + activity(c, m) + carryIn(c, m)

carryIn(c, m) = carryover(c, m-1) ? balance(c, m-1) : max(0, balance(c, m-1))
```

`activity(c, m)` = signed sum of transactions in month `m` whose `budgetCategoryId` is `c`, **on
on-budget accounts only**, excluding internal transfers.

A positive balance always rolls forward. A negative balance rolls forward **only** if that
category's `carryover` flag was set for the prior month; otherwise the overspend is absorbed by
the next month's Ready to Assign. That is the mechanism that makes overspending somebody's
problem rather than silently disappearing.

Per month:

```
fromLastMonth(m)      = readyToAssign(m-1) + buffered(m-1)
totalIncome(m)        = Σ activity over income categories in m
availableFunds(m)     = totalIncome(m) + fromLastMonth(m)
lastMonthOverspent(m) = Σ over expense c with carryover(c, m-1) false: min(0, balance(c, m-1))   // ≤ 0
totalAssigned(m)      = Σ assigned over expense categories in m

readyToAssign(m) = availableFunds(m) + lastMonthOverspent(m) − totalAssigned(m) − buffered(m)
```

`buffered(m)` is Rule 4 — money deliberately held back for the following month. It is a
deferral, not a sink: it reduces this month's Ready to Assign and reappears in
`fromLastMonth(m+1)`.

**Five details that are easy to get wrong. Each gets a named test.**

1. The `carryover` flag consulted by month `m` is the one stored on month `m-1`.
2. `lastMonthOverspent` must skip categories whose prior month had `carryover` true, or the
   overspend is counted twice — once in the category and once against Ready to Assign.
3. Income categories have **no allocation and no balance**. Income only feeds `availableFunds`.
   (Actual repurposes the carryover flag on income categories to mean "hold this income for next
   month"; that is out of this slice.)
4. A missing allocation row means `amount = 0, carryover = false`. Storage is sparse; every
   derived value treats absence as zero, never null.
5. Everything is integer cents, asserted. Actual's `safeNumber` throws on a non-integer and our
   arithmetic should be equally intolerant.

### D2 — The base case is an opening position, not backfilled history

At the **budget start month** `S`, every prior balance is zero and
`fromLastMonth(S) = openingCents`, the on-budget cash position on the day before `S` began.
Reuse `positionAt` / `balancesAt` in `src/lib/finances/periodResult.ts`.

This preserves Actual's load-bearing invariant, which is also the best test available:

```
readyToAssign(m) + Σ_c balance(c, m)  ==  on-budget position at end of m
```

…exactly when every on-budget transaction from `S` forward carries a budget category. So the gap
between the two sides **is** the uncategorized backlog. The page reports it rather than hiding
it, and that is what makes the budget self-auditing instead of quietly drifting.

### D3 — On-budget is checking + cash + credit cards; savings and investments are off

This is the user's stated model, already encoded in `SPENDABLE_KINDS` and the decision to
subtract the full card balance rather than the statement minimum. Card purchases are ordinary
categorized spending; card payments are transfers between two on-budget accounts and are
budget-neutral. Actual does the same, and deliberately has no YNAB-style credit-card payment
categories — nothing here needs one either.

`finance_accounts` gains an explicit `off_budget` column, seeded from kind, editable on the
existing Accounts page. Deriving it from `kind` alone would work today and break the first time
a savings account is used as a spending account.

A negative opening position is honest, and it is **not** the failure Available to Spend has.
Ready to Assign goes negative only when you assign more than you hold — a state you fix by
assigning less. It never goes negative because a bill twelve months out is unfunded; that shows
up as one envelope's balance, sitting next to the other four.

### D4 — Budget categories are a new dimension, not a rename of the taxonomy

`FINANCE_CATEGORIES` stays exactly as it is: a code constant, the classifier's output, and the
axis every Insights chart is built on. Budget categories are a separate, user-editable hierarchy
the transaction can also carry. The tables are named `finance_budget_categories` /
`finance_category_groups` so no later reader confuses the two, and no Insights number moves.

### D5 — Setup offers a Minimal preset, and recommends it

The failure the user named was too many envelopes, so the product's opinion has to be visible at
the one moment it matters. First visit offers:

- **Minimal (recommended)** — `Income` / `Bills` / `Recurring spend` / `Discretionary` /
  `Savings`.
- **Detailed** — one envelope per `FINANCE_CATEGORIES` entry, grouped.

Either way the D6 auto-map fills Activity, so the grid is never empty on arrival and the first
assignment is made against real numbers.

### D6 — Transactions get a budget category by auto-map, then by hand

New nullable `finance_transactions.budget_category_id`. A backfill pass sets it, for transactions
from the start month forward, by matching `effectiveCategory(row)` (and `effectiveFlow` for
income) against budget-category names. The Register gains an editable **Envelope** column; the
Budget page shows a live "N transactions this month have no envelope" tray linking to the
filtered Register.

The rules engine is explicitly out of this slice. The auto-map is a one-shot backfill plus the
same mapping applied on import, not a user-authored rule system.

### D7 — Every affordance is an arithmetic edit of one allocation number

Actual has no "transfer" record. Cover-overspending, move-money, assign-remaining,
copy-last-month, N-month-average and hold-for-next-month are all clamped edits of
`(month, category, amount)` and `buffered`. Copy that: the ledger stays one table and every
operation is a pure function that is trivially testable.

The clamps **are** the semantics, and are ported as written
(`packages/loot-core/src/server/budget/actions.ts`):

- `coverOverspending(from, to)` — `coverable = min(|balance(to)|, balance(from))`; a no-op if the
  target is not negative or the source has no positive balance.
- `transferAvailable(cat, amt)` — `clamp(amt, 0, readyToAssign)`.
- `holdForNextMonth(amt)` — only when `readyToAssign > 0`;
  `buffered' = buffered + clamp(amt, −buffered, max(readyToAssign, 0))`.
- `setCategoryCarryover` is a **"from here on" toggle**: it sets the flag on the chosen month and
  every later month that exists, not just the one cell. The row menu says so, because a toggle
  that silently rewrites twelve rows is the kind of thing `commitments-clarity` was written about.

Actual also appends a plain-English line to the month's note on every movement — _"Reassigned
$12.34 from Groceries → Dining on August 22"_. That is a cheap and genuinely useful audit trail,
so `finance_budget_months` carries a `notes` column and the movement mutations append to it.

### D8 — Attribution

Actual is MIT. The math module carries a header comment naming the source files, the project and
the license. `docs/actual-budget/README.md` records that `../actual` is the local reference for
budget semantics — the same pattern as `docs/achieve-planner/` — and `CLAUDE.md` points at it.

---

## Out of scope

Named rather than omitted, because Actual has each of them and they are the obvious next specs.

- **Goal templates** — `#template $50 by 2025-12`, percentage-of-income, schedule-based and
  `remainder` templates with global priority ordering
  (`packages/loot-core/src/server/budget/goal-template.ts`). The single strongest follow-on: it
  is how an envelope budget stops being manual, and it is the road back to "on autopilot".
- **Schedules**, and the calendar badge Actual draws on a category whose schedule is due. Our
  declared bills already hold that information; wiring them in is a delta spec.
- **Rules / payees** — auto-categorization on import beyond the D6 mapping.
- **Reports** on the budget axis; the **tracking** (non-envelope) budget type; multi-month
  side-by-side columns; income carryover as "hold this income for next month".
- **Merging with Available to Spend.** Deliberately deferred until both have been lived with.

## Acceptance criteria

- [ ] `/finances/budget` shows a month grid: groups → categories, with **Assigned / Activity /
      Balance**, and month navigation via `?month=YYYY-MM`.
- [ ] A summary header reads Funds from last month, Income, Assigned, Overspent last month, and
      **Ready to Assign**, and its terms sum to the headline.
- [ ] Assigning an amount inline updates Ready to Assign and the category balance immediately.
- [ ] Money moves from one envelope to another in one gesture, and moving it changes nothing
      outside those two envelopes.
- [ ] A positive balance rolls into next month. A negative one does not, unless that category's
      **Roll over overspending** toggle is on — in which case next month's Ready to Assign is
      unaffected by it.
- [ ] `readyToAssign + Σ balances` equals the on-budget position whenever nothing is
      uncategorized, and the page names the discrepancy when something is.
- [ ] Dashboard, Available to Spend and Commitments produce identical numbers to before.
- [ ] Setup creates a working budget from either preset in one click, with Ready to Assign seeded
      from the real opening position.
- [ ] A second user cannot read, change, or delete the first user's categories, allocations, or
      budget months.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

---

## Task 1: Save spec documentation

Create this folder with `plan.md`, `shape.md`, `standards.md`, `references.md`.

## Task 2: Schema and migration

In `src/db/schema.ts`, following the finance conventions already in that file — integer cents,
`userId` cascade, `text` + CHECK over `pgEnum`, `date(..., {mode:"string"})`, doc comments that
explain _why_:

- `finance_category_groups` — `id, userId, name, isIncome, sortOrder, hidden, timestamps`;
  unique `(userId, name)`.
- `finance_budget_categories` — `id, userId, groupId → groups (cascade), name, sortOrder, hidden,
notes, timestamps`; unique `(userId, groupId, name)`.
- `finance_budget_months` — `id, userId, month (first of month), bufferedCents, notes`;
  unique `(userId, month)`.
- `finance_budget_allocations` — `id, userId, month, categoryId → categories (cascade),
amountCents, carryover`; unique `(userId, month, categoryId)`. **Sparse** — a missing row is
  zero, so nothing pre-creates rows for untouched months.
- `finance_transactions.budget_category_id` — nullable FK, `on delete set null`; index
  `(userId, budgetCategoryId, transactionDate)`.
- `finance_accounts.off_budget` — `boolean not null default false`, backfilled from kind in the
  migration (`savings`, `investment`, `loan`, `other` → true).

Budget start month lives in `user_settings` scope `budget`, with a codec in
`src/lib/settings/finances.ts` beside `PaydaySettings`.

Generate the migration with drizzle-kit; never hand-write one (`database/migrations`).

## Task 3: The envelope math, pure and tested

New `src/lib/finances/budget/envelope.ts`. No DB, no React, integer cents, MIT attribution
header. Roughly:

- `type MonthKey = string` (`"YYYY-MM"`) with `prevMonthKey` / `monthKeyRange`, built on the
  existing date utilities — never `startOfDay` on a calendar field (`development/dates`).
- `buildBudget(input): BudgetView` — takes categories, allocations, per-category-per-month
  activity, buffered amounts, the start month and `openingCents`; walks months forward applying
  D1; returns each category's `assignedCents` / `activityCents` / `balanceCents` plus the month
  summary and a `terms[]` array in the `AvailableToSpend.terms` style, so the UI cannot render a
  breakdown that fails to sum to its own headline.
- The D7 operations as pure clamped-delta functions — `coverOverspending`,
  `transferBetweenCategories`, `transferAvailable`, `holdForNextMonth`, `copyPreviousMonth`,
  `setToNMonthAverage`, `setZero` — each returning the allocation writes to perform, so the
  mutation layer is a thin applier and every clamp is unit-testable without a database.

The fold runs in TypeScript rather than a recursive CTE: months are few, activity is one grouped
query, and `development/testing` wants the tricky reasoning in `src/lib/**` where a wrong answer
looks plausible. Compute the window from the start month to `current + 12`.

`envelope.test.ts` beside it, table-driven against hand-computed cents. Covers each of D1's five
traps by name, plus a negative balance absorbed by the next Ready to Assign; `buffered` shifting
funds forward and reappearing; a category created mid-stream; every D7 clamp at its boundary; and
the D2 invariant as a property over generated ledgers.

## Task 4: Queries, mutations, and the auto-map

- `src/lib/finances/budget/queries.ts` — `loadBudget(userId, month)`: groups, categories,
  allocations over the month window, per-category monthly activity as **one grouped SQL query**
  (mirroring `getSumAmountsByMonth` in Actual's `base.ts`), buffered rows, the on-budget position
  via `positionAt`, and the month's uncategorized count.
- `src/lib/finances/budget/mutations.ts` — `userId` first, each scoped and ownership-proved
  (`development/security`): `setAllocation`, the D7 movement ops (applying Task 3's pure
  functions and appending the movement note), `setCarryover`, `setBuffered`, `createCategoryGroup`
  / `createBudgetCategory` / `renameBudgetCategory` / `reorderBudgetCategory` /
  `hideBudgetCategory` / `deleteBudgetCategory`, `setTransactionBudgetCategory`,
  `seedBudget(preset, startMonth)`, `autoMapBudgetCategories`.
- Thin `"use server"` wrappers in `src/app/finances/actions.ts` returning `ActionResult` /
  `DataActionResult<T>`, matching the existing commitment actions.
- `budget/mutations.integration.test.ts` — the cross-user pass is mandatory: a second user
  attempts to read, change and delete each of the first user's rows and fails at every step.

## Task 5: The Budget page

`src/app/finances/budget/page.tsx` — async RSC, `getCurrentUserId()` → `loadBudget`, inside
`AppShell` + `Suspense`, matching the other finance pages. Register it in
`src/lib/navigation/pages.ts` after `commitments`, with a command so it is reachable from the
menu bar and ⌘K (`components/navigation`).

`src/components/finances/budget/BudgetView.tsx` and friends:

- The shared `DataGrid` with group → category tree rows and three numeric columns. **Assigned**
  is inline-editable, committing on blur (`components/ux-principles`); balance cells are coloured
  by sign and open the row menu.
- Month navigator writing `?month=YYYY-MM`; the summary header above the grid.
- Row menu: **Cover overspending from…**, **Move money to…**, **Roll over overspending** (worded
  as the from-here-on toggle it is), **Assign remaining**, rename, hide, delete.
- Month actions: **Copy last month**, **Set to 3-month average**, **Set all to zero**, **Hold for
  next month**.
- The uncategorized tray, linking to `/finances/register` filtered to the month's unenveloped rows.
- Below `md`: list + full-screen sheet, 44px targets, long-press for the row menu
  (`components/responsive`).

## Task 6: Setup, Register column, and the auto-map surface

- Empty state on `/finances/budget`: the D5 preset chooser, calling `seedBudget` then
  `autoMapBudgetCategories`, recording the start month and opening position.
- Register gains an **Envelope** column (editable select, hideable like every other column) and a
  **Set envelope** row-menu command.
- `off_budget` becomes an editable field on `/finances/accounts`.

## Task 7: Verify, freeze spec, update roadmap

- `npm run test:unit`, and confirm the DB tests did **not** skip (check for the Postgres skip
  warning after touching `mutations.ts` / `queries.ts`).
- Typecheck, lint, `next build`.
- Start the dev server and run **`npm run smoke`** — a new route under `src/app/**` is exactly the
  case that gate exists for.
- Drive it in a browser: seed Minimal, assign against the real opening position, overspend one
  envelope, cover it from another, roll one forward, page to next month and confirm the carry-in.
- Confirm Dashboard / Available to Spend / Commitments are numerically unchanged.
- Complete **Changes from original plan**; mark `plan.md` and `shape.md`
  **Status: frozen / complete**.
- Update `agent-os/product/roadmap.md` § Financial planning: record that envelopes were reopened,
  why D0's reasoning was narrowed rather than discarded, and that the two systems now run in
  parallel pending a decision from use.

---

> **While this spec is active:** update `plan.md` / `shape.md` and append to **Changes from
> original plan** on any material change to requirements, design or scope — including feedback on
> what was actually built. Skip pure implementation details. Freeze when verified.
