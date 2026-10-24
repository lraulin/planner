# Brain plex: gates, curved links, drag to create and connect — Shaping Notes

**Status: frozen — implemented 2026-10-24**

## Scope

Make the Brain plex behave and look like TheBrain: thoughts as labels with gate dots
(top = parent, bottom = child, sides = jump), curved gate-to-gate links, drag from a gate onto
empty canvas to create a linked thought (inline name input), drag from a gate onto another
thought to link them. Server mutations already exist; this is plex UI plus gate flags in
`loadPlex`.

### Out of scope

- Dragging a label to reposition it; dragging an existing link's end to rewire it
- Drag on the mobile list view (mobile unchanged)
- Second-degree thoughts, thought icons

## Decisions (answers from Lee)

- **Look:** full TheBrain look (labels + gates), not chips with gates added.
- **Drag sources:** any visible thought's gates, not only the centre's.
- **Gate fill:** filled = has links that way, hollow = none (adds flags to `loadPlex`).
- **Siblings:** get a faint line from their parent's child gate.
- Dropping on empty canvas reuses the autocomplete add-link input so existing thoughts are
  linked, not duplicated (carried from spec 0925).

## Context

- **Visuals:** `visuals/thebrain-plex.png` (TheBrain plex, curved links, gate dots),
  `visuals/drag-to-create-input.png` ("Child Thought Name" input after dragging from a gate),
  `visuals/gates-and-curves.png` (gates and drag-created thoughts).
- **References:** `src/components/brain/Plex.tsx`, `ThoughtChip.tsx`, `BrainView.tsx`,
  `src/lib/brain/plex.ts`, `neighbourhood.ts`, `links.ts`, `queries.ts`.
- **Product alignment:** Brain roadmap entry (Phase 3, Library). Desktop is the priority.

## Standards Applied

- `components/navigation` — every verb keeps a menu/command entry; drag is an extra path.
- `database/read-latency` — gate flags stay inside the single `loadPlex` statement.
- `development/testing` — pure logic tested; DB flags get a cross-user integration test.
