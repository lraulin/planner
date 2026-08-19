# Always-ranked outline priorities — Shaping Notes

**Status: frozen / complete** (2026-08-19)

## Scope

Make every outline priority on `nodes` either unprioritized or fully ranked, with dense unique
ranks within each parent+letter group, maintained automatically by every write path. Delete
the two repair commands the optional-rank model needed. Add a way to prioritize a multi-row
selection. Give the Task Chooser one saved setting covering drag target and item-name colour.

### Out of scope

- `node_items`, `appointments`, `metrics` — same column shape, no sibling-pool semantics.
- `daily_items` and TC Priority — already enforce the invariant.
- A dedicated "rank in outline order" command — superfluous once every assignment ranks.
- Whatever replaces drag below the `md` breakpoint, if Task 2 concludes that is the symptom.
- Per-view TC rankings, or ranking TC from the Outline/Tasks tab (still out, per the frozen
  tc-priority spec).

## Task detail

### Task 2: Reproduce the drag report — **done, no regression**

Per `/fix-bug`, name the cause before fixing. Verified 2026-08-19 against the real dev
database (mutations made during the probe were snapshotted and restored byte-for-byte).

**Finding: nothing is broken. Drag-to-reprioritize works.** Dragging
`Get refund for nuts…` before `Get a place to live with Samantha` under _Financial_ — three
siblings all tied at `A1` — correctly produced `A1 / A2 / A3` and moved the row. The three
candidates resolve as follows.

1. **Viewport — by design.** `DataGrid.dragBindingFor` returns `undefined` when `compact`
   (`src/components/grid/DataGrid.tsx:771`); drag is off below `md`
   (`components/responsive.md`). If the report came from the iPhone, this is the entire
   explanation and no priority work changes it.
2. **Unprioritized siblings — the root cause.** `planDrop` delegates to `planClear` when the
   _target_ has no letter (`letterRank.ts:193`). Confirmed against the pure planner:

   | Sibling pool            | `planSiblingPriorityDrop` result     |
   | ----------------------- | ------------------------------------ |
   | all unprioritized       | `[]` — **nothing happens**           |
   | target has a bare `A`   | `A1 / A2 / A3` — densifies correctly |
   | target ranked `A1`,`A2` | `A1 / A2 / A3` — correct             |

   So in a project where nothing has been given a letter — **the video series** — dragging
   moves the row and assigns no priority, which reads exactly as "drag no longer
   reprioritizes". Correct under the current rules ("assume the target's priority", which is
   none), and it stays correct under the new model: a drop next to an unprioritized row
   leaves the dragged row unprioritized.

   **Note this reverses one assumption in the original plan:** bare letters were never the
   blocker. A bare-letter target already densifies. What blocks is having _no_ letter.

3. **The gap under an expanded parent — by design.** `resolveDrop` maps `after` on an open
   parent to "first child" (`dnd.ts:98-105`), a reparent, so no renumber. The `before
<next sibling>` slot still reprioritizes, so a priority-assigning slot always exists
   between two rows — but aiming at the bottom third of an expanded row silently reparents
   instead. Kept: it is the only way to reach "first child".

**Consequence for the plan.** There is no drag bug to fix, so no fix ships. The remedy for
the reported experience is **Task 5** — give the block a letter in one action, after which
dragging behaves as expected. This also satisfies `components/data-grid`'s "never make drag
the only path to an outcome".

**Driver note for whoever probes this next:** two artifacts cost real time and are worth
knowing. `find` returns coordinates for rows scrolled off-screen (the handle sat at
`y = -847`), and the synthesized press then lands on nothing — `scrollIntoView` first. And
`text=` matches the _name span_, not the row, so the before/inside/after fraction is measured
against a ~20px span rather than the row; aim at
`[aria-label="…"] >> [data-row-handle]` for the source and expect the zone to be
approximate. A `before` that was really `inside` silently reparented a node during this
probe.

### Task 3: One normalizing write path

Three paths write `nodes.priority_letter/_rank` verbatim today. All must go through the engine
over the **complete sibling set**:

- `setPriority` (`src/lib/tree/mutations.ts:296`) — grid cell and drag. Becomes transactional:
  load every child of the node's parent, run `planAssign`, apply all assignments. The
  sibling-loading query in the soon-to-be-deleted `removePriorityGaps` (`mutations.ts:331`)
  already reads the full set deliberately, so a grid filter cannot cause a partial renumber —
  reuse it.
