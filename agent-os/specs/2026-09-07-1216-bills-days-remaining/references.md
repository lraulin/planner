# References for Drop register upcoming strip; add bills days remaining

## Governing specs

### `agent-os/specs/2026-09-05-1200-finances-envelope-workflow/`

- **Relationship:** Extends. Bills is the obligation registry; Register categorizes.
- **Relevant decisions:** Default Bills columns (Bill, Group, Next charge, Amount,
  Cadence, Status); Due soon is 14 days; unscheduled/cancelled get no invented next date.
  Days remaining is an added default column, not a replacement for Next charge.

### `agent-os/specs/2026-09-05-1401-bill-due-dates-and-lead-time/`

- **Relationship:** Extends. Next charge vs Due.
- **Relevant decisions:** D4 — Next charge is the posting date (bank, envelope, payday
  cue). Days remaining uses that date. Due stays hideable and is not the countdown.

### `agent-os/specs/2026-08-22-2124-actual-schedules/`

- **Relationship:** Supersedes Task 8 only (Upcoming in the Register).
- **Relevant decisions:** Preview rows are not transactions and must not reach balances.
  Removing the strip preserves that: nothing is mixed into the register row type. The
  rest of that spec (schedules engine, import-from-bills, discover) is untouched.

### `agent-os/specs/2026-08-14-1104-unscheduled-bills/`

- **Relationship:** Carries forward.
- **Relevant decisions:** Unscheduled bills get no Upcoming row because a projected date
  reads as knowledge. Days remaining is "—" for the same reason.

### `agent-os/specs/2026-08-12-1910-schedule-day-counts-agenda/`

- **Relationship:** Pattern, not a dependency.
- **Relevant decisions:** Agenda's Days left column is an integer with a hover title.
  Copy the _display_, not the helper.

### `agent-os/specs/2026-08-13-2006-life-history/`

- **Relationship:** Constraint.
- **Relevant decisions:** Do not lift `daysLeftOf` / `daysLeftTitle` out of
  `agendaColumns.tsx`. Same date math, different columns — merging produces a helper
  with a mode flag.

## Similar implementations

### Agenda Days left

- **Location:** `src/components/schedule/agendaColumns.tsx` (`daysLeftOf`,
  `daysLeftTitle`, column `daysLeft`)
- **Relevance:** Integer, right-aligned, hover prose, `daysBetweenKeys`.
- **Do not copy:** `useToday` / blank before hydration. Bills already has
  `data.todayKey` from the server and Due soon uses it.

### Bill due-soon cue

- **Location:** `src/lib/finances/budget/dueCue.ts` (`billDueSoon`), tests in
  `dueCue.test.ts`
- **Relevance:** Same inputs (`nextDueKey`, status, scheduled, today). Days remaining
  is the numeric form of that closeness; Due soon stays a 14-day filter.

### Register Upcoming strip (to delete)

- **Location:** `src/components/finances/FinancesView.tsx` (strip + refresh),
  `src/app/finances/register/page.tsx` (`loadUpcomingBills`),
  `src/app/finances/actions.ts` (`upcomingBillsAction`),
  `src/lib/finances/dashboardQueries.ts` (`loadUpcomingBills`),
  `src/lib/finances/commitments.ts` (`upcomingBillOccurrences`, `UPCOMING_HORIZON_DAYS`)
- **Relevance:** Everything the strip needed. After D1/D6 these call sites should be
  gone except `billOccurrences` / `projectForwardMonths`.

### Bills columns and defaults

- **Location:** `src/components/finances/bills/billColumns.tsx`,
  `src/components/finances/bills/BillsView.tsx` (`defaultsFor`)
- **Relevance:** Where the new column and default order land. Compact meta on Next
  charge is the pattern for Days remaining.

### New-column insertion

- **Location:** `src/components/grid/useGridState.ts` (`withNewColumns`)
- **Relevance:** A column the saved layout never saw is shown, not treated as
  deliberately hidden. No Reset required for existing Bills views.
