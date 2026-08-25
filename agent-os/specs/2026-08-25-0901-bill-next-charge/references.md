# References for Edit a bill's next charge date

**Status: frozen / complete** (2026-08-25)

## Governing specs

### `agent-os/specs/2026-08-23-2313-one-budget/`

- **Relationship:** Extends
- **Relevant decisions:** Bills are `kind: 'bill'` envelopes on `/finances/budget`. Facet
  columns (cadence, amount, status, URL) patch inline through `onPatchBill` →
  `setRecurringBillAction` → `upsertBillEnvelope`. Next charge was listed as a column;
  Task 5 borrowed dollarsInput / URL / CadenceSelect / FundingMeter and the date cell
  landed as `DateText`.

### `agent-os/specs/2026-08-21-1122-commitments-curation/`

- **Relationship:** Extends D7
- **Relevant decisions:** An `anchorDate` later than the last posted charge is the charge
  being waited for. `billAnchor(bill, lastCharge, todayKey)` is the only place that
  question is answered. The Review draft prefills Next charge; that is create-time only.

### `agent-os/specs/2026-08-21-1810-register-track-as-bill/`

- **Relationship:** Adjacent create-time surface, not extended
- **Relevant decisions:** Track as bill writes the same `anchorDate` field. This spec
  does not change that dialog.

## Similar implementations

### DateKeyCell

- **Location:** `src/components/grid/cells.tsx`
- **Relevance:** The shared calendar-day editor. Commit on blur/Enter, Escape reverts,
  native picker, formatted overlay until focused.
- **Key patterns:** `value` is `YYYY-MM-DD` or `""`; `onChange` receives `string | null`.

### Bill facet patches

- **Location:** `src/components/finances/budget/budgetColumns.tsx`,
  `src/components/finances/budget/BudgetView.tsx` (`onPatchBill`)
- **Relevance:** Cadence, amount, status, URL already patch through this path. Next
  charge joins them. `upsertBillEnvelope` already writes `anchorDate` when supplied
  (`src/lib/finances/mutations.ts`).
- **Key patterns:** Every patch still sends cadence because the upsert requires one.

### lastChargeByEnvelope / billAnchor

- **Location:** `src/lib/finances/budget/queries.ts`, `src/lib/finances/commitments.ts`
- **Relevance:** Last charge is joined through the payee claim, not the transaction's
  `budget_category_id`. `billAnchor` ignores an `anchorDate` on or before last charge —
  which is why a write of that shape must be refused rather than stored and appearing
  to bounce.
