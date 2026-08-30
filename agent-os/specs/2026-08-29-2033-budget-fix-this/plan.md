# Fix This (negative Ready to Assign)

**Status: frozen / complete** (2026-08-29)  
Spec folder: `agent-os/specs/2026-08-29-2033-budget-fix-this/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` — D7: every affordance is a clamped allocation edit plus a movement note. This adds the missing inverse of assign-from-RTA: unassign-to-RTA.
- **Extends:** `agent-os/specs/2026-08-24-1311-budget-assign-options/` — Assign stays in Tools ▸ Assign (eight options, preview). The summary control is the same slot; when Ready to Assign is negative it runs Fix This instead of opening Assign.
- **Extends:** `agent-os/specs/2026-08-25-1154-month-ahead-zero-based/` — D3: future-month assignments leave current Ready to Assign. Unassigning in a later month is how that hole closes. Past months stay historical — Fix This is current and future only.
- **Extends:** `agent-os/specs/2026-08-27-0757-currency-expression-entry/` — the amount field uses `parseAmountEntryCents`.
- Does **not** supersede Move Money (envelope → envelope). Does **not** add toasts (no app-wide toast yet; if one lands later it covers this too). Does **not** raid leftover Hold (existing Release stays).

## Context

Ready to Assign already goes red and the note already says “assigned more than you have.” Month-ahead said the fix is to move money back, “same as YNAB, no extra machinery” — meaning no new fold, not “no UI.” Today the only way back is typing a smaller Assigned cell. Assign on the summary still says Assign, and it sits `ml-auto` on the opposite edge of the card from the number, behind a muted caption, so the control that should fix the red number is the one you do not see.

YNAB’s Fix This is the reference: a red “you assigned more than you have” state, then **Un-assign money from** a month’s categories that still have Available, including a future month. We take that job and do it in this app’s Budget language (sections, ModalShell, Available, expression amounts) — not a pixel clone, and not the current tiny Move Money / Assign-manual form.

## Decisions

**D1 — Trigger.** The summary control is one button. Viewed month is current or future, and displayed Ready to Assign `< 0` → label **Fix This**, opens the un-assign dialog. Otherwise it stays **Assign**. Past months never grow Fix This (historical fold). Tools ▸ Assign is unchanged.

**D2 — Put the verb on the number.** The action sits immediately after the Ready to Assign figure, same baseline row. The muted `readyToAssignNote` moves under the number (not between number and button, and never as the thing that pushes the button to the far edge). Drop `ml-auto`. This is the discoverability fix; a second color on the far right is not.

When the number is red, the button uses the spend token (`--chart-spend` border/text, or a filled spend chip) so the control that closes the hole is the same color as the hole. Assign (non-negative) stays the existing rule-border control. One slot, inverted job, inverted emphasis.

**D3 — The dialog is a source register, not a form.** ModalShell. Headline is the remaining hole (tabular, spend-colored, same order of magnitude as the summary number) plus “You assigned more than you have.” Under it: **Un-assign money from** and a month switcher (viewed month + later months that have at least one envelope with Available `> 0`). The body is Regular spending / Bills / Savings, group headings as on the Budget tables, only envelopes with Available `> 0`, Available on the right in tabular figures. Hidden envelopes follow the page’s show-hidden switch. Income never appears.

Picking a row selects it (highlight, not a native `<select>`). Amount defaults to `min(Available, |viewed RTA|)`. **MAX** fills Available (may overshoot RTA to positive — then the job is done). Expression entry. Preview names both sides:

- `This will take Pizza from $21.65 Available to $0.00.`
- `Ready to Assign from −$9,765.23 to −$9,743.58.`

Confirm verb is **Un-assign** (not Move, not Fix). Cancel closes. After a successful write the dialog **stays open**, selection clears, list and hole refresh from the new fold. When displayed RTA of the viewed month `≥ 0`, the dialog closes itself (the summary button is Assign again).

**D4 — The hole is the viewed month; the source month is the picker.** Unassigning Groceries in August writes August. Switching the picker to September and unassigning Rent writes September’s allocation; August’s displayed RTA recovers through `assignedInFutureMonthsCents`. Default amount always uses the **viewed** month’s hole, not the picker month’s RTA.

**D5 — Operation.** New pure `unassignToReadyToAssign` in `operations.ts`: clamp `moved` to `[0, max(0, source.balanceCents)]`, write `assigned' = assigned − moved` (Assigned may go negative when the money is leftover/carry-in — valid, same as YNAB). No-op if `from` is income. Movement note: `Unassigned $X from Pizza to Ready to Assign on {day}`. New `BudgetOperation` kind `unassign`. No schema.

**D6 — Out of scope.** Toasts and undo. Session-based “categories I touched this sitting.” Named “leftover from last month” chip (leftover is just Available). Hold Release as a picker row. Redesigning Assign’s Auto tab. Envelope-to-envelope Move Money. Credit-card payment categories.

### Visual (our style)

