# Commands panel vs command palette

**Status: frozen / complete** (2026-08-17)
Spec folder: `agent-os/specs/2026-08-17-2124-panel-palette-roles/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-06-1010-command-surface/` — menu bar, icon toolbar, Commands panel, palette
- **Extends:** `agent-os/specs/2026-08-13-1050-menu-completeness/` — menus as the catalog; View ▸ Command palette; File registered at the shell
- **Extends:** `agent-os/specs/2026-08-05-0838-navigation-and-command-surface/` — palette is Achieve's Go menu, plus the command index
- **Supersedes:** `agent-os/standards/components/navigation.md` table cell that attributes `⌘K` to the Sidebar — the chord belongs to the palette; the sidebar Search… row is the teacher that opens it

## Context

The request started as "add search to the commands pane." That was a mix-up: the app already has two complementary accelerators of the same catalog.

| Surface                    | Question                                 | Interaction                      | When you reach for it                          |
| -------------------------- | ---------------------------------------- | -------------------------------- | ---------------------------------------------- |
| **Menu bar**               | What can I do here? (complete)           | Persistent chrome                | Always — the reliable path                     |
| **Commands panel**         | Show me the whole organized tree at once | Docked, hierarchical, left open  | When you want structure visible while you work |
| **Command palette** (`⌘K`) | What matches what I just typed?          | Overlay, search-first, ephemeral | When you know the name (or can type toward it) |

The menu bar stays the source of truth. Neither accelerator replaces it. A user who never opens the panel or the palette must still find every command by reading the menus.

**No redesign.** The six-surface model in `navigation.md` is already the right one for this app (Achieve's menu bar + Outline Commands pane + row menu, plus our palette). The work is to keep the roles crisp and close the few places docs and UI still disagree.

The palette already exists and is already searchable (`matchCommands` in `src/lib/commands/registry.ts`). It is opened by `⌘K`, by **View ▸ Command palette**, and by the sidebar **Search…** row. The reason it was easy to miss is the standards table, which currently says **Sidebar (`⌘K` to search)** — as if the rail itself were the search surface.

## Decisions

1. **Do not add search or a filter box to the Commands panel.** That would make the two surfaces compete. The panel's value is the opposite of search: the organization stays visible and stable. Achieve's Outline Commands pane was a headed list, not a second Go menu.
2. **The panel is the menu tree left open.** Same labels, icons, sections, disabled reasons, and bindings as the menu bar. Nested families (`NESTED_SECTIONS`) stay _expanded as headed groups_ here — folding is for the menu bar and the row menu, where space is scarce. "Left open" means you can see Convert to / Rank / Zoom without hovering.
3. **The palette is the only command-search surface.** It lists every menu command plus `group: "go"` destinations, via `mergeCommands(useGlobalCommands(), useCommands())`. Matching stays `matchCommands` (label subsequence, keyword word-prefix). Empty query keeps group order (Go to / This view / Selected row / App); a query ranks. Disabled commands stay in the list, greyed, with `title` as the reason. Unmount on close so the next open starts empty.
4. **`⌘K` belongs only to the palette.** The sidebar Search… row is the discoverable opener (and the thing that teaches the chord). It is not a second search implementation. **View ▸ Command palette** remains the menu-bar path. Below `md` there is no palette; `⋯` is the phone's menu. The More sheet has no Search row (stale comment in `CommandPalette.tsx` claims otherwise).
5. **Same name, icon, and action on every surface.** The palette currently prints label + shortcut and omits the glyph that menus and the panel already draw. Draw `CommandGlyph` there too. No icon on a `go.*` row is fine — `CommandGlyph` already accepts `undefined`.
6. **Out of this slice:** recent / frequent commands, a filter on the panel, a phone palette, matching on section names, argument prompts, rebinding shortcuts, a customizable command row.

## Acceptance criteria

- [x] `navigation.md` states the panel/palette split. The six-surface table no longer attributes `⌘K` to the Sidebar. `ux-principles.md` already named the split correctly and was left alone.
- [x] The Commands panel still has no search box.
- [x] The palette draws the same `CommandGlyph` as the panel / menus for commands that have an `icon`.
- [x] Stale comments no longer claim the phone More sheet has a Search row or a palette entry (`CommandPalette.tsx`, `commandEvent.ts`).
- [x] Opening the palette still works from `⌘K`, the sidebar Search… row, and View ▸ Command palette. Escape dismisses. Arrow / Enter still run an enabled match.
- [x] Unit tests (2700), typecheck, lint. Browser-verified at 1280×800 (three openers, icons, panel is a headed tree with no search) and 390×844 (More is destinations only; `⋯` still holds the tree). No `src/app/**` change, so `npm run smoke` was not required.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                                                                                       | Why                                                                                                          |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | Also rewrote the stale More-sheet claim in `commandEvent.ts`, not only `CommandPalette.tsx`. | Same false sentence in a second file.                                                                        |
| 2   | Left `ux-principles.md` untouched.                                                           | Its one-line command-surface sentence already names the panel as the tree left open and `⌘K` as the palette. |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-17-2124-panel-palette-roles/` with `plan.md` (this plan, **Status: active**), `shape.md`, `standards.md` (pointers + why, not a full paste), `references.md`. No visuals.

## Task 2: Tighten the standards

Edit the live `agent-os/standards/components/navigation.md`:

- Six-surface table: Sidebar loses ``(`⌘K` to search)``. Palette keeps ``(`⌘K`)``. Optionally note "Search… opens the palette" in the Sidebar role column — one clause, not a second chord claim.
- After the table (or under **Complete everywhere**), add a short **Panel vs palette** note: complementary accelerators; panel is the tree left open and is not a search surface; palette is the only command-search overlay; do not add a filter to the panel.
- Confirm the existing "Commands panel is the same tree left open" and "palette lists every menu command, plus Go-to" bullets still match these decisions. Adjust only if they imply the panel should search or that nesting folds on the panel.

Touch `ux-principles.md` only if its one-line command-surface sentence still muddies the same point.

Do not edit frozen spec copies of these standards.

## Task 3: Palette icons and stale comments

`src/components/shell/CommandPalette.tsx`:

- Draw `CommandGlyph` on each result row, same gutter treatment as `CommandsPanel` (4×4, flex-none).
- Rewrite the file comment so it no longer says the phone reaches the palette from the More sheet's Search row. Truth: no palette below `md`; `⋯` is the menu; More is destinations only.

No change to `matchCommands`, `mergeCommands`, `CommandsPanel`, or shell settings.

## Task 4: Verify, freeze spec, update roadmap

- `npm run test:unit`, typecheck, lint.
- Browser via `run-planner`: Outline at 1280×800 — open palette from Search…, from `⌘K`, from View ▸ Command palette; confirm icons + shortcuts + disabled grey; confirm the Commands panel (toggle it on) is still a headed tree with no search box; at 390×844 confirm More has no Search row and `⋯` still holds the tree.
- Update plan/shape for any as-built drift; mark **frozen / complete**; list recents / panel filter / phone search as follow-ups, not amendments.
- Roadmap: this is polish of delivered chrome, not a Phase 1 item. Skip unless a line already names it.

---

## Follow-ups (new work — not amendments to this frozen spec)

- Recent / frequent commands at the top of an empty palette
- Matching on section names
- A phone-sized searchable palette (only if the More sheet later needs search)
- A filter box on the Commands panel — explicitly rejected here; do not re-open without a new delta

---

Frozen after verification. Further change opens a new delta-spec.
