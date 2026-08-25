# References — one pool, every dollar assigned

**Status: frozen / complete** (2026-08-24)

## Governing specs

- [`agent-os/specs/2026-08-22-1948-zero-based-budget/`](../2026-08-22-1948-zero-based-budget/)
  — base envelope fold, opening position, account activity, transfer neutrality, and the D2/D3
  decisions this delta narrows or supersedes.
- [`agent-os/specs/2026-08-23-2313-one-budget/`](../2026-08-23-2313-one-budget/) — retirement
  of Available to Spend and selection of the envelope budget as the one budgeting system.
- [`agent-os/specs/2026-08-24-0930-envelope-sections/`](../2026-08-24-0930-envelope-sections/)
  — income/spending/bill/savings types, permanent peer sections, and ordinary Savings-envelope
  arithmetic.
- [`agent-os/specs/2026-08-24-1311-budget-assign-options/`](../2026-08-24-1311-budget-assign-options/)
  — the “give every dollar a job” assignment surface and RTA clamps.
- [`agent-os/specs/2026-08-18-2005-period-result/`](../2026-08-18-2005-period-result/) — the
  savings-exclusion scorecard and `planned_withdrawal` decisions this delta retires.

Frozen predecessor specs are historical records and must not be edited. This folder is the
governing delta for only the decisions named in `plan.md`.

## Actual Budget reference

- [`docs/actual-budget/README.md`](../../../docs/actual-budget/README.md) — local map from
  budgeting concerns to the adjacent `../actual` checkout and the project's recorded
  divergences.
- `../actual/packages/docs/docs/budgeting/index.md` — budgeted accounts form the money available
  to budget; leftover money is saved by assigning it to a category.
- `../actual/packages/docs/docs/accounts/credit-cards/index.md` — on-budget credit cards subtract
  debt from the available pool, and payments between on-budget accounts are neutral transfers.
- `../actual/packages/loot-core/src/server/budget/envelope.ts` and `base.ts` — the envelope month
  fold, carryover, overspending, income, and available-funds semantics already adopted by the
  zero-based-budget spec.
- `../actual/packages/loot-core/src/server/budget/actions.ts` — assignment actions remain edits to
  allocations rather than account transfers.

## Current code touchpoints

### Account membership and balances

- `src/lib/finances/accountKind.ts` — account-kind vocabulary; preferred home for pure core/flexible
  membership helpers and defaults.
- `src/db/schema.ts` — `finance_accounts.off_budget`, account-kind constraints, budget settings,
  and `finance_transactions.planned_withdrawal` / `event_label`.
- `src/lib/finances/queries.ts` — account headline selection and account-list balance metadata.
- `src/lib/finances/workingPending.ts` — authoritative scrape/SimpleFIN pending-row selection.
- `src/lib/finances/available.ts` — surviving account/pending helpers mixed with retired
  “spendable vs savings” vocabulary; split or rename rather than carrying the old model forward.
- `src/lib/finances/import.ts` and account mutations — account creation, kind edits, membership
  changes, and the points that must invoke one-time opening rebases.

### Budget arithmetic and UI

- `src/lib/finances/budget/envelope.ts` — pure month fold and `BudgetMonth` terms.
- `src/lib/finances/budget/queries.ts` — activity/backlog transfer filtering, opening position,
  current account position, and `BudgetData.onBudgetPositionCents` rename.
- `src/lib/finances/budget/mutations.ts` — setup/account-linked mutations and required ownership
  patterns; integration tests live beside it.
- `src/components/finances/budget/BudgetSetup.tsx` — preset seeds and old “Savings stays out” copy.
- `src/components/finances/budget/BudgetSummary.tsx` — exact Ready to Assign terms and explanatory
  copy.
- `src/components/finances/budget/BudgetView.tsx` — permanent Savings section, Income copy,
  uncategorized tray, and month navigation.
- `src/components/finances/accounts/AccountDrawer.tsx` — editable `offBudget` control and account
  membership explanation.
- `src/lib/finances/dashboardQueries.ts` and
  `src/components/finances/dashboard/DashboardView.tsx` — Dashboard working pending/account
  position that Budget must share.

### Old-system cleanup

- `src/lib/finances/periodResult.ts` and its tests — old savings-withdrawal success measure.
- `src/components/finances/dashboard/PeriodScorecard.tsx` — retired Dashboard panel.
- `src/lib/finances/mutations.ts`, finance query DTOs, analytics fixtures, and
  `src/lib/agent/financeTools.ts` — known `plannedWithdrawal` propagation paths; search the whole
  repository before declaring removal complete.
- `agent-os/product/roadmap.md` — Financial planning narrative and Period Result entries to update
  only after implementation is verified.

## Visual references

None. The change corrects financial semantics and explanatory copy within established surfaces;
no mockup or screenshot was supplied.
