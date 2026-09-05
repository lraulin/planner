# References for Bills open-record gestures

## Governing specs

### `agent-os/specs/2026-09-05-1200-finances-envelope-workflow/`

- **Relationship:** Extends the Bills page and overlay drawer. Supersedes only the
  as-built name cell and open-record path.
- **Relevant decisions:** “Inline fields and full-record drawer share Budget bill
  controls.” Amount/cadence/status inline stays. The later change “shared grid
  double-clicks inside controls stay in the editor” stays for those controls; it must
  not apply to the name.
- **What this closes:** the drawer exists and is addressable via `?detail=`, but is
  unreachable from the name.

### `agent-os/specs/2026-07-27-1318-per-type-detail-forms/`

- **Relationship:** Extends the open/rename split.
- **Relevant decisions:** Enter / double-click opens the drawer; F2 takes over inline
  rename. That is the pattern Bills should match, not Budget’s name-double-click-to-rename.

### `agent-os/specs/2026-08-18-1254-detail-deep-links/`

- **Relationship:** Extends.
- **Relevant decisions:** `?detail=` via `useViewStateUrl` is how an open record is
  addressed. Bills already consumes it; create still writes it.

### `agent-os/specs/2026-08-25-1633-budget-inspector/`

- **Relationship:** Contrast, not a dependency. Do not copy the persistent pane onto
  Bills.
- **Relevant decisions:** D4/D5/D8 — Budget’s right pane and “bill-only fields leave the
  grid.” Bills is a different page with an overlay drawer; its primary job is the
  obligation record, reached by opening, not by a sticky inspector.

### `agent-os/specs/2026-09-05-1401-bill-due-dates-and-lead-time/`

- **Relationship:** Motive, not a code dependency.
- **Relevant decisions:** due day and lead live in `BillFields` (drawer/inspector), not
  as default grid editors. That is why opening the Bills drawer is now a primary job.

## Similar implementations

### Catalog grids (Open / Rename / New)

- **Location:** `src/components/grid/catalogCommands.ts`, used by
  `src/components/jobs/JobsView.tsx`, `src/components/contacts/ContactsView.tsx`,
  `src/components/residences/ResidencesView.tsx`
- **Relevance:** display-text name; `catalogCapabilities` registers Open (Enter) and
  the row menu from the same catalog. Bills should look like this, plus the extra
  Budget/Register links.
- **Key pattern:** `openLabel` is the noun (“Open job”); `commandCapabilities` on
  `GridToolbar`; `rowMenuFor(capabilitiesFor(...))`.

### Budget name rename session

- **Location:** `src/components/finances/budget/budgetColumns.tsx` (`RenameInput`,
  `renamingId`)
- **Relevance:** the commit-on-Enter/blur, Escape-revert, empty-is-cancel contract D5
  copies. Do not import Budget chrome (funding bar, due cue, rolls-over chip).
- **Do not copy:** Budget’s `onDoubleClick` on the name starts rename, because the
  inspector is already visible. On Bills, name double-click opens the drawer.

### Outline NameCell

- **Location:** `src/components/grid/cells.tsx` (`NameCell`)
- **Relevance:** display until editing; ⤢ on the selected row; Enter opens. Bills does
  not need ⤢ or indent rails — it is not a tree. The display-until-rename part is the
  borrow.

### DataGrid control exclusion

- **Location:** `src/components/grid/DataGrid.tsx` (row `onDoubleClick`),
  `src/components/grid/CompactRow.tsx` (tap)
- **Relevance:** double-click/tap on `input, select, …` does not call `onOpenDetail`.
  That is why an always-on name `TextCell` made the drawer unreachable. Do not change
  this shared handler; stop making the name a control.

### Current Bills surfaces

- **Location:** `src/components/finances/bills/BillsView.tsx`,
  `src/components/finances/bills/billColumns.tsx`
- **Relevance:** drawer, `setDetail`, hand-written row menu, `bills.new` / `bills.review`
  commands. Task 3 replaces the Open/New duplicates with the catalog and keeps review
  plus Open in Budget / View transactions.
