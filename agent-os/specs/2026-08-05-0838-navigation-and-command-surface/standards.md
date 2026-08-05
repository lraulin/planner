# Standards that applied

**Status: frozen / complete** (2026-08-05)

## `components/ux-principles.md`

- **"A gesture nobody can see is not a discoverable action"** and the decision-guide row
  _"Is the action only reachable by hover / right-click / double-click / a shortcut? → It is
  broken on touch."_ This is the rule that makes a palette-only command surface illegal, and
  therefore the reason the `⋯` overflow exists. The palette is the fast path; `⋯` is the
  visible one.
- **"Keyboard first on desktop, touch-complete on phone."** Both halves are load-bearing
  here: `⌘K` is the desktop half, and the More sheet plus `⋯` is the phone half. Neither is
  optional.
- **"Progressive disclosure — show only what's needed now."** The whole argument for moving
  `Reset this grid` and `Show Fields` off the permanent toolbar.
- **"Context preservation."** The sidebar is deliberately not a drawer or an overlay: it
  does not cover the grid, and collapsing it is a persistent choice rather than a mode you
  fall into.
- **"Tabs organise sections within a form"** — and the table saying tabs-per-data-item is
  wrong. Worth reading closely, because eleven top-level tabs is not quite the failure that
  table names, but it is the same family: the tab strip had become an index, and an index is
  what a sidebar or a palette is for.

**Amended by this spec:** the **Layout & Navigation** section gains a pointer to the new
`navigation.md`.

## `components/responsive.md`

- **"`md` — 48rem / 768px … At and above it is _the instrument_: the full grid, the right
  drawer, **the tab strip**, the keyboard model."** Factually wrong after this change; the
  desktop-versus-phone table needs a sidebar ↔ bottom-nav row.
- **"Adaptive, not shrunken."** The sidebar does not appear below `md` at any width — the
  phone keeps the bottom nav and More sheet it already has. A collapsed icon rail on a 390px
  screen would be the shrunken answer.
- **44px tap targets**, explicitly not covered by the accessibility exemption. Applies to the
  `⋯` button and to every row of the grouped More sheet.

**Amended by this spec:** the `md` description and the desktop/phone table.

## `components/modal-pattern.md`

- **"Build every centered dialog on `ModalShell`."** The command palette is one, so it gets
  the shell's roles, capture-phase Escape, focus handling, and the below-`md` bottom sheet
  for free.
- **"`isModalOpen()` finds a dialog by exactly these [roles]."** The `⌘K` handler must use
  the same guard `QuickCapture` uses (`src/lib/keyboard.ts`), or the palette will open on
  top of an open drawer or confirmation.
- **"Unmount a dialog that holds a draft."** The palette holds a query string; it unmounts on
  close so the next `⌘K` starts empty rather than showing the last search.

## `components/data-grid.md`

- **"A toolbar earns its width; every button on it is one the user has to read past to find
  the one they want."** The direct mandate for the `⋯` tier.
- **"Keep _commands_ and _view controls_ in separate bars where a view has many commands."**
  The Outline already does this (`FilterBar` versus `GridToolbar`). The overflow menu is the
  generalisation: commands go behind `⋯`, view controls stay on the bar.
- **"A tab declares what it has — it does not assemble buttons."** The same contract governs
  commands: a view registers what it can do and gets both renderers, rather than building a
  menu.
- **"Below `md` the toolbar is one horizontally-scrolling row."** Moving two controls into
  `⋯` shortens that row, which is a real gain on a phone and not only on a desktop.

**Amended by this spec:** a short **Overflow** subsection under **Toolbar**, naming the
third tier and the test for what belongs in it.

## `development/testing.md`

- **"Put real logic in `src/lib/**`, not in components."** The command match / rank function
  and the `shell` settings codec are pure and live there with tests; the provider, palette,
  sidebar and overflow button are wiring.
- **"Do not write React component tests."** So the sidebar and palette are verified in a real
  browser via the `run-planner` skill, not with a test runner.
- **"A test earns its place if it would fail on a plausible mistake."** Planned tests: two
  commands sharing an id (which would make one palette row shadow another), a `reserved` view
  leaking into the go-to entries (a dead navigation target), and a junk `shell` blob falling
  back to expanded rather than throwing on load — that one runs before the first paint.

## `database/migrations.md`

Read and found **not to apply**: the `shell` scope is a new row in the existing
`user_settings` table, not a schema change. No migration.

## New: `components/navigation.md`

Created by this spec. Covers the sidebar / palette / `⋯` triad, the one-registry rule, the
"no command is palette-only" rule, and how a reserved view differs from a built one.
