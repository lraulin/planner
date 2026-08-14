# View in Outline — Shaping Notes

**Status: frozen / complete** (2026-08-14)

## Scope

Achieve's **Outline → View in Outline**: from a detail tab, switch to the Outline page with
the currently selected item still selected (and actually visible in the tree).

### Out of scope

- **View Details** (the reverse: Outline → Projects / Tasks / Result Areas)
- Day, Schedule, Notes
- Opening the detail drawer on arrival
- Clearing Outline filters / switching views so a filtered-out row appears
- An invented keyboard shortcut
- Restoring Achieve's Outline menu name

## Decisions

- Select only — new `?select=` param. `?detail=` remains "drawer is open."
- Hosts: Projects, Tasks, Goals, Result Areas, Task Chooser via `useNodeCommandDeck`. Wish
  List goes to the owning node. Omit on Outline.
- Expand collapsed ancestors. Clear zoom only if the target is outside the zoomed branch.
  Leave filters alone.
- Command lives in Item next to View tasks / View project. Same label on every surface.
- Unknown id is a no-op.

## Context

- **Visuals:** None
- **References:** Achieve user-manual §3.3.13; `commandDeck.ts` View tasks / View project;
  `viewState.ts`; `OutlineGrid.tsx` `?detail=` selection sync; `walkUp.ts`
- **Product alignment:** Phase 1 Achieve MVP. Match Achieve. Menu name is Item (frozen
  divergence from Achieve's Outline menu).

## Standards Applied

- `components/navigation.md` — menu catalog, same label everywhere, disable not remove
- `components/data-grid.md` — one command deck, hosts declare capabilities
- `components/ux-principles.md` — keyboard-first, selection is the subject
- `development/testing.md` — logic in `src/lib`, sibling tests, no component tests
- `development/clean-code.md` — one implementation per concern; lib never imports app
- `development/commits.md` — one logical change, Spec trailer
