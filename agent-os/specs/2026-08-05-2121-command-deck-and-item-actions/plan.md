# Shared Command Deck and Item Actions

**Status: frozen / complete (2026-08-05)**

## Intent

Give every grid a single, capability-aware command surface. Frequent actions live in a compact
selection-aware deck; the complete contextual list remains available through the existing command
registry, palette, overflow menu, row menus, and keyboard paths. Existing grid/view controls keep
their behavior.

## Scope

- Shared command descriptor and capability model with primary/More placement and disabled reasons.
- Shared desktop command deck and mobile More path, composed into `GridToolbar`.
- Outline tree actions, node-grid item actions, flat-grid page actions, and consistent registry labels.
- Pure priority maintenance, conversion planning, and Outline zoom URL state.
- Conversion mutation uses the existing node/detail tables transactionally and preserves user
  ownership boundaries.
- Pure and database tests for the new mutation/planning behavior; browser verification at phone
  and desktop widths.

## Acceptance criteria

- [x] All relevant grid views expose only meaningful commands and keep existing view controls.
- [x] Primary actions and More menu share one command definition and disabled explanations.
- [x] Outline item actions no longer require a persistent legacy command strip.
- [x] Priority maintenance reads complete sibling sets, not filtered grid rows.
- [x] Conversion previews field loss/conflicts and writes one transactional type change.
- [x] Outline zoom is shareable and Back-friendly through URL state.
- [x] Unit, integration, typecheck, lint, build, and browser verification are run.

## Changes from original plan

| Change                                                                                                                                | Why                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start with the existing command registry and tree handlers                                                                            | The prior grid-control slice already established those as shared infrastructure; duplicating them would create label and availability drift.                                       |
| Keep node-list grids on shared Open/Rename plus selection metadata, while publishing page-specific New actions for flat catalog grids | These consumers already own their mutation dialogs and do not share the Outline tree mutation contract; exposing hierarchy controls there would be misleading.                     |
| Use modal pickers for “Zoom to item…” and “Expand through level…”                                                                     | The initial More menu exposed nine level commands and was too tall on a phone; the picker keeps the complete capability discoverable without a long mobile sheet.                  |
| Verify with the project’s local Chrome driver after the in-app browser had no available session                                       | The prescribed in-app browser connector had no browser targets in this workspace; the repository’s real-browser driver still exercised desktop/touch rendering and URL navigation. |
| No raster reference files were added under `visuals/`                                                                                 | The supplied workspace contained no Achieve screenshot attachments; the local Achieve reference pack and the shaping wireframe remain the visual source of truth.                  |
| Projects, Goals, Tasks, and Result Areas use a shared node-command hook for priority maintenance and conversion previews              | Their list grids are projections of the tree and intentionally omit restructuring commands, but they still need the destructive/detail-changing commands from the common deck.     |

## Follow-ups (new work)

- Wish → Dream/Goal conversion and scheduling/pickup/drop command families.
- A richer conversion dialog with live server-loaded detail field previews if the compact planner
  cannot show enough context in one screen.
