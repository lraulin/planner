# Edit a bill's next charge date

**Status: frozen / complete** (2026-08-25)  
Spec folder: `agent-os/specs/2026-08-25-0901-bill-next-charge/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-23-2313-one-budget/` — bills live on `/finances/budget` with inline facet columns (cadence, amount, status, URL). Next charge was kept as a column and the editor was dropped.
- **Extends:** `agent-os/specs/2026-08-21-1122-commitments-curation/` D7 — an `anchorDate` later than the last posted charge **is** the next charge; `billAnchor` is the only reader of that question.
- **Does not supersede** either. This restores the missing write on the existing column.

## Context

Create-time surfaces (Review, Track as bill) still collect Next charge and write `finance_budget_categories.anchor_date`. After create, the Budget bills **Next charge** column renders `DateText` — cadence, amount, status, and URL all `onPatchBill` through `setRecurringBillAction` → `upsertBillEnvelope`, which already accepts `anchorDate`. There is no post-create UI.

`commitments.ts` still comments "the editable Next charge column". `one-budget` Task 5 said to borrow the Commitments cells; the date cell was not among the ones listed and landed as display-only.

Another session is working in the main checkout. Implementation lives in a git worktree, not the main working tree.

## Decisions

- **D1 — Inline on the existing column.** Reuse `DateKeyCell` (commit on blur/Enter, Escape reverts). No dialog, no row-menu command.
- **D2 — The write is `anchorDate`.** `onPatchBill({ anchorDate })` via the existing cadence-preserving patch. Clearing the field writes `null` so `billAnchor` walks from the last posted charge again.
- **D3 — Unscheduled stays Unscheduled.** No date picker on `scheduled: false` (propane). Same as cadence already.
- **D4 — Reject dates on or before the last posted charge.** Next charge is the charge being waited for. Validation lives in lib (`nextChargeWriteError`); `upsertBillEnvelope` enforces it by looking up last charge through the **payee claim** (same join as `lastChargeByEnvelope` — not the transaction's `budget_category_id`). The existing `run()` error banner surfaces the message. No last charge → any date is allowed. Clearing (`null`) is always allowed.
- **D5 — Display nextDue for every scheduled bill.** Today `nextDueKeys` is derived from `loadBillSnapshots`, which skips paused/cancelled bills and bills with no amount. A paused bill (or one with no amount yet) would show "—" and have nothing to edit. Compute next-due independently of apply snapshots.

## Acceptance criteria

- [x] On `/finances/budget`, a scheduled bill's Next charge cell is a date editor. Changing it and blurring/Enter persists; reload shows the new date.
- [x] Escape reverts an in-progress edit without writing.
- [x] Clearing the date (when a last charge exists) returns the cell to the derived next date from last charge + cadence.
- [x] A date on or before the last posted charge is refused with a readable error; the stored anchor is unchanged.
- [x] Unscheduled bills still show "Unscheduled", not a picker.
- [x] Paused scheduled bills still show (and can edit) next charge.
- [x] A second user cannot change the first user's next charge. Owner's row is unchanged.
- [x] `npm run lint`, `npm run typecheck`, `npm run test:unit` (Postgres up so the integration file actually runs), browser verify on `/finances/budget`.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change | Why |
| --- | ------ | --- |
|     | _(none)_ | As-built matches the shaping decisions. |

## Follow-ups (new work — not amendments to this frozen spec)

- None. Cadence still does not rewrite next charge on an existing bill; that stays create-time-only on purpose.

While this spec is **active**, when we make a material change to requirements, design,
or scope (including from feedback on what was implemented), update the relevant sections
and append to **Changes from original plan**. Skip pure implementation details. Freeze
when verified.

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-25-0901-bill-next-charge/` with:

- **plan.md** — this plan (**Status: active**)
- **shape.md** — shaping notes
- **standards.md** — file references to the standards that apply
- **references.md** — governing specs and code studied

## Task 2: Next-due for every scheduled bill + write validation

Extract last-charge lookup (payee claim, not transaction category) so budget queries and `upsertBillEnvelope` share it. Add `loadNextDueKeys` for every scheduled bill of any status. Add `nextChargeWriteError` beside `billAnchor`; enforce it on existing-bill `anchorDate` writes. Tests in `commitments.test.ts` and `mutations.integration.test.ts` (including the payee-claim vs recategorised-charge distinction and a cross-user `anchorDate` case).

## Task 3: DateKeyCell on the Next charge column

Scheduled bills: `DateKeyCell` patching `anchorDate`. Unscheduled: "Unscheduled". Empty scheduled: the empty picker, not "—".

## Task 4: Verify, freeze spec, commit, push

Verified 2026-08-25 against the worktree server on port 3057 (`/finances/budget`) and the live test account:

- SMECO Next charge 8/31/2026 → 9/5/2026 persisted in `anchor_date` and survived reload.
- 2026-07-31 (SMECO's last posted charge) was refused with **Next charge must be after the last posted charge (2026-07-31).**; the cell stayed 9/5/2026.
- Clearing returned the cell to the derived 8/31/2026 from last charge + monthly cadence.
- Escape on a focused in-progress edit reverted without writing.
- Taylor Gas still reads **Unscheduled**, no date picker.
- Cadence / amount / status / URL cells were unchanged on the same grid.
- Paused-bill next-due coverage is the `loadNextDueKeys` integration case (no paused bill on the live file).
- `npm run lint`, `npm run typecheck`, `npm run test:unit` (3220), `mutations.integration.test.ts` (Postgres up), `npm run smoke` (60 routes).

SMECO's stored date was restored to 2026-08-31 after the pass.

## Out of scope

- Changing cadence does not auto-rewrite next charge.
- No overdue tint on this column.
- No new agent tool — existing `anchorDate` on the upsert is enough.
- Unscheduled bills stay without a date.
- Schema unchanged.