- `saveNodeDetail` (`src/lib/detail/mutations.ts:148,273,500`) — the drawer's `PriorityField`,
  quick capture, contacts, agent tools. Normalize whenever a patch touches either field.
- `applyPriorityAssignments` (`mutations.ts:313`) — used only by the two commands being
  deleted; goes with them.

`PriorityCell` (`src/components/grid/cells.tsx:287`) stores what you type verbatim. Switch the
outline priority column to `LetterRankCell` (`src/components/grid/LetterRankCell.tsx`), which
already treats input as a _request_ the engine answers and re-syncs to the rank actually
granted — one shared implementation per concern (`development/clean-code.md`).

Generalize `parsePriority` (`src/lib/tree/format.ts:138`): `aa`→A1 today, plus `ba`→B1,
`ca`→C1, `da`→D1.

Note: **captured items get no priority.** Only the Inbox _project_ node is created with a bare
`D` (`src/lib/capture/mutations.ts:72`). Make it unprioritized instead, which is what it
means.

### Task 4: Structural moves keep the invariant

A ranked node moving to a new parent currently leaves a gap behind and collides at the
destination: `moveNode` does not touch priority, and only the drag path plans a renumber
client-side. Cut/paste, Move up/down, Indent/Outdent, a parent change in the drawer, and the
agent tools all bypass it.

**Rule: a structural move keeps the letter and appends to the end of that letter under the new
parent; the source letter closes its gap.** Only a `before`/`after` drag places precisely.

Implement in `moveNode` (`src/lib/tree/mutations.ts`), which already re-validates nesting
server-side. Give it an optional precise placement (`{ targetId, zone }`) so the drag path
sends one atomic call instead of `moveNodeAction` followed by N `setPriorityAction` calls
(`OutlineGrid.tsx:809-847`, `useTreeRowDrag.ts:95-127`). The client keeps its optimistic
patch, computed from the same pure planner.

Deletion closes the gap in the deleted node's sibling group.

### Task 5: Set priority on a multi-row selection

Auto-ranking does not assign the _letter_, so thirty videos would still need thirty
keystrokes — exactly the busy work this change exists to remove.

**Engine.** `planAssign` (`letterRank.ts:276`) is the only planner still limited to a single
id; `planDrop`, `planDropOnLetter` and `planClear` already take `string | readonly string[]`.
Widen it the same way, inserting the block in **selection order** (the grid reports selection
in outline order, so the videos land in sequence).

| Typed | Existing A's | Result                                               |
| ----- | ------------ | ---------------------------------------------------- |
| `A1`  | A1…A20       | block becomes A1, A2, A3…; the old A1…A20 shift down |
| `A10` | A1…A20       | block inserts at 10; A10…A20 shift down              |
| `A10` | A1…A5        | clamps — first selected becomes A6, then A7…         |
| `A`   | A1…A5        | appends — first selected becomes A6, then A7…        |
| blank | —            | unprioritizes the block, closing every gap it leaves |

The clamp already exists (`insertAt = Math.min(Math.max(requested, 1), members.length + 1)`);
it needs to hold for a block.

**Surface.** A command in Organize ▸ Priority — the section the two deleted commands vacate —
opening a one-field prompt on `ModalShell` (`components/modal-pattern.md`), disabled with a
specific reason when nothing is selected (`components/navigation.md`). The `aa`/`ba`/`ca`/`da`
shortcuts work in the field. If cheap, also let typing into the priority cell of a selected
row apply to the whole selection; the command is what ships.

### Task 6: Drag semantics under the new model

Mostly falls out of Tasks 3–4; confirm and test each:

