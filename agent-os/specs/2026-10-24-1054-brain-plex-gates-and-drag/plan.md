# Brain plex: TheBrain gates, curved links, drag to create and connect

**Status: active**
Spec folder: `agent-os/specs/2026-10-24-1054-brain-plex-gates-and-drag/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-10-24-0925-brain-library-page/` (schema, link semantics,
  one-link-per-pair relinking, URL-state active thought, commands/menus, mobile fallback all carry
  forward unchanged)
- **Supersedes** in that spec:
  - _Out of scope: "plex drag-to-link"_ — now in scope.
  - _Plex rendering: chips as bordered boxes, straight centre-to-centre lines_ — replaced by
    TheBrain-style labels with gates and curved gate-to-gate links.
  - _Siblings carry no link (no line)_ — siblings now get a faint line from their parent
    (still derived, still never stored).
  - Follow-up "edges cross behind chips… a curved edge would read better" — addressed.

## Context

Lee wants the Brain plex to feel like TheBrain (screenshots in `visuals/`): thoughts as labels
with **gates** (small dots: top = parent, bottom = child, left/right = jump), **curved lines**
running gate to gate, and direct manipulation: **drag from a gate to empty canvas** to create a
new thought there ("Child Thought Name" input at the drop point), **drag from a gate onto another
thought** to link them. Everything the server needs already exists: `createThought` with
`linkTo` and `linkThoughts` (insert or relink in place) in `src/lib/brain/mutations.ts`. This
spec is UI work plus one query addition.

## Decisions

| Decision                         | Choice                                                                                                                                                                                                                                                                      | Why                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Look                             | Full TheBrain look: thoughts are text labels (type colour as a small swatch/dot, not a boxed chip) with gate dots; active thought keeps a selected outline; app tokens only, so light/dark both work                                                                        | Lee chose the full look over "chips + gates"                                                                     |
| Gates                            | Each visible thought has parent gate (top centre), child gate (bottom centre), jump gates (left and right middle)                                                                                                                                                           | TheBrain's model; the gate a drag starts from names the relation                                                 |
| Gate fill                        | Filled = that thought has at least one link that way (parents / children / jumps); hollow = none                                                                                                                                                                            | TheBrain's "worth opening" cue; Lee chose it                                                                     |
| Gate data                        | `loadPlex` adds `hasParents/hasChildren/hasJumps` per thought in `thoughts` via `EXISTS` subqueries in the same statement                                                                                                                                                   | Stays one round trip (`database/read-latency.md`); existing `(userId, fromId)`/`(userId, toId)` indexes serve it |
| Edges                            | Cubic Bézier gate-to-gate: parent edge from parent's child gate → active's parent gate; child edge active child gate → child parent gate; jump edge active jump gate (left) → jump's right gate; vertical control points for parent/child, horizontal for jumps             | Matches TheBrain; curves read better when zones wrap (old follow-up)                                             |
| Siblings                         | Faint curve from the sibling's own parent's child gate to the sibling's parent gate; `neighbourhood` records which parent each sibling came through                                                                                                                         | Lee chose it; siblings remain derived, never stored                                                              |
| Drag sources                     | Any visible thought's gate (not the `+N more` chip)                                                                                                                                                                                                                         | Lee chose it: link two neighbours without recentring                                                             |
| Relation from gate               | Source gate top → target is source's **parent**; bottom → **child**; side → **jump** — i.e. `linkThoughtsAction(sourceId, relation, targetId)`                                                                                                                              | Reuses the existing `LinkRelation` reading (spec #0925 change 4)                                                 |
| Drop on a thought                | Links them; if already linked, it relinks in place (existing `planLink`); drop on self or the `+N more` chip does nothing                                                                                                                                                   | One link per pair is already the rule                                                                            |
| Drop on empty canvas             | Opens an inline name input at the drop point (placeholder "Child/Parent/Jump thought name"), a rubber-band curve held to it; reuses `AddLinkInput`'s autocomplete, so picking an existing thought links it rather than duplicating; Enter creates; Esc / blur-empty cancels | Keeps the 0925 anti-duplicate decision                                                                           |
| Active thought after create/link | Unchanged — stays on the current centre                                                                                                                                                                                                                                     | TheBrain behaviour; the new thought appears in its zone                                                          |
| Drag mechanics                   | Pointer events with `setPointerCapture` on the gate (precedent: `WeekCalendar`), a live rubber-band curve from gate to pointer, target thought highlighted while hovered; a press without movement past a few px is not a drag; Esc aborts                                  | No drag library; works with mouse and pen                                                                        |
| Click vs drag                    | Clicking a label still recentres; gates are separate hit targets (≥ tap-sized hit area around a small dot)                                                                                                                                                                  | Gates must not steal the recentre click                                                                          |
| Commands                         | Existing Add child/parent/jump commands and context menus stay; drag is an additional path                                                                                                                                                                                  | navigation standard: every verb still has a menu                                                                 |
| Mobile                           | Unchanged (stacked lists, no plex)                                                                                                                                                                                                                                          | Desktop is the priority                                                                                          |
| Animation                        | Labels still slide on recentre; edges still fade in                                                                                                                                                                                                                         | SVG path endpoints still cannot be transitioned portably (0925 change 8)                                         |

### Out of scope

Dragging a thought label to reposition it; dragging an existing link's end to rewire it;
drag on the mobile list view; second-degree thoughts; link-kind changes via drag on a link;
thought icons.

## Acceptance criteria

