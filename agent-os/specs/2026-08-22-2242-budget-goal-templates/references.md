# References for Budget goal templates

## Governing specs

### `agent-os/specs/2026-08-22-1948-zero-based-budget/`

- **Relationship:** Extends. Follow-up named goal templates as the strongest next step.
- **Relevant decisions:** D1 envelope math; D7 every affordance is an allocation edit
  (`setAssignment`, month-note append); integer cents asserted; parallel with Available to
  Spend. **Supersedes** only the comment that templates would later be written in
  `finance_budget_categories.notes`.

### `agent-os/specs/2026-08-22-2124-actual-schedules/`

- **Relationship:** Extends. Taken first specifically so `#template schedule` could exist.
- **Relevant decisions:** `finance_schedules` with Actual-shaped conditions; `next_date`
  stored; `RecurConfig` in `recur.ts`; `getScheduledAmount`; Post now is a click, nothing
  writes unattended — the same posture Apply takes here.

### `agent-os/specs/2026-08-16-1938-commitments/`

- **Relationship:** Extends, still parallel. The bills table is **not** a template source
  and is not merged. Add from schedules… reads `finance_schedules`, which was itself seeded
  from bills.

## Actual Budget (MIT, © James Long) — cloned at `../actual`

### `packages/loot-core/src/types/models/templates.ts`

- **Relevance:** The four types we store. Amounts in Actual are dollar floats; ours are
  integer cents (named divergence). `scheduleId` rather than name. Stable `id` per line.

### `packages/loot-core/src/server/budget/goal-template.ts`

- **Relevance:** Apply vs overwrite (`force`); priority loop then `distributeRemainder`;
  `setBudget` / `setGoal`; dry-run with `skipAvailableClamp`.

### `packages/loot-core/src/server/budget/category-template-context.ts`

- **Relevance:** `runSimple`, `runBy`, remainder last, limit clamp, `fromLastMonth` treated
  as 0 when negative without carryover. Two `by` templates share the shortest window.

### `packages/loot-core/src/server/budget/schedule-template.ts`

- **Relevance:** Pay-this-month vs sinking; weekly/daily sum occurrences in the month;
  already-funded falls back to the base monthly rate; `getSinkingContributionBreakdown`.
  Rewrite over our date keys; do not port `monthUtils`.

### `packages/docs/docs/experimental/goal-templates.md`

- **Relevance:** User-facing vocabulary (Apply / Overwrite, `up to`, `by YYYY-MM`,
  remainder, schedule / full) and the goal-indicator colours.

## Similar implementations in this repo

### Envelope budget

- **Location:** `src/lib/finances/budget/` (`envelope.ts`, `operations.ts`, `mutations.ts`,
  `queries.ts`, `rows.ts`), page at `src/app/finances/budget/page.tsx`.
- **Relevance:** Apply writes through `setAssignment` and `applyEdit`. Carry-in is
  `categoryMonth` of the previous month. Month notes already append.

### Schedules

- **Location:** `src/lib/finances/schedules/` (`conditions.ts`, `recur.ts`, `nextDate.ts`,
  `queries.ts`).
- **Relevance:** Schedule templates read `ScheduleRecord` + `dateConfigOf` +
  `getScheduledAmount` + `occurrences`. Import-from-bills is the pattern Add from
  schedules… copies (re-runnable, skip already attached).

### Date-key primitives

- **Location:** `src/lib/schedule/geometry.ts`, `src/lib/finances/budget/envelope.ts`
  (`monthKeyOf`, `shiftMonthKey`, `monthEndKey`).
