# Standards for Escape cancels empty new grid row

The following standards apply to this work. Full files live under `agent-os/standards/`;
below is why each matters and the points that guide implementation.

---

## components/ux-principles

**Why:** This is pure keyboard UX parity with Achieve — accidental create should be cheap to
undo.

Relevant points:

- **Keyboard first on desktop** — Insert and Esc are primary gestures on the outline/list grids.
- **Error prevention > error recovery** — Esc discarding a blank insert prevents a cleanup
  Delete step.
- **Forgiveness & safety** — Esc undoes an unfinished insert; blur does not silently delete
  (user might have tabbed out to think).
- **Inline editing for grid-visible fields** — name is edited in place; finish/cancel semantics
  live on that editor session.

---

## components/data-grid

**Why:** One NameCell and one create→name path should behave the same on Outline and list tabs.

Relevant points:

- One shared `DataGrid` / column context; hosts supply `editingId` + finish/cancel handlers.
- Hierarchy and navigation stay intact; this only changes what cancel means for a virgin empty
  insert.

---

## development/testing

**Why:** The discard rule is a pure boolean decision with easy-to-get-wrong edges (typed then
Esc, F2 on empty, whitespace).

Relevant points:

- Put the predicate in `src/lib/**` with adjacent `*.test.ts`.
- No React component tests.
- `deleteNode` is already integration-tested; this feature reuses it rather than adding a new
  mutation.

---

## development/clean-code

**Why:** Avoid inventing a full draft-row system when create-then-delete matches existing
persist-first create.

Relevant points:

- Decision logic in `src/lib/grid/`; components call server actions only.
- Actions stay thin (`deleteNodeAction` already exists).
- Light duplication of cancel wiring in `useGridTab` and `OutlineGrid` is fine — same as today’s
  finish/cancel split; do not force a speculative shared hook.
