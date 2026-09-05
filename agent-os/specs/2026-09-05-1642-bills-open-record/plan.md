# Bills open-record gestures

**Status: active**  
Spec folder: `agent-os/specs/2026-09-05-1642-bills-open-record/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-09-05-1200-finances-envelope-workflow/` — Bills stays a management grid with a full-record overlay drawer (`?detail=`). Forecasts, discovery, and Budget/Register links stay. Amount, cadence, status, group, and next-charge may remain inline.
- **Supersedes:** `agent-os/specs/2026-09-05-1200-finances-envelope-workflow/` — only the as-built name cell and open-record path. The Bill name is no longer an always-on `TextCell`, and “double-click inside controls stays in the editor” does not apply to the name. The protection still holds for real cell editors (amount, cadence, date, selects).
- **Extends:** `agent-os/specs/2026-07-27-1318-per-type-detail-forms/` — Enter / double-click opens the record; F2 / Shift+Enter renames.
- **Extends:** `agent-os/specs/2026-08-18-1254-detail-deep-links/` — `?detail=` is still how the drawer is addressed.
- **Does not change:** `agent-os/specs/2026-08-25-1633-budget-inspector/` — Budget keeps its persistent right pane. Bills keeps the overlay drawer.

## Context

`/finances/bills` already has a right-sliding drawer (name, group, `BillFields`, notes, Budget/Register links). It is hard to reach.

Default columns are all always-on controls (`TextCell` name, `<select>` group/status, `AmountCell`, `CadenceSelect`, `DateKeyCell`). `DataGrid` skips `onOpenDetail` when the double-click lands on `input, select, textarea, button, a, [contenteditable]`. Enter is not registered as Open. The only reliable open is double-clicking empty space past the last column, or the row menu’s “Open bill”.

That is the opposite of every other catalog grid. Outline, Jobs, Contacts, Resources, Residences, Accounts, Metrics: the name is display text; Enter / double-click (or compact tap) opens the record; F2 / Shift+Enter renames.

The envelope-workflow change that excluded controls from double-click was justified for **amount/date editors** (drawer focus-theft mid-edit). It is not justified for the **name**. Renaming is not the primary Bills job. Opening the record is — due day, lead, scheduled, payees, and notes live there, and after `2026-09-05-1401-bill-due-dates-and-lead-time` they are load-bearing.

Budget is a different page with a different primary job (assigning money) and a persistent inspector, so its name double-click = rename is its own exception. Bills uses an overlay drawer, so it follows Outline/Jobs.

## Decisions

- **D1 — Keep the overlay drawer.** Do not add a Budget-style persistent inspector. The panel exists; the bug is reaching it.
- **D2 — Name is display until Rename.** Bill name renders as text. Double-click on the name (and on non-control row chrome) opens the drawer. Compact tap on the name opens the sheet. Selected-row ⤢ is not required (Jobs/Contacts don’t have it).
- **D3 — Open and Rename are catalog commands.** `record.open` (“Open bill”, Enter) and `record.rename` (F2 / Shift+Enter) go through the shared command catalog so they appear in Item, the Commands panel, `⌘K`, and the row menu. Creating a bill still opens the new row’s drawer (`setDetail` after create).
- **D4 — Other default columns may stay inline.** Group, next charge, amount, cadence, status remain in-place editors. Double-click inside those controls still stays in the editor (envelope-workflow protection). That is the justified exception: those cells’ job is the edit.
- **D5 — Rename swaps the name into an input** for that row only (Budget’s `RenameInput` contract: Enter/blur commit, Escape revert, empty/unchanged is cancel). Not a permanent `TextCell`.
- **D6 — Row menu keeps the extra links.** Open bill, Open in Budget, View transactions. Hand-rolled duplicates of Open/New should yield to the catalog so labels and shortcuts cannot drift.
- **D7 — Out of scope.** Persistent inspector. Stripping amount/cadence/status editors. Adding Delete (bills are cancelled). Payees’ always-on name input (same smell; follow-up if it shows up). Drawer field content.

## Acceptance criteria

- [ ] Double-click the bill **name** opens the existing drawer. Double-click empty row chrome does too.
- [ ] Enter with a bill selected (focus not in a cell editor) opens the same drawer. Item ▸ Open bill, row menu, Commands panel, and `⌘K` all run it.
- [ ] Compact (below `md`): tapping the name opens the sheet; tapping amount/cadence/status still edits those controls.
- [ ] F2 / Shift+Enter / Item ▸ Rename puts the selected name into an input. Enter/blur commits; Escape reverts; empty or unchanged does not write.
- [ ] Double-click (or Enter) inside amount, cadence, status, group, or next-charge still commits/stays in that editor — it does not steal focus into the drawer.
- [ ] New bill still opens the drawer on the created row. `?detail=` still deep-links.
- [ ] Open in Budget and View transactions remain on the row menu.
- [ ] Browser-verified desktop and phone, both themes. `src/app/finances/bills/page.tsx` is unchanged, so `npm run smoke` is optional; still start the app and click through. `npm run lint`, `typecheck`, `test:unit`.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-09-05-1642-bills-open-record/` with:

- **plan.md** — this plan (**Status: active**), including empty **Changes from original plan**
- **shape.md** — shaping notes (scope, decisions, context)
- **standards.md** — which standards apply, why, and any deviations (references, not copies)
- **references.md** — governing specs and reference implementations
- **visuals/** — none

## Task 2: Name cell and rename session

In `billColumns.tsx` / `BillsView.tsx`:

- Render the name as text (same type as Jobs/Contacts), not `TextCell`.
- Hold `renamingId` on the view. Rename command / F2 swaps that row to a `RenameInput`-style field (commit on Enter/blur, Escape cancels). Reuse Budget’s contract; do not import Budget chrome.
- Stop `TextCell` on the name only. Notes column may stay `TextCell` (hidden by default, not the open-record target).

## Task 3: Catalog Open / Rename / New

Wire `catalogCapabilities` (or the same `GridCommandCapabilities` shape) on `BillsView`:

- `openLabel: "Open bill"`, `onOpen: setDetail`
- `onRename` starts the session in Task 2
- Keep `New bill` and `Discover recurring charges` as catalog/page commands
- Do **not** add Delete
- Derive the row menu from the catalog, then append Open in Budget and View transactions
- Drop the hand-written `bills.new` duplicate if the catalog already registers create

## Task 4: Verify, freeze spec, update roadmap

- Click through `/finances/bills`: name double-click, Enter, F2, amount/cadence double-click, compact tap, `?detail=`, New bill.
- Confirm Budget inspector and other catalog grids are unchanged.
- Update plan/shape for as-built drift; complete **Changes from original plan**.
- Mark files **Status: frozen / complete** (date); list follow-ups as new work.
- Short roadmap note under the Bills/envelope-workflow cluster if this is worth recording.

> While this spec is **active**, when we make a material change to requirements, design,
> or scope (including from feedback on what was implemented), update the relevant sections
> and append to **Changes from original plan**. Skip pure implementation details. Freeze
> when verified.
