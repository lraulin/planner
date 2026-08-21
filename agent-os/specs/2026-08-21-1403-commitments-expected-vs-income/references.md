# References

## Governing specs

- `agent-os/specs/2026-08-21-1122-commitments-curation/` — two grids, Review at the foot,
  categories, aliases, day cadences
- `agent-os/specs/2026-08-16-1938-commitments/` — two-tier model, 26-paycheck year
- `agent-os/specs/2026-08-18-2058-commitments-clarity/` — set-aside arithmetic vs Amount

## Code

- `src/lib/finances/commitmentRows.ts` — `monthlyCents` / `paycheckCents` on both row types,
  `activeBillTotals` / `activeSpendTotals`
- `src/lib/finances/expectedSpending.ts` — `spendingVsIncome`
- `src/lib/finances/reviewSort.ts` — Review comparator
- `src/lib/finances/classify/income.ts` — `PAYCHECKS_PER_YEAR`, `incomeFromPaydays`
- `src/components/finances/commitments/CommitmentsView.tsx` — totals footer, comparison table,
  views, Group by, focused File ▸ Export
- `src/components/finances/commitments/commitmentColumns.tsx` — Monthly / Pay period columns;
  money cells export via `filterValue`
- `src/components/finances/commitments/ReviewList.tsx` — Last charge + click-to-sort
- `src/lib/finances/commitmentGrouping.ts` — Category / State group headers
- `src/components/grid/DataGrid.tsx` — `h-full`; `exportFocused` for dual-grid File ▸ Export
