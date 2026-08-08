# References for Mobile swipe row actions

## Similar implementations

### The only existing swipe wiring

- **Location:** `src/components/day/DailyItemsGrid.tsx` (`rowSwipe`, ~line 440)
- **Relevance:** The whole prior art. Swipe right ticks a day item off, swipe left pushes
  it to tomorrow; "Remove from this day" is deliberately left in the long-press menu
  because it has no way back.
- **Key patterns:** `(itemId) => RowSwipe` returning a label per direction, reading the
  item's own state to decide between "Complete" and "Reopen".

### The engine and the row

- **Location:** `src/lib/touch/swipe.ts`, `src/lib/touch/swipe.test.ts`,
  `src/components/grid/CompactRow.tsx`
- **Relevance:** Axis lock, trigger distance and clamp are already pure and tested; the row
  already owns the pointer handling, the `touch-action: pan-y` that keeps the browser's
  scroll, and the tap-swallowing that stops a completed swipe also opening the record.
- **Key patterns:** ties on a diagonal go to `vertical` — the list wins contested gestures,
  because stealing a scroll is a worse failure than a swipe that does not register.

### The pattern to mirror

- **Location:** `src/components/grid/rowMenu.ts` (`rowMenuFor`)
- **Relevance:** The exact shape `rowSwipeFor` copies. Eight views used to hand-write their
  own `MenuItem[]` and they disagreed; deriving the menu from one capabilities object is
  what stopped that. A gesture wired six times by hand would drift the same way.
- **Key patterns:** built _for the row under the pointer_, not for the selection — the same
  reason applies to a swipe.

### Where the actions come from

- **Location:** `src/components/grid/useNodeCommandDeck.tsx`,
  `src/lib/grid/commandDeck.ts`
- **Relevance:** Already owns `onSetState` (which delegates to the host's
  `useStateChange` bridge, cascade and confirmation intact) and `onDelete` (which parks the
  rows in `pendingDelete` and renders the shared `ConfirmDialog`). Both are exactly what the
  two swipe directions need, and all five list hosts already render `nodeCommands.dialogs`.

### The cascade the complete gesture must not bypass

- **Location:** `src/components/grid/useStateChange.ts`,
  `src/lib/tree/completionCascade.ts`
- **Relevance:** Asks first only when settling would close open work underneath, because
  re-opening a parent deliberately does not re-open its finished children. A swipe-complete
  on a project has to raise that prompt.

### Prior frozen spec

- **Location:** `agent-os/specs/2026-08-06-1506-right-click-completion/`
- **Relevance:** Where `Complete` and the `State ▸` family were put on the row menu and the
  `onStateChange` bridge into `useStateChange` was established. The swipe reuses that path
  rather than opening a second one.
