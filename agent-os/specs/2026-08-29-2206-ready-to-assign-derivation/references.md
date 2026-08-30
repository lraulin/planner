# References for Ready to Assign derivation

## Governing specs

### `agent-os/specs/2026-08-22-1948-zero-based-budget/`

- **Relationship:** Extends. Supersedes D6 only as to where the uncategorized tray lives.
- **Carries forward:** D1's arithmetic
  (`readyToAssign = availableFunds + lastMonthOverspent − totalAssigned − buffered`) and the
  rule that the fold returns a `terms[]` array _"so the UI cannot render a breakdown that fails
  to sum to its own headline."_ D2's self-auditing property — the gap between the two sides of
  the identity **is** the uncategorized backlog, and the page reports it rather than hiding it.

### `agent-os/specs/2026-08-24-2206-single-pool-budget/`

- **Relationship:** Extends. Supersedes D4 only as to the placement of the pool sentence.
- **Carries forward:** D2's signed pool (no `abs`, no kind-specific inversion); D3's formula for
  `accountReconciliationCents` as a residual and its requirement that both discrepancy terms stay
  separately named rather than hidden in income; the rule that reconciliation is **not**
  recomputed after the future-assignment adjustment.
- **Change-log row 2 is the source of the bound fix**: the current-month uncategorized term is
  activity from start through current month end, and categorizing a backlog row should move it
  out of that term _"matching the tray, rather than hiding it in reconciliation."_

### `agent-os/specs/2026-08-25-1154-month-ahead-zero-based/`

- **Relationship:** Extends.
- **Carries forward:** D3's `Assigned in future months` term and
  `displayedRTA(M) = foldRTA(M) − assignedLater(M)`, plus the revised footnote identity
  `accountPool = displayedRTA + envelope balances + assigned in future months + buffered`.

### `agent-os/specs/2026-08-29-2033-budget-fix-this/`

- **Relationship:** Extends.
- **Carries forward:** D2 — the action sits immediately after the Ready to Assign figure on the
  same baseline, with `readyToAssignNote` beneath the number. The headline row is untouched here.

### `agent-os/specs/2026-08-23-2023-actual-categories-and-tags/`

- **Relationship:** Extends. Supersedes Task 4 only as to the tray's location.
- **Carries forward:** Decision 5 — on-budget↔on-budget transfers have no category and are
  excluded from the uncategorized count, while the on-budget side of an off-budget transfer does
  require one. Acceptance: _"Clicking Budget's uncategorized count opens the Register filtered to
  the exact same eligible rows"_ — which this spec must keep true.

### `agent-os/specs/2026-08-28-1356-budget-activity-register-links/`

- **Relationship:** Extends. Supersedes D1's "not Income received" exclusion only.
- **Carries forward:** D4's URL contract
  (`?view=activity&category=<envelopeId>&month=YYYY-MM`, read client-side because awaiting
  `searchParams` on the Register page reloads the ledger on `?detail=`); D5's URL-only view with
  `clearViewState()` on mount; D3's contributing set matching `activitySince`.

### `agent-os/specs/2026-08-24-1522-category-by-kind-and-history/`

- **Relationship:** Context for the bound fix.
- **D4:** pre-start Category is analysis data; the Budget uncategorized count still counts only
  on-budget rows since the start month. The fix removes the _upper_ bound only.

## Reference implementations

### Actual Budget — the same card, upstream

- **Location:** `../actual/packages/desktop-client/src/components/budget/envelope/budgetsummary/`
- **Relevance:** `ToBudget.tsx` puts the breakdown in a click-opened popover off the number —
  the structural precedent for D2. `TotalsList.tsx` is plain text with no links, which is what
  settled "not every term needs to be a link."
- **Key patterns:** `makeSignedFormatter` prints explicit `+`/`−` so the rows read as arithmetic;
  `incomeAvailable` folds income and from-last-month into one row inside a tooltip.
- **Diverged:** we keep all seven terms flat and unmerged (plan D1), because our fold has two
  discrepancy terms Actual has no equivalent for.

### Actual Budget — the uncategorized indicator

- **Location:** `../actual/packages/desktop-client/src/components/Titlebar.tsx:48`
  (`UncategorizedButton`), query at `packages/desktop-client/src/queries/index.ts:125`.
- **Relevance:** independently arrives at the same shape — show the **count**, not the sum, in
  error tone, hidden entirely at `count <= 0`, linking to a filtered register.
- **Key patterns:** `uncategorizedTransactions()` excludes transfers between on-budget accounts,
  matching our `categoryEligibleIds`.
- **Diverged:** ours is amber (`--goal-unmet`, "not finished") rather than Actual's `errorText`,
  and lives on the Budget card rather than in global chrome.

## Code touched

- `src/lib/finances/budget/envelope.ts` — `buildBudget` L326-474; `terms` L433-445;
  `readyToAssignNote` L146; `BudgetTerm` L244.
- `src/lib/finances/budget/queries.ts` — `uncategorizedActivityThrough` L374-417 (the bound fix);
  `backlogSince` L319-366 (the set it must match); `loadBudget` L425-580.
- `src/lib/finances/budget/membership.ts` — `assertPoolIdentity` L80-92.
- `src/components/finances/budget/BudgetSummary.tsx` — the whole file.
- `src/components/finances/budget/BudgetView.tsx` — `Backlog` L2136-2167 (delete), its call site
  L1584, `BudgetSummary` call site L1506, `IncomeSection` L2280-2330.
- `src/components/finances/budget/budgetColumns.tsx` — `ActivityAmountLink` L126-149 (reuse).
- `src/components/finances/budget/AssignDialog.tsx:200` — the warning-callout idiom to copy.
- `src/components/finances/insights/FilterSelect.tsx:33` — the native `<details>` idiom.
- `src/lib/finances/registerActivity.ts:32-40` — `activityRegisterHref`.
- `src/app/globals.css:74-77` — `--goal-unmet` and its reasoning.
- `src/lib/finances/budget/export.ts:147-172` — also maps `month.terms`; must still pass.
