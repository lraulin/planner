# Budget inspector (slim tables + right pane)

**Status: frozen / complete** (2026-08-25)  
Spec folder: `agent-os/specs/2026-08-25-1633-budget-inspector/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-23-2313-one-budget/` — a bill is a `kind: 'bill'` envelope; `/finances/budget` is the only budgeting page; Regular then Bills then an All spending footer then Savings.
- **Extends:** `agent-os/specs/2026-08-24-0930-envelope-sections/` — `kind` is the section; All spending is bills + regular; Savings is held out.
- **Extends:** `agent-os/specs/2026-08-25-1310-budget-funding-indicators/` — the scan layer (bar, copy, Available pill) stays on the grid. This spec takes the item that spec named out of scope: the YNAB inspector pane.
- **Extends:** `agent-os/specs/2026-08-25-0901-bill-next-charge/` — the Next charge write (`anchorDate` via `onPatchBill`, `nextChargeWriteError`) moves off the grid cell into the inspector. Validation is unchanged.
- **Extends:** `agent-os/specs/2026-08-14-1104-unscheduled-bills/` — propane stays `scheduled: false`; no fabricated charge date; inspector language is the estimate, not a due date.
- **Extends:** `agent-os/specs/2026-08-22-2242-budget-goal-templates/` — Regular / Savings still edit their ask in `TemplateDrawer`. The inspector shows target status and opens that drawer; it does not become a second template editor.
- **Extends:** `agent-os/specs/2026-08-24-1311-budget-assign-options/` — Assign stays the month-bar control and the row menu. The inspector may offer the existing one-envelope Underfunded action; it does not grow a second assign engine.
- **Supersedes:** `agent-os/specs/2026-08-23-2313-one-budget/` **D6** only the clause "Bills keep the Commitments columns" on the grid. The section split (Regular, then Bills, then All spending, then Savings) stands. Bill-only fields live in the inspector instead of extra grid columns.

## Context

YNAB and Actual treat bills as ordinary categories plus optional targets. This app already went further: bills are first-class envelopes (`kind: 'bill'`) with cadence, next charge, status, URL, Review, and Track as bill. That model is **not** being reopened.

What is wrong is the **page**: Bills is a wide table sitting between Regular spending and Savings, which only have four columns. The name column on the slim tables stretches to match, and the dual job of "obligation record + money envelope" is dumped into the same row.

The user chose **enriched bill envelopes** (not a separate obligation registry) and a **two-pane layout**: the left tables stay money columns; the right pane is the obligation/target inspector.

This is a layout and chrome spec. Funding math, templates, detection, and schema stay.

## Decisions

**D1 — Envelopes remain the registry.** No `finance_obligations` table. A bill is still one `finance_budget_categories` row. Paused / cancelled / unscheduled already cover "exists but not asking for money this month."

**D2 — Same four columns on every money table.** Regular, Bills, and Savings all render Name / Assigned / Activity / Available. Bill-only columns leave the grid entirely — not hidden, not in Show Fields. Persisted bill-grid column order that names the removed ids is ignored.

**D3 — Section order is unchanged.** Income (not a table) → Regular spending → Bills → All spending footer → Savings. Two stacked tables, not one unified spending DataGrid.

**D4 — Persistent inspector on desktop; full-screen sheet below `md`.** Master-detail, not the existing Drawer job. `TemplateDrawer` / `BudgetStructureDrawer` / `ReviewDrawer` stay for focused edit. Deeper target configuration still opens `TemplateDrawer` from a button in the pane.

**D5 — Desktop split.** Month bar and Ready to Assign stay full-width and pinned. Below them: left pane independently scrolls the stacked tables (plus Income, notices, Forecast); right pane is sticky, ~20rem, `hidden md:flex`. Empty state: "Select a category to see details." The inspector shows the focused table's `selectedId`. Multi-select does not change it.

**D6 — Phone: tap name (or Enter) opens the sheet.** Assigned / Available stay inline. Checkbox tap selects without opening. Long-press row menu is unchanged. Escape / close returns to the list.

**D7 — Inspector content, in this order.**

