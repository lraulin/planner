# References for Actual-style Schedules

## Governing specs

### `agent-os/specs/2026-08-22-1948-zero-based-budget/`

- **Relationship:** Extends. Its scope note names "Schedules, Rules, Payees and Reports" as
  follow-on specs; this is the first.
- **Relevant decisions:** The reimplement-don't-port stance toward Actual; integer cents
  asserted everywhere; the divergence-recording convention; `finance_transactions` gaining a
  nullable FK rather than the classifier being rewritten — the same shape `schedule_id` takes.
- **Its follow-up list** flags "Bills feed the budget" and goal templates. Schedules is the
  prerequisite for the schedule-based template, which is why it comes first.

### `agent-os/specs/2026-08-16-1938-commitments/`

- **Relationship:** Extends. `finance_recurring_bills` is the seed source.
- **Relevant decisions:** matchers-as-identity (a commitment is named by the user, matched on
  the bank's strings); the cross-table matcher exclusivity that lives in the mutation; the
  two-tier split. **Nothing in that table changes here.** Both tiers keep feeding
  `availableToSpend`.

### `agent-os/specs/2026-08-21-1122-commitments-curation/`

- **Relationship:** Extends. The curated matchers and categories are what make an imported
  schedule's conditions usable rather than noise.

## Actual Budget (MIT, © James Long) — cloned at `../actual`

### `packages/loot-core/src/server/schedules/app.ts`

- **Relevance:** The operation set — create/update/delete/move, `skipNextDate`,
  `postTransactionForSchedule`, `advanceSchedulesService`, `discoverSchedules`,
  `getUpcomingDates`.
- **Key patterns:** `setNextDate` (`:211`) is the cursor's only writer. The
  `weekendSolveMode: 'before'` guard at `:242` exists because skipping from a Friday would
  otherwise resolve straight back to the same date and appear to do nothing —
  reproduce it. `postTransactionForSchedule` (`:574`) writes exactly one row carrying
  `schedule: id`.

### `packages/loot-core/src/shared/schedules.ts`

- **Relevance:** The semantics we copy most literally.
- **Key patterns:** `getStatus` (completed → paid → due → upcoming → missed → scheduled, in that
  order); `getScheduleOccurrenceMatchStartDate` and its three cases; `recurConfigToRSchedule`
  as the definition of what each `RecurConfig` field means; `getNextDate`'s reverse-take
  fallback for an exhausted bounded schedule; `getDateWithSkippedWeekend`.

### `packages/loot-core/src/types/models/schedule.ts`

- **Relevance:** `RecurConfig` and `RecurPattern` — copy the shape byte-for-byte.

### `packages/loot-core/src/server/schedules/find-schedules.ts`

- **Relevance:** Discover. `getRank` = `1 / (daysOff + 1)`; candidates need a match in every
  sampled occurrence; transfers and already-scheduled transactions are excluded from the pool.

### `packages/loot-core/src/shared/rules.ts`

- **Relevance:** `getApproxNumberThreshold(n) = round(|n| * 0.075)` — the tolerance behind
  `isapprox` on amounts, and therefore behind every "is this the bill?" decision.

## Similar implementations in this repo

### The envelope budget

- **Location:** `src/lib/finances/budget/` (`envelope.ts`, `operations.ts`, `mutations.ts`,
  `queries.ts`, `rows.ts`, `autoMap.ts`), page at `src/app/finances/budget/page.tsx`.
- **Relevance:** The most recent module reimplemented from Actual — mirror its layout, its
  header comments naming the source file, and its test granularity.

### Bill cadence and date-key math

- **Location:** `src/lib/finances/recurringBills.ts`.
- **Key patterns:** `Cadence`, `cadenceOf` / `cadenceColumns`, `CADENCE_CHOICES`,
  `shiftDateKeyMonths`, `nextDueDate` / `nextDueFrom`, `detectCadence`. The import maps
  `Cadence` → `RecurConfig`; `detectCadence` is prior art for Discover.

### Merchant identity

- **Location:** `src/lib/finances/commitments.ts` — `matcherIndex`, `resolveMerchant`,
  `MatcherConflictError`.
- **Relevance:** Stands in for Actual's payees. The `payee` condition holds these strings.

### Date-key primitives

- **Location:** `src/lib/schedule/geometry.ts` (`shiftDateKey`, `daysBetweenKeys`),
  `src/lib/dateMath.ts`.
- **Relevance:** The recurrence engine is built from these, not from `Date`.
