# References for the Command Surface

## Prior specs

### `agent-os/specs/2026-08-05-2121-command-deck-and-item-actions/` (frozen)

The slice this one is a delta on. Its **decisions carry forward**: keep the hand-rolled
`DataGrid` / `GridToolbar` / `CommandProvider` / `CommandPalette` architecture; the registry is the
source for every surface; destructive actions stay in menus and row menus with confirmation owned
by the existing dialogs; type colours are the signature accent; a filtered list is a view onto the
full tree, so priority repair always receives the complete persisted sibling set.

What this slice **replaces**: the compact `GridCommandDeck`, the `toolbarGroup` / `primary` /
`hasOwnControl` placement fields, and the unsorted `⋯` list on desktop.

### `agent-os/specs/2026-08-04-0924-grid-control-surface/` (frozen)

Establishes the contract the menu taxonomy extends: a tab declares _what it has_ and the shared
toolbar supplies _how you control it_, so a capability is added once rather than per grid.

### `agent-os/specs/2026-07-31-1520-persistent-ui-state/` (frozen)

Establishes `user_settings` + the `localStorage` write queue, and the rule that the first paint
must already carry a stored preference. The Commands panel's open/collapsed state follows it.

## Existing implementation

### The command layer

- `src/lib/commands/registry.ts` — the `Command` shape, `matchCommands`, `mergeCommands`,
  `overflowCommands`. Extended here; `overflowCommands` retires.
- `src/lib/grid/commandDeck.ts` — `buildGridCommands` is the single expansion point from a tab's
  capabilities to commands, and stays so. `primaryGridCommands` / `moreGridCommands` retire.
- `src/components/shell/CommandProvider.tsx` — `useRegisterCommands` / `useCommands`, including the
  dev churn guard that errors on an unmemoised array. Every new consumer must memoise.
- `src/components/shell/CommandPalette.tsx` — `⌘K`, unchanged in behaviour; it reads the same
  extended commands.
- `src/components/shell/OverflowMenu.tsx` — the anchoring pattern (`getBoundingClientRect` →
  button bottom-left) that `MenuButton` reuses. Becomes phone-only.
- `src/components/shell/globalCommands.ts`, `modules.ts` — the `go.*` entries; untouched.

### The chrome to match

- `src/components/shell/Sidebar.tsx` — **the visual target.** Section headings at
  `text-[0.625rem] font-semibold uppercase tracking-wider text-ink-faint` (`:104`); rows at
  `flex items-center gap-2 rounded px-2 py-1 text-[0.8125rem] leading-6` with active
  `bg-select font-medium text-ink` and inactive `text-ink-muted hover:bg-surface-raised
hover:text-ink` (`:119-125`); the 24px collapse toggle (`:68`); the `⌘K` teaching row with its
  `.tabular text-[0.6875rem]` shortcut badge (`:82-90`).
- `src/components/shell/navIcons.tsx:14` — the `BASE` spread (`viewBox 0 0 20 20`,
  `strokeWidth 1.5`, round caps/joins, `aria-hidden`) that the command glyphs must share.
  `ChevronIcon` (`:220`) is the one-path-flipped precedent.
- `src/components/icons/TypeIcon.tsx` — the per-kind glyphs already used in the selection chip.
- `src/components/tabs/tabChrome.tsx` — `TabToolbar` (and its `pinned` slot outside the scroller),
  `ToolbarButton`, `ToolbarSelect`, `ToolbarToggle`. Becomes the two-row shell.
- `src/components/grid/ContextMenu.tsx` — the one menu renderer: arrow / Home / End navigation
  skipping separators and disabled rows, the right-aligned shortcut column, measure-then-flip near
  the bottom edge, `stopImmediatePropagation` so the menu owns the keyboard, and closing on scroll
  without closing on the scroll it causes itself. Gains headings and an icon gutter.
- `src/components/outline/HintBar.tsx` — the existing `<kbd>` treatment, for shortcut badges.
- `src/app/globals.css` — the token vocabulary (`--shell`, `--surface-raised`, `--ink-muted`,
  `--ink-faint`, `--rule`, `--rule-strong`, `--select`, `--select-edge`, `--tap-target`) and
  `.tabular`.

### What the menus have to cover

- `src/components/outline/OutlineGrid.tsx:431-525` — the richest capability declaration, and
  `:541-608`, the 12-id row-menu allowlist this slice deletes. `useOutlineKeyboard` (`:967-1059`)
  is the fullest keyboard handler; its command half moves to `binding`, its selection half stays.
- `src/components/grid/useNodeCommandDeck.tsx` — the shared conversion / priority capabilities for
  the four node-list projections.
- `src/components/tabs/useGridTab.ts:155-171` (row menu) and `:198-232` (keyboard) — the pattern
  duplicated across the list tabs.
- Hand-written row menus to delete: `WishesGrid.tsx:253-272`, `NotesGrid.tsx`,
  `ContactsView.tsx:214+`, `ResourcesView.tsx`, `TimeChartsView.tsx`,
  `DailyItemsGrid.tsx:254+`, `MetricsView.tsx:363,435`.
- Bespoke toolbars with no overflow: `MetricsView.tsx`, `FitnessView.tsx`, the Day header, and
  `ScheduleView.tsx`.
- `src/components/grid/ViewPicker.tsx:57-104` — Save / Update / Rename / Delete view, which become
  the `View ▸ Saved views` section.
- `src/lib/keyboard.ts` — `isTypingTarget` and `isModalOpen`, the guards the single dispatcher
  keeps.
- `src/lib/settings/shell.ts`, `src/components/settings/SettingsProvider.tsx` — `useSetting` and
  the module-level-codec contract the panel's persistence follows.

## Achieve reference pack

- `visuals/achieve-outline-commands-panel-and-toolbars.png` — the docked **Outline Commands** task
  pane (`New` / `Insert Row` / `Actions` / `Move` / `Outline Zoom`, each collapsible, each row an
  icon plus a verb) beside the two icon toolbars. This is the panel this slice modernises.
- `visuals/achieve-outline-menu.png` — the `Outline` menu: sections separated by rules, an icon
  gutter on the left, shortcuts right-aligned, and sub-families as submenus. This is the menu
  anatomy being reproduced.
- `visuals/achieve-outline-row-menu.png` — the row menu, with `Insert ▸` / `Outline ▸` /
  `Actions ▸` submenus. The submenu structure is deliberately deferred to the follow-on
  right-click spec.
- `docs/achieve-planner/online-help.md` — command and menu vocabulary, and Achieve's own
  keyboard-discoverability intent.
- `docs/achieve-planner/user-manual.md` — Outline/tree actions, priorities, conversion.
- `docs/achieve-planner/workflow-and-training.md` — Outline zoom and next-action workflow.
- `screenshots/CustomizeKeyboardSS.png` — Achieve's keyboard customisation dialog. Not in scope,
  but it is the reason bindings belong on the command descriptor rather than in a `switch`: a
  rebindable shortcut is only possible once there is one place that owns the binding.

## Modern references considered

Not code to copy, but the patterns that informed the shape: **Google Sheets** (a classic menu bar
is not wrong in a browser — the app chrome reads as distinct from the browser chrome), **Excel
Online** (a simplified ribbon; rejected here on vertical cost), **Airtable** (grid + views +
details pane), **Linear / Notion** (command palette as the power path, quiet chrome), and
**Microsoft Fluent's command-bar guidance** (5–7 highest-frequency actions visible, sorted by
importance then grouped, the rest in overflow).