1. Header — envelope name. Available as the headline number (same figure as the grid pill).
2. Available breakdown — Actual's identity: leftover from last month (carry-in), assigned this month, activity. No cash-vs-credit split.
3. Target — read-only status from the existing indicator. Regular / Savings: Create Target / Edit Target opens `TemplateDrawer`. Bills: the target _is_ the bill facet; no template lines.
4. Bill metadata — only when `kind === 'bill'`. Editable with the same `onPatchBill` path: cadence, next charge, amount, status, URL. Derived A year / Monthly. Edit payees / Open URL. Unscheduled copy is estimate language, never a charge date.
5. Quick actions — existing one-envelope Assign → Underfunded when `moreNeeded > 0`. Cover / move stay on the Available cell. No snooze.
6. Notes — `finance_budget_categories.notes` via `updateBudgetCategory({ notes })`.

Income is not selectable.

**D8 — Bill writes move with the columns.** Cadence, next charge, amount, status, and URL are no longer inline grid editors. `nextChargeWriteError` still refuses a date on or before the last posted charge.

**D9 — Out of scope.** Schema / migrations. New target types. Snooze. Separate obligation registry. Amount history. Guided cancel/skip. Earmarked savings. Dashboard / Register. Replacing Actual templates. Filter chips. Auto-Assign as a second control in the pane. Persisting inspector width.

**D10 — Named divergence.** The Budget page has a YNAB-shaped inspector. Envelope math, templates, and bill-cadence demand stay Actual-derived.

## Acceptance criteria

- [x] On `/finances/budget` at `md+`, Regular, Bills, and Savings tables show only Name / Assigned / Activity / Available. Bill-only fields are not in Show Fields.
- [x] Desktop: Month bar + Ready to Assign stay full width; a sticky right inspector (~20rem) fills from the focused table's selected row; left tables scroll independently. Empty inspector copy when nothing is selected.
- [x] Selecting a bill shows cadence, next charge, amount, status, URL, yearly/monthly, and estimate language for an unscheduled bill (no date picker).
- [x] Editing next charge / cadence / amount / status / URL in the inspector persists and survives reload. A next-charge date on or before the last posted charge is refused with the existing error.
- [x] Regular / Savings inspector shows Available breakdown + target status; Create/Edit Target opens `TemplateDrawer`. Bills do not open that drawer from Target.
- [x] Notes typed in the inspector persist on the envelope.
- [x] "Assign $X to stay on track" funds that envelope through the existing one-row Underfunded path and does not drive Ready to Assign negative.
- [x] Below `md`: no right pane; tapping the name opens the same inspector as a full-screen sheet; Assigned / Available / checkbox taps do not; long-press menu still works; closing the sheet returns to the list.
- [x] Funding indicators, Assign dialog, Review, structure drawer, and All spending = bills + regular are unchanged.
- [x] `npm run lint`, `npm run typecheck`, `npm run test:unit` (Postgres up if any mutation test is touched), `npm run smoke` with the dev server up. Browser-verified desktop and 390-wide.

## Changes from original plan

| #   | Change                                                                   | Why                                                                                         |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 1   | Notes are a controlled textarea keyed on the envelope id                 | An uncontrolled `defaultValue` field was wiped on parent re-render before blur could commit |
| 2   | `onOpenDetail` is always passed; the sheet still renders only below `md` | Compact name-tap must open the sheet even if `useIsCompact` hydrates after first paint      |

## Task 1: Save Spec Documentation

This folder: `plan.md`, `shape.md`, `standards.md`, `references.md`, `visuals/`.

## Task 2: Unify the column set

Bills use Name / Assigned / Activity / Available. Bill-only columns leave the grid.

## Task 3: Desktop split + inspector pane

Sticky right pane; bill writes and notes live there; TemplateDrawer from Target on Regular/Savings.

## Task 4: Phone sheet

Below `md`, name tap / Enter opens the inspector as a full-screen sheet.

## Task 5: Verify, freeze spec, update roadmap

Browser desktop + 390-wide; gate; freeze; roadmap.

## Follow-ups (new work — not amendments to this frozen spec)

- Weekly targets (Friday pizza / Sunday groceries as weekday cadence)
- YNAB-style target rewrite (set-aside vs refill vs have-a-balance)
- Snooze
- Separate obligation registry
- Amount history / occurrence overrides
- Guided cancel/skip from a red envelope (roadmap Next)
- Earmarked savings
- Persist inspector width
