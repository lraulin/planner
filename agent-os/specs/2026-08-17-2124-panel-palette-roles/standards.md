# Standards for Commands panel vs command palette

**Status: frozen / complete** (2026-08-17)

Pointers, not a full paste — the live files stay the source. This slice amends
`navigation.md`; the others already match.

## components/navigation

`agent-os/standards/components/navigation.md`

Governs the six surfaces, the "menus are the catalog" rule, and the claim that the same
command has the same name, icon, and action everywhere. This spec **supersedes** the table
cell that attributed `⌘K` to the Sidebar, and adds an explicit panel-vs-palette note so a
later agent does not add a filter to the panel.

## components/ux-principles

`agent-os/standards/components/ux-principles.md`

Already: sidebar for destinations, menu bar as catalog, Commands panel as the tree left
open, `⌘K` palette as the searchable overlay. No change unless that sentence starts to
imply the sidebar owns the chord.

## components/responsive

`agent-os/standards/components/responsive.md`

No palette below `md`. `⋯` is the phone's menu. The More sheet is destinations, not a
search row.

## development/testing

`agent-os/standards/development/testing.md`

Palette and panel are wiring. Matching already lives in `registry.ts` with tests. Do not
add React component tests for the icon gutter.

## development/commits

`agent-os/standards/development/commits.md`

One logical change; Spec trailer on the implementing commit.
