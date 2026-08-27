# References for Weekly envelope targets

## Governing specs

### `agent-os/specs/2026-08-22-2242-budget-goal-templates/`

- **Relationship:** Extends.
- **Relevant decisions:** D1 — the stored template shapes live in the `templates` JSONB column
  in integer cents, validated in `templates/types.ts` so bad JSONB never reaches the apply
  math. D2 — apply vs overwrite, the priority loop, remainder last. A fourth type slots into
  both without touching either decision.

### `agent-os/specs/2026-08-24-1311-budget-assign-options/`

- **Relationship:** Extends.
- **Relevant decisions:** D3 — `demandOf` is the one definition of an envelope's ask, shared by
  the grid, the Underfunded preview and the drawer preview. D4 — the Underfunded ranking
  buckets. D1/D5 — Assign never consumes more than Ready to Assign, reductions first. A weekly
  line is a summand inside `demandOf`; nothing about the clamp or the preview changes.

### `agent-os/specs/2026-08-25-1310-budget-funding-indicators/`

- **Relationship:** Extends.
- **Relevant decisions:** D3–D6 — the indicator's copy, pill, icon and bar all derive from
  `neededAssigned` plus a horizon; they must not invent a second demand. A weekly envelope is
  a `this-month` horizon, added beside the existing `simples(...)` branch in `horizonOf`.

### `agent-os/specs/2026-08-23-2313-one-budget/`

- **Relationship:** Extends.
- **Relevant decisions:** D4 — a bill envelope funds itself from its own cadence and holds no
  template line; the `schedule` template type was retired. This spec does **not** reopen that:
  a weekly line is for ordinary spending on a weekday, and Groceries is not a bill.

### `agent-os/specs/2026-08-22-1948-zero-based-budget/`

- **Relationship:** Extends (root).
- **Relevant decisions:** D1 — balances, carry-in and Ready to Assign are derived by the fold
  in `envelope.ts`, never stored. The weekly demand is another derived figure and stores
  nothing.

### `agent-os/specs/2026-08-25-1154-month-ahead-zero-based/`

- **Relationship:** Extends.
- **Relevant decisions:** D1 — a monthly bill asks for the full amount in its due month rather
  than sinking across months; next month is funded by assigning in next month. The same
  instinct is behind D2 here: a month's ask is the month's ask, and it does not smear.

## Similar implementations

### Day-cadence bill occurrences

- **Location:** `occurrencesInMonth` / `thisMonthNeed` in
  `src/lib/finances/budget/templates/schedule.ts`.
- **Relevance:** The nearest existing "count the occurrences in this month and multiply"
  code — a weekly or 28-day bill sums its charges inside the viewed month, and its demand
  likewise ignores carry-in.
- **Key patterns:** Exclusive month end via `nextMonthKey` (the comment there records the bug
  from appending `-01` twice); the walk is bounded by the cadence, never by a step count.
- **What differs:** It walks by a day step from a `nextDueKey` anchor because a 28-day cycle
  has no closed form. A weekday count does, so `weekly.ts` should compute rather than walk —
  the two are not worth unifying.

### The per-template demand summands

- **Location:** `runSimple` / `applyLimit` in `templates/simple.ts`, `runBy` in
  `templates/by.ts`, joined in `demandOf` in `templates/demand.ts`.
- **Relevance:** The shape `runWeekly` must match — a pure function from template plus month
  to cents, with the limit clamp applied once over the sum.
- **Key patterns:** `assertCents` on every money value; carry-in passed in and used only where
  the template type actually means to use it.

### The drafts round trip

- **Location:** `src/lib/finances/budget/templates/draft.ts` and `TemplateDrawer.tsx`.
- **Relevance:** Editors hold strings because `Template` has no representation for "not a
  number yet". `WeeklyDraft` follows `SimpleDraft`; the weekday is a select, so it can stay a
  number.
- **Key patterns:** `convert` returns the `Template` or the user-facing error string; the
  drawer preview is `applyTemplates` run for real, never an approximation of it.

## Reference implementation outside this repo

### Actual Budget `periodic`

- **Location:** `runPeriodic` in
  `../actual/packages/loot-core/src/server/budget/category-template-context.ts`; the stored
  shape in `../actual/packages/loot-core/src/types/models/templates.ts`.
- **Relevance:** The semantics this spec adopts — shift the anchor into the month, then add
  the amount once per occurrence until the anchor passes the month end; carry-in is not
  consulted.
- **What we drop:** the `period` unit/amount pair, the `starting` date, and the optional
  `limit` (D4). Licence: MIT, © James Long; the header comment on `weekly.ts` names the source.
