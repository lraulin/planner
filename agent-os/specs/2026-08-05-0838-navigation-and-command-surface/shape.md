# Navigation & Command Surface — Shaping Notes

**Status: frozen / complete** (2026-08-05)

## Scope

Replace the eleven-tab desktop strip with a grouped, collapsible sidebar; add a `⌘K`
command palette that serves as both the Go menu and the command index; and give Achieve's
app-menu commands a home behind a `⋯` overflow on the active view's toolbar.

Everything here is chrome. No view gains or loses a capability.

### Out of scope

- New views. Their sections are reserved in the registry; none is built.
- Achieve commands we have not implemented (Reschedule, New Project from Template, Skip
  Recurrence, Convert to Task / Project). Considered stubbing them as disabled palette
  entries so the map of what is missing would be visible in the app; rejected — a menu
  full of dead entries teaches the user to stop reading the menu.
- Closable / reorderable / persisted open tabs.
- Electron or any desktop packaging.

## The problem, stated precisely

Two separate failures that look like one:

1. **Navigation does not scale.** `TABS` is a flat list of eleven rendered as one
   non-wrapping row. Nothing about it degrades gracefully at fifteen or twenty, and the
   roadmap has at least seven more views in it.
2. **Commands have no home.** Achieve put them in menus. We put them on toolbars, so every
   command we add is permanent screen furniture. `GridToolbar` is already carrying nine
   always-visible controls, two of which (Reset this grid, Show Fields) are used rarely.

The first is why the tabs are uncloseable; the second is why we cannot simply add more.

## Decisions

### The sidebar, not tabs-as-a-working-set

Achieve's tabs were a working set opened from the Go menu — closable, rearrangeable. That
was considered and rejected. Reproducing it means an open-set state machine, a close /
reorder interaction, an empty state ("you closed everything"), and a settings migration —
all so that a single user can curate which four of twenty views are on screen. The sidebar
plus the palette gets to the same place: every view is one glance or one `⌘K` away, and
nothing has to be curated.

Vertical space is the resource we have. A sidebar with four section headings and eleven
entries fits in 400px; the same eleven in a row did not fit in 1440.

### One registry, two renderers

This is the structural claim, and it is the same shape `TABS` already has — one list read
by four surfaces that must not drift. A command is declared once and rendered by both the
palette and the `⋯` menu, so the two can never disagree about what is available or what it
is called.

The alternative — palette-only — was rejected on `ux-principles.md`: _"a gesture nobody can
see is not a discoverable action"_, and there is no `⌘K` on a phone. The `⋯` menu is what
makes the palette legal.

### Reserved views are data, not chrome

Deciding a future view's section now is nearly free and prevents re-litigating navigation
each time one lands. But a reserved entry renders nothing, and a section holding only
reserved entries does not render at all — so **Library** is invisible until Time Charts or
Resources exists. This is the same instinct as not stubbing unimplemented commands.

### No desktop title bar

The shaping sketch had a `Tasks … [⋯]` header row above the content. Dropped during
planning: the sidebar's active highlight already answers "where am I", and a full-width row
costs two or three grid rows on every view, on every screen, forever. The `⋯` goes on the
toolbar the view already has. `MobileHeader` stays, because the phone has no sidebar to
lean on and its bottom nav names only three of eleven views.

### Persisting the collapse

A new singleton `shell` scope rather than `localStorage`. `src/app/layout.tsx` already loads
settings server-side and the comment there says why: it is _"what keeps a saved column
layout from flashing the default one first."_ A sidebar that expands and then snaps shut on
every page load would be the most visible instance of exactly that bug.

## Context

- **Visuals:** ASCII sketches produced during shaping (sidebar layout, palette, `⋯` menu).
  Reproduced in `references.md` rather than as image files.
- **References:** see `references.md`.
- **Product alignment:** `agent-os/product/roadmap.md`, Phase 2, _"Any remaining Achieve
  chrome that earns its keep."_ This is that line for navigation. It also unblocks every
  future view in Phase 2 — each one currently costs a twelfth permanent tab.

## Standards applied

- `components/ux-principles.md` — the touch-path rule that forces the `⋯` menu; the
  modal rules that shape the palette; keyboard-first on desktop, touch-complete on phone.
- `components/responsive.md` — `md` is the only structural breakpoint; the desktop
  instrument's description currently names the tab strip and must be updated.
- `components/modal-pattern.md` — the palette is a centered dialog and must be built on
  `ModalShell`.
- `components/data-grid.md` — toolbar restraint; the overflow tier is a new answer to
  "where does a rarely-used control go".
- `development/testing.md` — the registry and the settings codec are pure logic in
  `src/lib/**` and get tests; no React component tests.