Planner tokens only: `ink`, `surface`, `rule`, `--chart-spend`, `--chart-income`, `--select`. No new typeface. The one memorable thing is **the hole and the verb as one object**, then a working list of envelopes you can raid. Wireframe: `visuals/approved-wireframe.md`.

Copy is the existing note plus the verbs Fix This / Un-assign. Empty picker month: “Nothing in {month} has Available to un-assign.” No apology.

## Acceptance criteria

- [x] When the viewed month is current or future and Ready to Assign `< 0`, the summary button reads **Fix This**, sits next to the number (not `ml-auto`), and uses spend emphasis. The muted note is not between the number and the button.
- [x] When Ready to Assign `≥ 0`, or the viewed month is in the past, the same slot reads **Assign** and opens Assign as today.
- [x] Fix This opens a ModalShell listing Regular / Bills / Savings envelopes with Available `> 0`, grouped like the Budget tables, with a month switcher for this and later months that have such envelopes.
- [x] Picking a row, editing amount (default `min(Available, hole)`, MAX = Available, expressions), and Un-assign writes one clamped unassign. Assigned may go negative. Available does not go negative. Ready to Assign of the viewed month moves by the moved amount.
- [x] Unassigning in a future month recovers current (viewed) Ready to Assign via assigned-in-future. The Budget page `?month=` does not change.
- [x] After each write the dialog stays open and refreshes until Ready to Assign `≥ 0`, then it closes.
- [x] Tools ▸ Assign, Move money to…, Cover overspending, and leftover Hold Release are unchanged.
- [x] A second user cannot unassign the first user’s allocations.
- [x] Lint, typecheck, unit tests, integration tests (Postgres up), `npm run smoke` on the running server. Browser: drive a real negative RTA (over-assign inline, and assign-into-next-month) through Fix This, including a future-month source and MAX overshoot.

## As-built

- `unassignToReadyToAssign` / `unassignMovedCents` in `src/lib/finances/budget/operations.ts`
- Picker model in `src/lib/finances/budget/fixThis.ts`
- `BudgetOperation` kind `unassign` in `mutations.ts`; `budget.fix-this` in `BudgetView`
- `BudgetSummary` action slot; `FixThisDialog`

This budget’s start month is the current month, so a past-month page clamps to now. The past-month gate is `fixThisUnavailableReason` (`viewedMonth < monthKeyOf(todayKey)`).

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change | Why |
| --- | ------ | --- |
|     | None   |     |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-29-2033-budget-fix-this/` with `plan.md`, `shape.md`, `standards.md` (references only, pin `2920aa766f203439f2136c831f01ccd182c0654d`), `references.md`, and `visuals/`. Then stop — implementation is a fresh session.

## Task 2: Pure unassign + source list

In `src/lib/finances/budget/`:

- `unassignToReadyToAssign` next to `transferBetweenCategories`. Clamp, negative-Assigned-from-leftover, no-op at 0 / no Available / income. Tests in `operations.test.ts`, including a future-month write that changes only that month’s assigned (displayed-RTA recovery is a fold fact already tested in `envelope.test.ts`).
- Pure picker model (new small module or next to inspector): given fold months, viewed month, groups/categories, show-hidden → which months appear, which envelopes per section with Available `> 0`, default amount. Tests: empty future month omitted; hidden omitted unless show-hidden; income omitted; default `min(available, hole)` uses **viewed** RTA.

## Task 3: Mutation and command

`BudgetOperation` kind `unassign` `{ month, from, amountCents }`. `editFor` calls Task 2. `budgetOperationAction` already the wrapper. Integration: second user fails to unassign the first user’s row; owner write moves assigned and appends the note.

Register `budget.fix-this` (Tools, not nested under Assign): disabled with “Ready to Assign is not negative” or “Past months stay historical.” Available is disabled with the reason, never absent.

## Task 4: Summary layout + Fix This dialog

- `BudgetSummary`: one control next to the number; morph Assign / Fix This per D1–D2; note under the figure. Keep terms and account-pool line.
- New `FixThisDialog` (`ModalShell`, phone bottom sheet for free). List, month switcher, amount, MAX, preview, Un-assign. Unmount on close so the next open is clean. After success, parent `router.refresh()` and passes new data in; do not unmount while RTA still `< 0`.
- `BudgetView` opens it from the summary button and the command. Pass `data.months` so a future picker month does not need a second load.

## Task 5: Verify, freeze spec, update roadmap

Drive `/finances/budget` (desktop and ~390-wide): over-assign until red, confirm the button is on the number and says Fix This, un-assign one bill, then a future-month source, then MAX overshoot. Confirm Assign returns when RTA is non-negative. Tools ▸ Assign still works. Past month: no Fix This.

Update this spec for as-built drift, freeze, and add a short shipped note under the month-ahead / assign area of `agent-os/product/roadmap.md`.

---

While this spec is **active**, when we make a material change to requirements, design, or scope (including from feedback on what was implemented), update the relevant sections and append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.