- Before/after a **ranked** sibling → take that slot, push the rest down.
- Before/after an **unprioritized** sibling → the dragged row becomes unprioritized and its old
  letter closes its gap (Achieve: assume the target's priority). Unchanged.
- **Two slots at a letter boundary**: `after` the last A → A(n+1); `before` the first B → B1,
  pushing the Bs down. Already works via the two drop zones; add tests so it stays true.
- Reparenting (`inside`/first/last) → keeps the letter, appends within the destination (new;
  previously no renumber at all).
- A non-priority header sort is still cleared on drop; the row then visibly returns to sort
  order, which is the accepted price. `OutlineGrid.tsx:787` reads `headerSort` (singular,
  `useGridState.ts:630` = `sorts[0]`) while `useTreeRowDrag.ts:72` checks the whole array —
  make the Outline array-aware too, since a secondary key still decides where ties land.

### Task 7: Migration and backfill

Generated Drizzle migration (never hand-written without its snapshot —
`database/migrations.md`):

1. Null any `priority_rank` whose `priority_letter` is null.
2. Backfill per `(user_id, parent_id, priority_letter)`:
   `priority_rank = row_number() over (partition by … order by priority_rank nulls last, sort_key)`.
   Existing ranks win; bare letters land at the end of their letter in outline order; ties
   break by outline order.
3. `CHECK ((priority_letter IS NULL) = (priority_rank IS NULL))` on `nodes` — a one-line
   encoding of "no bare letters, no orphan ranks", alongside the type-aware CHECKs already
   there.

**No unique index** on `(user_id, parent_id, priority_letter, priority_rank)`: a renumber
applies sequential updates and would violate a non-deferrable index mid-transaction. The
invariant is held by the single write path plus integration tests.

Normalize on **Achieve XML import** (`src/lib/achieve/mapOutline.ts`) — the file format
encodes a bare letter as the band floor, so import is the one remaining way to reintroduce
one.

### Task 8: Delete the two repair commands

- `src/lib/priority/maintenance.ts` and `maintenance.test.ts`
- `removePriorityGaps` / `reprioritizeUnique` in `src/lib/tree/mutations.ts:331,351` and
  `applyPriorityAssignments`
- `removePriorityGapsAction` / `reprioritizeUniqueAction` in
  `src/app/plan/outline/actions.ts:50-56`
- `record.remove-priority-gaps` / `record.reprioritize-unique` and the
  `capabilities.priorityMaintenance` gate in `src/lib/grid/commandDeck.ts:802-838`
- Wiring in `src/components/grid/useNodeCommandDeck.tsx:141-142,277-279` and
  `src/components/outline/OutlineGrid.tsx:529,600-607`
- The `priority` icon id (`src/lib/commands/icons.ts`) if nothing else uses it; the assertion
  in `src/lib/commands/menus.test.ts:48`; the `commandDeck.test.ts` cases

Rename the priority column's `Ranked` / `Unranked` filter presets to `Prioritized` /
`Unprioritized` — they now mean "has a letter", and the old names describe a state that no
longer exists.

### Task 9: Task Chooser — one saved setting

Add `rankByTcPriority: boolean` to `ChooserSettings` (`src/lib/chooser/types.ts`) and
`parseChooserSettings` (`src/lib/chooser/settings.ts`), stored per view at `chooser:{viewId}`
— the same seam as `onlyNextAction` and `hidePlanned`. Default it from the view's static
`tcPriority` flag (`views.ts:149`) so today's behaviour is preserved.

It switches two things together:

- **Drag** — replace the `view.tcPriority` gate at `ChooserGrid.tsx:281` with the setting. Off
  → no `rowDrag`.
- **Name colour** — `nameToneClass` (`src/components/grid/cells.tsx:50-55`) keys off
  `node.priorityLetter` only. Add a small context beside the existing `NameIconContext` in the
  same file naming which letter field the name reads; ChooserGrid provides TC when the setting
  is on. Default context = outline, so every other grid is untouched.

Expose it in `ChooserSettingsDialog.tsx` beside the other per-view switches.

## Context

- **Visuals:** None.
- **References:** see `references.md`.
- **Product alignment:** no roadmap item claimed up front; check at freeze.

## Standards applied

See `standards.md`. In short: `database/migrations` (the backfill and CHECK),
`development/testing` (pure logic + DB mutations, cross-user cases),
`development/clean-code` (one engine, mutations take `userId`),
`components/data-grid` (drag is first-class; persisted preferences),
`components/ux-principles` (inline editing, no re-sort while editing),
`components/navigation` (a command without a menu is not shipped; disabled with a reason),
`components/modal-pattern` (the new prompt), `components/responsive` (drag off below `md`),
`development/commits` (one logical change per commit, Spec trailer).
