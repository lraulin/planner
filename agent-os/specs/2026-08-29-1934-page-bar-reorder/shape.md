# Page-bar drag reorder — Shaping Notes

**Status: active**

## Scope

Let the underline page bar be reordered by dragging, persist that order per module in the
`shell` settings blob, and use the same order everywhere that lists a module’s pages
(page bar, Go-to palette, Commands panel).

### Out of scope

- Form-section tabs (`FormTabs` in drawers).
- Closable / reorderable / persisted **open** working-set tabs (`TabStrip`). That is the
  2026-08-05 rejection; this spec does not reopen it.
- Reordering sidebar modules.
- Touch drag, or Move left / Move right commands.
- Changing registry default order (Plan Achieve order, Finances-by-frequency, etc.).
- Achieve tab groups.

## Why the 2026-08-05 rejection does not apply

The navigation spec rejected _closable working-set tabs_: an open-set state machine, a
close/reorder interaction, an empty state (“you closed everything”), and a settings
migration, so one user could curate which four of twenty views sat on screen. The sidebar
plus `⌘K` already covered that job.

This work permutes a **fixed** list. Every built page of the module stays in the bar; none
open or close. That is column-order, not an open set.

## Decisions

- Page bar only, persist per module, first paint from `shell` (same reason as
  `lastPage` / sidebar collapsed).
- Apply order in `modulePages`, not only in `PageBar`, so Go-to cannot disagree with the
  bar.
- New pages insert at registry neighbourhood; unknown saved ids drop; empty stored list
  means “never arranged,” not “hide everything.”
- HTML5 drag on desktop; `NavLink` stays a real link so click / open-in-new-tab keep
  working.
- Deliberate `responsive.md` deviation: no explicit Move commands this slice. Phone
  displays the desktop-saved order.

## Context

- **Visuals:** None. Achieve written behavior (online help: drag view tabs to the desired
  location) plus the column-header insertion line already in the app.
- **References:** `PageBar.tsx`, `pages.ts`, `modulePages`, `shell.ts`,
  `useGlobalCommands`, column-header drag, `withNewColumns` / `placeField` as algorithm
  siblings not imports.
- **Product alignment:** Mission is Achieve fidelity when ambiguous. Not a named roadmap
  item; freeze adds a completed note under Module pages.

## Standards Applied

See `standards.md`. Pin `84a86b0a30a5b286f68c00c7f9a0ead2060144b9`.
