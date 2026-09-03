# Cancelled bill handling

**Status: active**  
Spec folder: `agent-os/specs/2026-09-03-0951-cancelled-bill-handling/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-23-2313-one-budget/` — a bill is a `kind: 'bill'` envelope; `/finances/budget` is the only budgeting page; `status` is `active | paused | cancelled`.
- **Extends:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` and later Budget structure work — Hide is a Budget display flag; Show Hidden is the existing grid switch; hidden rows drop from the grid, not from totals.
- **Extends:** `agent-os/specs/2026-08-25-1633-budget-inspector/` — bill status, next charge, cadence, URL live in the inspector, not extra grid columns.
- **Extends:** `agent-os/specs/2026-08-21-2038-paused-bills-assignment/` — cancelled keeps the row and its history and is not an ask; paused stays on the grid (house-move). Pause is unchanged.
- **Extends:** `agent-os/specs/2026-08-29-1605-hidden-categories-in-picker/` and `2026-08-30-1331-category-picker-everywhere/` — Register still lists retired envelopes so history can be filed. Destination catalogs (Move money / Assign Manual) stay as they are.
- **Supersedes:** `agent-os/specs/2026-08-25-0901-bill-next-charge/` **D5 only for cancelled bills.** Paused scheduled bills still show (and can edit) next charge. Cancelled bills do not: no next-charge date, no editor. Stored `anchorDate` is kept so reactivate restores the walk.
- **Does not supersede** Hide envelope, Show Hidden, or `hidden` on ordinary envelopes. Cancelled visibility is derived; we do not auto-set `hidden`.

## Context

A cancelled bill currently stays on `/finances/budget` like any other envelope. Hide envelope exists on the row menu, but that is the wrong tool: cancelled is already a fact about the obligation, and hiding a row that still holds leftover dollars would make those dollars unreachable.

What we want: cancelled-and-done leaves the monthly budget on its own, comes back if money or a charge is still in that month, and warns if a charge posts after cancel. Show Hidden is the way back to a quiet cancelled bill, because otherwise there is no other surface that lists it on Budget.

## Decisions

- **D1 — Derived visibility, not a new flag.** Do not auto-set `hidden`. Do not add a Hide-cancelled control. `status === 'cancelled'` plus this month’s money columns is enough.
- **D2 — Quiet cancelled bills leave the grid.** In the viewed month, omit a cancelled bill unless **Assigned ≠ 0 or Activity ≠ 0 or Available ≠ 0**. A payment already in that month keeps the row; the next month with all three at $0 drops it. Leftover dollars (Available, including carry-in) keep it visible until they are moved out. Do not auto-move money on cancel.
- **D3 — Show Hidden also reveals quiet cancelled bills.** Same existing switch, same label. Without it there is no Budget way to see a $0 cancelled row. Hidden envelopes still work as today. A quiet cancelled row revealed this way uses the same subdued name treatment as a hidden envelope (italic / faint) so it does not look live.
- **D4 — A later charge reappears.** Payee claims still file into a cancelled bill. Non-zero Activity that month puts the row back on the grid (D2) even with Show Hidden off.
- **D5 — Inspector warning, not a new status.** Status stays Cancelled. When `status === 'cancelled'` and this month’s Activity ≠ 0, the inspector shows an error line: **A charge posted after this bill was cancelled.** No extra row chrome. Available already goes red if that charge overspends leftover.
- **D6 — Cancelled has no next charge date.** Skip cancelled bills in `loadNextDueKeys` / `loadBillAnchors`. Inspector omits the Next charge field (not “Unscheduled”, not a picker, not “—” as an editable empty). Do not clear stored `anchorDate`. Paused is unchanged.
- **D7 — Totals and other surfaces.** Same as Hide: omit from the grid, not from `budgetRows` / `budgetTotals` (quiet rows are $0 anyway). Assign already skips cancelled. Fix This / cover-from still include a cancelled envelope with Available > 0 — that is how leftover is drained. Paused always stays on the grid (subject to Hide). Register / picker still list cancelled bills so history can be filed.

### Out of scope

- Auto-assigning leftover out of a cancelled bill
- Auto-setting `hidden` on cancel
- Changing paused visibility
- Schema / `cancelledOn` changes
- Marking `(cancelled)` in the Register picker
- Omitting cancelled from Move money / Assign Manual destination catalogs
- Renaming the Show hidden switch
- Dashboard / Next 12 months / Expected vs income (already skip cancelled for forward-looking figures)

## Acceptance criteria

- [ ] Cancelled bill with $0 Assigned, $0 Activity, $0 Available is absent from Bills (Show Hidden off) in that month.
- [ ] Same bill stays on Bills in a month that already has a payment (Activity ≠ 0), then is absent in a later $0 month.
- [ ] Cancelled bill with leftover Available (or Assigned) stays visible until that money is moved out. Hide is not required.
- [ ] Show Hidden on reveals quiet cancelled bills, subdued like hidden envelopes; off hides them again.
- [ ] A charge filed to a cancelled bill in the viewed month brings the row back without Show Hidden. Inspector shows **A charge posted after this bill was cancelled.** Status remains Cancelled.
- [ ] Cancelled scheduled bill has no Next charge in the inspector and no next-due key. Reactivating restores next charge from the stored anchor. Paused still shows and edits next charge.
- [ ] Hide envelope still works for ordinary (and active/paused) envelopes. Cancelled does not write `hidden`.
- [ ] Unit tests on the visibility predicate, next-due skip, and inspector warning. No React component tests. lint, typecheck, `test:unit`. Browser: cancel a paid bill, a leftover bill, a $0 bill; Show Hidden; post a charge after cancel; confirm next charge is gone.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-09-03-0951-cancelled-bill-handling/` with:

