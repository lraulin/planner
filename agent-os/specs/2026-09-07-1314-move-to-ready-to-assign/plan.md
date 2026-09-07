# Move money to Ready to Assign

**Status: frozen / complete** (2026-09-07)  
Spec folder: `agent-os/specs/2026-09-07-1314-move-to-ready-to-assign/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` — D7: every affordance is a clamped allocation edit plus a movement note. Move money remains Rule 3 (take from one envelope, put it somewhere else).
- **Extends:** `agent-os/specs/2026-08-26-1151-category-picker-typeahead/` — one shared `CategorySelect`. This delta adds an opt-in destination that is not an envelope.
- **Extends:** `agent-os/specs/2026-08-29-2033-budget-fix-this/` — D5: `unassignToReadyToAssign` is already the write that returns Available to Ready to Assign. Move money to Ready to Assign uses that operation; it does not invent a third one.
- **Extends:** `agent-os/specs/2026-08-29-1605-hidden-categories-in-picker/` — Move money still uses `visibleEnvelopeCatalog` for envelope destinations. Ready to Assign is not a catalog row and is never hidden.
- **Supersedes:** `agent-os/specs/2026-08-26-1151-category-picker-typeahead/` “Move money stay as they are” / destination `<select>` — Move money already uses `CategorySelect`; this delta is the destination list, not a second picker.
- **Does not supersede:** Fix This (negative-RTA un-assign dialog), Cover overspending (Ready to Assign as a _source_), Assign (Ready to Assign as a _source_, destinations stay envelopes), or transaction Category filing.

## Context

Lee wants **Move money to…** to include **Ready to Assign** as a destination, YNAB-style, preferably first in the typeahead. Returning leftover from an envelope is the everyday inverse of Assign, and today the only dedicated UI for it is Fix This — which only opens when Ready to Assign is already negative.

Ready to Assign is a valid move _target_ the same way an envelope is. It is **not** a category that can be filed on a transaction. `CategorySelect` is shared with Register, the transaction drawer, splits, Payees, Supplies, Set category, and Assign, so the extra row must be opt-in and default off.

The write already exists: `unassignToReadyToAssign` (`kind: "unassign"`). Cover overspending already lists Ready to Assign first as a source (`from: null`). This delta is the destination half of the same idea, in the Move money dialog.

## Decisions

**D1 — Destination, not a category.** Ready to Assign appears only where the picker is choosing a _move destination_. Default `includeReadyToAssign` is false. Register Category, transaction drawer, splits, Set category, Payees, Supplies, and Assign never pass it. The extra row is not an `EnvelopePickerOption` and is not in `EnvelopeCatalog`.

**D2 — First in the list.** When opted in, Ready to Assign is the first choice in the open list — above Income — not nested under a type heading. Filter is the same case-insensitive substring as envelopes, on the label `Ready to Assign` only (not on its amount suffix). Empty query keeps it first. A query that does not match drops it, same as any other unmatched row.

**D3 — Default destination is Ready to Assign.** Opening Move money pre-selects Ready to Assign (closed field shows that name). Envelope-to-envelope still works by changing To. This is the leftover-return gesture: amount is already the whole Available; confirm Move.

**D4 — Sentinel, never a UUID.** The committed id is `__ready_to_assign__` (`READY_TO_ASSIGN_DESTINATION`). It is not a budget category. `requireCategory` remains the backstop if that string ever arrives as a transaction `categoryId` or as `transfer.to.id`. Move money to Ready to Assign dispatches `kind: "unassign"`, not `kind: "transfer"`.

**D5 — Reuse the unassign write.** Same clamp as Fix This: `moved` in `[0, max(0, source Available)]`; Assigned may go negative when the money is leftover/carry-in; Available cannot. Movement note stays `Unassigned $X from {envelope} to Ready to Assign on {day}`. No new `BudgetOperation` kind, no schema.

**D6 — Amount suffix.** The open-list row may show the current Ready to Assign figure as `detail` (tabular, not part of the filter), matching envelope Available in this same dialog. Signed, as the summary shows it — do not clamp to zero.

**D7 — Out of scope.** Fix This dialog. Cover overspending sources. Assign destinations. Filing Ready to Assign on a transaction. A new envelope kind or income row. Changing `transferBetweenCategories` to accept `to: null`. Toasts / undo.

## Acceptance criteria