- [ ] Plex shows thoughts as labels with four gates; filled gates where that thought has links that way, hollow otherwise
- [ ] Parent/child/jump/sibling lines are curves joining the correct gates; labels still appear on hover/at midpoint
- [ ] Dragging any visible thought's gate shows a live curve; dropping on another thought creates the right link kind/direction (or relinks the existing pair in place)
- [ ] Dropping on empty canvas opens a name input at that point; typing a new name + Enter creates and links it; choosing an autocomplete hit links the existing thought; Esc cancels with nothing written
- [ ] Clicking a label still recentres; right-click menus and commands unchanged
- [ ] Light and dark themes both legible; phone width unchanged
- [ ] `npm run lint && npm run typecheck && npm test` pass with DB tests actually run; `npm run smoke` passes

## Changes from original plan

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

> While this spec is **active**, when we make a material change to requirements, design, or
> scope (including from feedback on what was implemented), update the relevant sections and
> append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.

## Task 1: Save spec documentation

Create `agent-os/specs/2026-10-24-1054-brain-plex-gates-and-drag/` with `plan.md` (this plan),
`shape.md` (scope, the four answered questions, out of scope), `standards.md` (pinned to
standards commit `dff043d6`), `references.md`, and `visuals/` with the three screenshots Lee
pasted (copy from the `pasted-image-20261024-1011…/1015…/1016…` temp paths; if they are gone,
describe them in `references.md` instead). Commit and push.

## Task 2: Gate data in `loadPlex`

- `src/lib/brain/types.ts`: `ThoughtRef` gains `gates: { parents: boolean; children: boolean; jumps: boolean }`
  (or a `PlexThought` extension if search/recent hits shouldn't carry it — prefer a separate type
  for the plex's `thoughts` map).
- `src/lib/brain/queries.ts` `loadPlex`: add three `EXISTS(...)` columns per thought in the
  `thoughts` aggregate, all `user_id`-scoped.
- Extend `mutations.integration.test.ts` (or the queries test it uses) to assert the flags for a
  small graph, and that another user's links never set them.

## Task 3: Pure geometry and drag logic in `src/lib/brain/` with tests

- `neighbourhood.ts`: siblings become `{ thoughtId, viaParentId }[]` (first parent wins); update
  readers (`Plex`, `BrainMobile`, `BrainView`) and `neighbourhood.test.ts`.
- `plex.ts`: nodes gain gate points (`gates: { top, bottom, left, right }` as `{x,y}`), sized to
  label width estimate; edges become `{ from: Point; to: Point; c1: Point; c2: Point; kind }`
  joining the gates per Decisions, with sibling edges from `viaParentId`'s bottom gate. Keep the
  disjoint-zone layout. Tests: each edge kind joins the right gates; control points vertical vs
  horizontal; sibling edges originate at their parent; layout still non-overlapping.
- New `drag.ts`: `relationForGate(gate) → LinkRelation`, `dropResult(sourceId, gate, targetId | null)`
  → `{ kind: "link"; thoughtId; relation; otherId } | { kind: "create"; ... } | { kind: "none" }`
  (self, `more:` keys, sub-threshold moves → none), `bezierPath(from, to, orientation)` shared by
  edges and the rubber band. Tests cover every gate → relation and the no-op cases.

## Task 4: Plex rendering — TheBrain look

- `ThoughtChip.tsx` → label style: type colour as a dot/swatch, no box for neighbours; centre keeps
  `border-select-edge` outline; siblings muted. Gate dots (`Gate` subcomponent) at the four
  positions, filled/hollow from `gates`, ≥ tap-size invisible hit area, `aria-label`s
  ("Drag to add parent of X"…).
- `Plex.tsx`: SVG `<path>` edges from `bezierPath`, keep hover hit-path, label at curve midpoint,
  sibling edges fainter. Use the `frontend-design` skill for the look, staying within the app's
  tokens.

## Task 5: Drag to connect and create

- In `Plex.tsx`: gate `onPointerDown` → capture, track pointer in plex coordinates, render the
  rubber-band path, hit-test labels under the pointer (by layout rects) to highlight a target;
  `onPointerUp` → `dropResult`. Esc aborts.
- New `onLink(thoughtId, relation, otherId)` and `onCreateAt(sourceId, relation, point)` props;
  `BrainView` wires `onLink` to `linkThoughtsAction` via `act`, and `onCreateAt` to a floating
  `AddLinkInput` positioned at the point (absolutely within the plex, kept inside its bounds),
  with the rubber band held until it closes. `onChoose` → `linkThoughtsAction`; `onCreate` →
  `createThoughtAction({ name, linkTo: { thoughtId: sourceId, relation: mirrorRelation(relation) } })`.
- If `AddLinkInput` needs a placement/placeholder prop, add it; the toolbar-row use stays.

## Task 6: Verify, freeze spec, update roadmap

- Lint, typecheck, `npm test` (no DB-skip warning), dev server + `npm run smoke`
- Drive it via `run-planner`: drag each gate kind to empty canvas and to an existing thought,
  relink a pair by dragging the other gate, neighbour-to-neighbour link, Esc cancel, autocomplete
  pick, light + dark, click-to-recentre still works, 390px unchanged
- Push to `master` (Lee checks on desktop)
- Update plan/shape for drift; mark **frozen / complete**; follow-ups listed separately
- Amend the Brain roadmap entry (`agent-os/product/roadmap.md` ~line 777) to cite this spec

## Verification

Unit tests for `neighbourhood`/`plex`/`drag`; integration test for gate flags (second user
included); `npm run smoke`; browser pass via `run-planner` on desktop and phone width.