- **plan.md** — this plan (**Status: active**), including empty **Changes from original plan**
- **shape.md** — shaping notes (scope, decisions D1–D7, no visuals, product alignment)
- **standards.md** — references, not copies; pin standards commit `7c716173ffbf08c8490284aba3e515ce88178034`
- **references.md** — governing specs and code studied
- **visuals/** — none

## Task 2: Visibility predicate in lib

Put the rule in `src/lib/finances/budget/` (not `BudgetView`): a cancelled bill is quiet when Assigned, Activity, and Available are all 0.

`nestedBudgetGridRows` / `sectionGridRows` omit quiet cancelled rows unless `showHidden`. Hidden envelopes stay on the existing `hidden` gate. Paused is never quiet by status.

Tests in `hierarchy.test.ts` / `rows.test.ts` that would fail if quiet cancelled stayed on the grid, if leftover Available hid the row, if Activity kept it, or if Show Hidden did not bring it back.

## Task 3: Next charge skips cancelled

`loadBillAnchors` / `loadNextDueKeys` skip `status === 'cancelled'` (today they walk every scheduled bill of any status). `billInspectorView`: cancelled → `showDateEditor: false` and no Unscheduled copy unless the bill is actually unscheduled. Inspector omits the Next charge field when cancelled.

Do not write `anchorDate: null` on cancel. Tests: cancelled scheduled has no next-due key; paused still does; unscheduled copy is unchanged.

## Task 4: Inspector warning

Pure helper: cancelled + this month’s Activity ≠ 0 → warning copy. `BudgetInspector` renders it as an error-toned line in the Bill section. No new envelope status. Unit tests on the helper.

## Task 5: Subdued name when revealed via Show Hidden

Quiet cancelled rows (the Show Hidden set) use the same italic / faint name treatment as `row.hidden`, so a resurrected $0 cancelled bill does not scan as live. Cancelled-with-money and cancelled-with-activity keep normal name chrome (the warning is in the inspector).

## Task 6: Verify, freeze spec, update roadmap

- Browser on `/finances/budget`: the four cases in acceptance (paid this month, leftover, $0, later charge) plus Show Hidden and next-charge omission. Phone-width inspector sheet.
- lint, typecheck, `test:unit` (Postgres up if any integration file is touched — this work should stay unit-level).
- Update plan/shape for as-built drift; complete **Changes from original plan**.
- Mark **Status: frozen / complete** (date). Follow-ups as new work, not edits to the frozen folder.
- Roadmap: short note under the Budget/bills cluster that cancelled quiet rows leave the grid and return on activity or leftover, with Show Hidden as the reveal.

---

While this spec is **active**, when we make a material change to requirements, design, or scope (including from feedback on what was implemented), update the relevant sections and append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.
