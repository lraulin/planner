# References for Collapse Budget, Schedules and Commitments

## Spec relationships

### Supersedes

- **`agent-os/specs/2026-08-16-1938-commitments/`** — D0's two-tier model
  (`finance_recurring_bills` / `finance_recurring_spend`) and its tier-2 cadence
  admission test; D1's two separate tables and the `setAsideHeld` arithmetic; D3's
  cross-table "at most one commitment per merchant" matcher rule (now a single
  `budget_category_id` claim column).
- **`agent-os/specs/2026-08-18-2058-commitments-clarity/`** — D2's Set aside accrual
  meter and the framing that bill accrual was "the envelope-like behaviour" (an actual
  envelope now exists).
- **`agent-os/specs/2026-08-21-1403-commitments-expected-vs-income/`** — D3's
  Commitments-page expected-vs-income comparison table moves onto the budget page as a
  collapsible section; its own page is deleted.
- **`agent-os/specs/2026-08-21-2038-paused-bills-assignment/`** — D1's catch-up accrual
  formula (retired with Available to Spend); D5's stacked-claims-bar visualization
  (retired with the Dashboard panel it lived on); and its explicit "Roadmap envelopes item
  stays closed. This is not every-dollar assignment" — reversed.
- **`agent-os/specs/2026-08-22-1948-zero-based-budget/`** — narrows further its own
  "Both tiers keep running untouched... fully parallel until use decides" deferral. The
  envelope arithmetic itself (D1) is unchanged — see Extends below.
- **`agent-os/specs/2026-08-22-2124-actual-schedules/`** — the whole spec. Its
  `finance_schedules` table, Actual-shaped `conditions` JSONB, stored `next_date` cursor,
  skip/post-now/discover, and the deliberate "run in parallel, seeded by copy" decision
  (D2) are all retired in favor of bill cadence owning recurrence directly.
- **`agent-os/specs/2026-08-22-2242-budget-goal-templates/`** — D3's `{type: "schedule"}`
  template type and "Add from schedules..." picker; a bill envelope's funding demand is
  now intrinsic to its own cadence rather than a template line pointing at a schedule.
- **`agent-os/specs/2026-08-23-1807-nested-budget-groups-bill-import/`** — its central
  claim that "Commitments is a seed, not ongoing synchronization" and the
  previewed/re-runnable import dialog it built (`CommitmentsImportDialog`,
  `commitmentsImportMutations.ts`) are both retired: there is nothing left to import from,
  since bills live directly on the envelope row from creation.

### Extends

- **`agent-os/specs/2026-08-22-1948-zero-based-budget/`** — the envelope balance /
  carryover / Ready-to-Assign formulas (D1) are unchanged. This spec changes what rows
  exist and where recurrence lives, not how money is computed.
- **`agent-os/specs/2026-08-23-2023-actual-categories-and-tags/`** — `budget_category_id`
  remains the transaction's single Category; this spec does not touch that decision, only
  what else lives on the row the category points at.

## Governing code read during shaping

- `src/db/schema.ts:2486-3130` — `financeRecurringBills`, `financeRecurringSpend`,
  `financeCategoryGroups`, `financeBudgetCategories`, `financeBudgetMonths`,
  `financeBudgetAllocations`, `financeSchedules`, `financePayees`.
- `src/lib/finances/recurringBills.ts` — `Cadence`, `cadenceOf`, `nextDueDate`,
  `nextDueFrom`, `annualCents`, `detectCadence`, `billAnchor`. This is the machinery D2
  chose to keep.
- `src/lib/finances/commitments.ts` — `StoredBillRow`, `StoredSpend`, `Commitment` union,
  `recurringSpendRate`, `projectForwardMonths`/`projectForwardPayPeriods`.
- `src/lib/finances/schedules/recur.ts` — `RecurConfig`, the engine being retired.
- `src/lib/finances/budget/commitmentsImportMutations.ts` and
  `src/lib/finances/budget/commitmentsImport.ts` — the previewed/re-runnable import
  pattern this spec's cutover (Task 3) follows, and the code being retired.
- `src/lib/finances/budget/templates/{types,apply,schedule}.ts` — the four goal-template
  types; `schedule.ts`'s sinking-fund math is re-pointed rather than deleted.
- `src/lib/finances/available.ts` / `assignment.ts` — Available to Spend and the
  per-paycheck accrual with catch-up, retired by D5.
- `src/components/finances/budget/BudgetView.tsx`,
  `src/components/finances/commitments/CommitmentsView.tsx`,
  `src/components/finances/schedules/SchedulesView.tsx` — the three UIs being merged.
- `src/lib/navigation/pages.ts:232-321` — the `finances` nav array.
- `docs/actual-budget/README.md` — "Where we diverge" section, gains an entry for D2.

## Similar implementations (patterns to reuse)

### Guarded, previewed, re-runnable cutover

- **Location:** `src/lib/finances/budget/commitmentsImportMutations.ts`,
  `src/db/schema.ts` `financeCategoryCutovers` table.
- **Relevance:** Task 3's data cutover follows this exact shape — preview function,
  apply function, one transaction, `userId`-scoped, idempotent re-run.
- **Key patterns:** `previewCommitmentsImport` / `applyCommitmentsImport` separation;
  stable identity columns (`sourceCommitmentKey`, `sourceBillId`) so a re-run recognizes
  what it already did instead of duplicating.

### Strict-schema break for a UI vocabulary change

- **Location:** `agent-os/specs/2026-08-18-2058-commitments-clarity/` D1 (deleting
  `set_aside` because `status` already said the same thing).
- **Relevance:** D3's payee claim column consolidation and D6's agent-tool renames are the
  same kind of break — an old column/tool name is deleted outright rather than kept as a
  compatibility shim, because "nobody reviews these before they land" and a shim just
  delays the real fix.
