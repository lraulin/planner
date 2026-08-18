# Commands panel vs command palette — Shaping Notes

**Status: frozen / complete** (2026-08-17)

## Scope

Keep the existing six-surface command model, and make the panel/palette split unmistakable
in the live standard and on screen. The palette already searches; the panel already lists
the tree. This slice records the decision not to add a filter to the panel, stops the
standards table from attributing `⌘K` to the Sidebar, and draws the same command icons in
the palette that menus and the panel already show.

### Out of scope

- A search or filter box on the Commands panel
- Recent / frequent commands in the palette
- A phone-sized searchable palette (More sheet stays destinations; `⋯` stays the menu)
- Matching on section names, argument prompts, rebindable shortcuts
- A customisable command row, a ribbon, or any other surface redesign

## Decisions

- Panel and palette are complementary accelerators of the same catalog. The menu bar remains
  the source of truth.
- The panel is spatial and hierarchical: scan, expand, click. Nested families stay expanded
  as headed groups — "left open" is the opposite of a fly-out.
- The palette is the only command-search surface. `⌘K`, View ▸ Command palette, and the
  sidebar Search… row all open it. Search… is the teacher, not a second implementation.
- Same name, icon, and action on every surface includes the palette's missing glyph.
- No redesign of the six surfaces. Achieve's Outline Commands pane is the panel's ancestor;
  VS Code / Linear `⌘K` is the palette's. They are not the same control.

## Context

- **Visuals:** None. Existing pane, existing palette, existing sidebar Search… row.
- **References:** Command-surface spec (the four surfaces), menu-completeness (View ▸
  Command palette, File at the shell), navigation-and-command-surface (palette as Go).
- **Product alignment:** Phase 1 chrome already delivered. This is role-clarity polish,
  not a new roadmap item. Intentional Achieve divergence: we have a palette; they did not.

The first pass of this conversation proposed adding search to the panel, then reversed
once the palette was found. The confusion was the standard, not a missing feature.

## Standards Applied

- components/navigation — the six surfaces, menus as catalog, panel vs palette
- components/ux-principles — already states the split correctly; no edit unless it drifts
- components/responsive — no palette below `md`; `⋯` is the phone menu
- development/testing — no React tests; palette/panel are wiring
- development/commits — one logical change; Spec trailer
