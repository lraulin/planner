# Escape cancels empty new grid row — Shaping Notes

**Status: frozen / complete** (2026-08-10)

## Scope

When the user creates a new **outline node** in a grid (keyboard Insert family, toolbar New,
row-menu create, etc.) and the name editor opens, **Escape without typing anything** discards
the row so they do not have to Delete an accidental or abandoned insert.

Matches Achieve Planner §3.3.1 “cancel the insert” for blank rows.

### Out of scope

- Notes, Resources, Contacts, catalogs
- Day free-text draft (already does not persist until non-empty)
- Schedule / appointments
- Wish List create
- Enter chaining another sibling insert (AP insertion-mode Enter behavior)
- Full multi-cell “insertion mode” until any cell changes
- Optimistic tombstone layer for delete (reuse existing non-optimistic delete unless flash is bad)

## Decisions

- **Node grids only** (Outline + list tabs on `useGridTab`)
- Track **virgin insert** only via `startNaming` after create — not via F2/`setEditingId`
- Discard when virgin + committed name `""` + **draft** empty (trim)
- **Blur keeps** empty row; clears virgin
- Create-then-delete rather than client-only draft row
- No confirmation dialog on Escape discard
- Pure predicate in `src/lib/grid/`; host wiring in `useGridTab` + `OutlineGrid`
- Harden NameEditor so Escape does not also blur-commit

## Context

- **Visuals:** None
- **References:** `useGridTab`, OutlineGrid create/startNaming, NameEditor Escape, `createNode`
  default `name: ""`, AP user-manual §3.3.1, Day draft as non-goal contrast
- **Product alignment:** Achieve parity polish on Phase 1 grids

## Standards Applied

- **components/ux-principles** — keyboard-first, error prevention, forgiveness
- **components/data-grid** — shared name edit path across Outline + list tabs
- **development/testing** — pure lib unit tests; no component tests
- **development/clean-code** — decision in lib, thin actions, no speculative architecture
