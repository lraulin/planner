# Grid checkboxes, bulk Register category, Outline Move to… — Shaping Notes

**Status: frozen / complete** (2026-08-27)

## Scope

Replace every DataGrid left gutter (row numbers, or Outline’s blank handle) with an
always-visible selection checkbox and a header select-all. Select-all is the currently
navigable row ids, including virtualized off-screen Register rows.

On Register, a Category edit that sits inside a multi-selection writes that envelope onto
every selected eligible transaction. `Set category…` is the same action as a registered
command. Ineligible rows (off-budget, on-budget transfers) are skipped with a count on the
existing ErrorBanner.

Catalog `Delete (N)` — and Notes, which already accepts `ids` but does not pass them —
actually deletes those N rows after one confirm.

On Outline, **Move to…** files the selected roots under a chosen parent (full tree including
tasks, plus Top level). Mixed legality: confirm, then move only the legal subset.

### Out of scope

- Bulk Payee, Notes, or other Register fields
- Clicking a year/month group header to select its members
- A toast stack (the app does not have one)
- Hover-only checkboxes (Actual Budget); we have no hover on phone
- AG Grid, numbered pagination
- Changing Category eligibility or `canNest`
- Multi-select drag (still deferred from the Outline scaffold spec)
- Move to… on Tasks / Projects / Goals grids
- Inbox as a special Move to… destination

## Decisions

- Checkboxes on every DataGrid, including Outline (named Achieve divergence: Achieve had
  neither checkboxes nor row numbers) and the budget tables.
- Header tri-state. Never-empty grids uncheck to the focus row; `allowEmpty` (budget)
  unchecks to empty. Empty budget selection still means Assign-all.
- `⌘A` is a registered Item command, not host-local keydown. It must not steal text-field
  select-all (`isTypingTarget`).
- Cell + command for Category. Cell on a row outside the selection stays single-row.
  Clicking the cell (or any cell control) on a selected row keeps the selection; the
  DataGrid must not collapse it on the way to focusing the editor.
- Skip ineligible rather than refuse the whole run. Zero eligible → the existing refusal copy.
- One bulk mutation; payee learning once per distinct payee in the written set.
- No new feedback chrome: ErrorBanner for skips/failures; ConfirmDialog for partial Outline
  moves; success is the cells / tree updating.
- Move to… reuses the Organizer Project Picker with tasks opted in. Organizer still hides
  tasks. Destination of `null` is labelled Top level.
- Selection reduced to roots. Excluded from the picker: those roots and their descendants.
- Partial apply after confirm; fully illegal destination is refused in the picker.

## Context

- **Visuals:** None. Designed from the existing DataGrid handle, not Actual’s hover checkbox.
  Destination UI is the existing Project Picker, not a new widget.
- **References:** See `references.md`.
- **Product alignment:** Phase 1 residual grid chrome (numbers → checkboxes). Envelope
  Register filing loop. Catalog bulk-delete follow-up from
  `2026-08-24-1522-category-by-kind-and-history`. Finance is beyond Achieve; Actual is the
  Category reference. Outline Move to… is the plural of indent/drag-inside, using the
  Organizer picker rather than inventing a second tree.
- **Shaping session:** Grok `/shape-spec`. User chose checkboxes on every DataGrid, both
  Category cell and command, skip-ineligible with a count, and the catalog Delete fix.
  Disregarded generic-advice mentions of a toast stack. Mid-shape, included Outline Move
  to… (full tree including tasks, Top level, confirm-and-move-legal-subset) rather than
  leaving it as a follow-up.

## Standards Applied

See `standards.md`.