- [x] Move money To typeahead lists **Ready to Assign** first, then the existing envelope tree (no New {type}…, hidden destinations still omitted).
- [x] Opening Move money has To = Ready to Assign; Move writes `unassign` and Ready to Assign of the viewed month increases by the moved amount (clamped to source Available).
- [x] Choosing an envelope destination still writes `transfer` as today.
- [x] Typing filters Ready to Assign by its label; a non-matching query hides it; amount text does not match.
- [x] Register Category, transaction drawer Category, splits, Set category, Payees, Supplies, and Assign To do **not** list Ready to Assign. A transaction cannot be filed to it.
- [x] `categoryPickerSections` / `commitCategoryPicker` / `defaultCategoryPickerChoice` unit tests cover the opt-in row, default-off, first position, filter, and commit. No React component tests.
- [x] Lint, typecheck, unit tests, integration tests (Postgres up — existing unassign cross-user still holds; no new mutation). `npm run smoke` on the running server. Browser: Move leftover to Ready to Assign; Move leftover to another envelope; confirm a Register Category cell never offers Ready to Assign.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change | Why |
| --- | ------ | --- |
|     | None   |     |

## As built (2026-09-07)

- `READY_TO_ASSIGN_DESTINATION` / `isReadyToAssignDestination` and picker row kind
  `readyToAssign` in `groupEnvelopeOptions.ts`. Opt-in via `includeReadyToAssign`.
- `CategorySelect` closed field shows `Ready to Assign` for the sentinel; default flag
  false. Only `MoveMoneyDialog` passes it.
- `BudgetView` dispatches `kind: "unassign"` for the sentinel, `kind: "transfer"` otherwise.
- Browser: Other bills → Move money To defaulted to Ready to Assign (first option, with
  current RTA as suffix); $1 unassign raised Available’s complement; Assign To and Register
  Category listed no Ready to Assign; envelope-to-envelope $1 Other bills ↔ Recurring spend
  still transferred. File restored to the pre-probe Available.

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-09-07-1314-move-to-ready-to-assign/` with:

- **plan.md** — this plan (**Status: active**), including empty **Changes from original plan**
- **shape.md** — shaping notes
- **standards.md** — which standards apply, why, and any deviations (references, not copies)
- **references.md** — governing specs and code studied
- **visuals/** — none

Shaping stops here. Implementation begins at Task 2 in a fresh session.

## Task 2: Opt-in Ready to Assign choice in the picker model

In `src/lib/finances/budget/groupEnvelopeOptions.ts`:

- Export `READY_TO_ASSIGN_DESTINATION = "__ready_to_assign__"` and `isReadyToAssignDestination(id)`.
- Add picker row kind `readyToAssign` (label `Ready to Assign`, optional `detail`).
- `categoryPickerSections(..., { includeCreate, includeReadyToAssign, readyToAssignDetail? })`: when `includeReadyToAssign` and the query matches the label (or is empty), prepend a section whose only choice is that row. Default both flags so today’s callers stay create-on / RTA-off.
- `categoryPickerChoices` includes the new kind.
- `defaultCategoryPickerChoice` prefers Ready to Assign, then first envelope, then first create.
- `commitCategoryPicker` commits `{ action: "readyToAssign" }` when that row is highlighted.

Unit tests beside the file: default-off; first when on; filter keep/drop; amount suffix not a match; commit; default highlight order.

## Task 3: CategorySelect opt-in; Move money dispatches unassign

- `CategorySelect`: `includeReadyToAssign?: boolean` (default false). Closed field shows `Ready to Assign` when `value` is the sentinel. Open list renders the new row like an envelope (label + optional detail). Commit calls `onChange(READY_TO_ASSIGN_DESTINATION)`.
- `MoveMoneyDialog`: pass `includeReadyToAssign`, default To to the sentinel, pass current Ready to Assign as `detail`. `onMove` still receives the id.
- `BudgetView` Move handler: sentinel → `kind: "unassign"`; otherwise `kind: "transfer"` as today. Do not look the sentinel up in `move.targets`.

Assign, Register, drawer, splits, Payees, Supplies stay unchanged (flag omitted).

## Task 4: Verify, freeze spec, update roadmap only if a listed item closed

Drive in the browser: Budget row with Available → Move money to… → confirm To is Ready to Assign → Move → Ready to Assign and the source Available move by the amount; repeat to another envelope; open a Register Category cell and confirm Ready to Assign is absent.

Then lint / typecheck / `npm test` (Postgres up, no skip) / `npm run smoke` on the running server.

Update `plan.md` / `shape.md` for material as-built drift; fill **Changes from original plan**; mark **frozen / complete**. This is not a roadmap line item — do not invent one.

---

While this spec is **active**, when we make a material change to requirements, design,
or scope (including from feedback on what was implemented), update the relevant sections
and append to **Changes from original plan**. Skip pure implementation details. Freeze
when verified.
