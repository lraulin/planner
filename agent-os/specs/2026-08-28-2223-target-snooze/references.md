# References for Target Snooze

## Governing specs

### `agent-os/specs/2026-08-28-2039-target-refill-basis/`

- **Relationship:** Extends.
- **Relevant decisions:** D1's two families (period refill vs pile) is why the seam had to sit
  _above_ both — a snooze rule written inside either family would silence only half the targets.
  **D4 is the load-bearing one:** it removed `todayKey` from `targetDemand`, `demandForTarget`,
  `neededAssigned`, `underfundedGapCents` and `envelopeIndicator`, so the ask no longer reads the
  clock. Snooze must not put a clock back: the flag arrives as resolved per-month data on
  `AssignEnvelope`, and only the mutation and the control's enabled/disabled state know what today
  is. D3's deadline-free floor is the shape of the "savings goal set aside" case.

### `agent-os/specs/2026-08-25-1310-budget-funding-indicators/`

- **Relationship:** Extends, and supersedes **D8** in one respect (Snooze leaves out-of-scope).
- **Relevant decisions:** **D3 is the binding constraint on this whole spec** — one pure demand
  function, shared by the grid, Underfunded and the drawer; if they ever disagree the indicator is
  wrong. That is the reason the snooze check lives at `neededAssigned` and nowhere else. D4/D5
  define the pill, icon and copy vocabulary the new `snoozed` state joins.

### `agent-os/specs/2026-08-25-1633-budget-inspector/`

- **Relationship:** Extends, and supersedes **D9** in one respect (Snooze leaves out-of-scope).
- **Relevant decisions:** The two-pane layout and the mobile `Drawer` shell, which together mean
  one control satisfies both of the requested spec's UI requirements. Its plan.md:47 ("No snooze.")
  and :102 are the deferral this spec closes. Section 3 (Target) is where the toggle lands.

### `agent-os/specs/2026-08-28-1000-ynab-target-engine/`

- **Relationship:** Extends.
- **Relevant decisions:** D1 moved `templates` (a JSONB list) to `target` (one nullable JSONB
  object on the category), which is why "snooze the target" means "snooze this envelope's one ask".
  D2's legal pairings are untouched — snooze is not a new cadence or behaviour, and deliberately so.

### `agent-os/specs/2026-08-28-2146-target-since-month-granularity/`

- **Relationship:** Extends. Newest in the stack.
- **Relevant decisions:** `since` compares months, never days. Snooze adopts the same granularity
  by construction, since the flag is keyed by month.

### `agent-os/specs/2026-08-22-1948-zero-based-budget/`

- **Relationship:** Extends.
- **Relevant decisions:** D1's identity `balance = assigned + activity + carryIn`. Snooze changes
  no term of it — the flag is pure transport through `envelope.ts` and never enters the recurrence.

### `agent-os/specs/2026-08-24-1311-budget-assign-options/`

- **Relationship:** Context, not extended.
- **Relevant decisions:** The eight auto-assign options and the clamp to Ready to Assign. Reading
  which options consult `neededAssigned` is what established D3 — two do (`underfunded`,
  `reduce-overfunding`), five do not. Its plan.md:54 is one of the two written records that no
  credit-card payment category exists here.

### `agent-os/specs/2026-08-25-1154-month-ahead-zero-based/`

- **Relationship:** Context, not extended.
- **Relevant decisions:** D1 (a monthly bill asks its full amount in the due month and $0 otherwise)
  is half of why D6 holds. Its month-ahead workflow is why "current month only" was a real question
  rather than an automatic yes; D5 keeps YNAB's answer anyway.

## Similar implementations

### `setCarryover` — the per-month boolean, end to end

- **Location:** `src/lib/finances/budget/mutations.ts:496`; action at
  `src/app/finances/actions.ts:472`; menu item at
  `src/components/finances/budget/BudgetView.tsx:1229`.
- **Relevance:** The closest existing thing to what is being built — a boolean on
  `finance_budget_allocations` written by upsert, exposed as a row-menu toggle.
- **Key patterns:** `onConflictDoUpdate` on the `(userId, month, categoryId)` unique index; the
  menu item whose label flips between the verb and "Stop …" and whose `title` states the scope.
  **Do not copy its second half** — `setCarryover` follows the upsert with an
  `UPDATE … WHERE month > :month` to propagate forward. Snooze is one month and must not.

### `status: 'paused'` — the ask already has a mute switch

- **Location:** `isInactive` in `src/lib/finances/budget/indicator.ts:71`; `eligible` in
  `src/lib/finances/budget/assign/plan.ts:51`.
- **Relevance:** Proves the shape works: both already short-circuit a paused or cancelled envelope
  to a zero ask. Snooze is the month-scoped sibling. It is also the third of the three reasons
  bills are excluded (plan D6) — bills already have this.

### The `carryover` transport path

- **Location:** `queries.ts:491,532` → `envelope.ts:165,226,281` → `rows.ts` →
  `assign/fromBudget.ts:33` → `assign/types.ts`.
- **Relevance:** The exact hop-by-hop route `snoozed` follows. Following it verbatim is the whole
  of Task 3's first half.

### `outstandingCharges` / `billAnchor` — the evidence behind D6

- **Location:** `src/lib/finances/budget/targets/cadence.ts:56,169`;
  `src/lib/finances/commitments.ts:187-217`; the rule stated at
  `src/lib/finances/budget/targets/demand.ts:83-88`.
- **Relevance:** These three sites are why a variable bill whose charge has posted already stops
  asking, and therefore why bills need no snooze. Re-read them before revisiting D6.

### `AvailablePill` / `FundingIcon` — where the Zz goes

- **Location:** `src/components/finances/budget/FundingChrome.tsx` (`PILL` 4–11, `FundingIcon` 74,
  `AvailablePill` 108); wired at `src/components/finances/budget/budgetColumns.tsx:194-210`.
- **Relevance:** The pill already renders an icon slot driven by `IndicatorIcon`, so the Zz is a new
  icon case plus a new state — not new chrome. Note the second, text-only copy of the pill colour
  map at `BudgetInspector.tsx:32-37`.

## External reference

- **YNAB** is the source of Snooze; Actual Budget has no equivalent. Per
  `docs/actual-budget/README.md`, the target engine is already YNAB-shaped while envelope
  arithmetic stays Actual's — this spec touches only the former.
