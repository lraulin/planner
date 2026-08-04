# Standards that applied

**Status: frozen / complete** (2026-08-04)

## `components/data-grid.md`

The governing document. Three clauses did real work here:

1. **"Do not overload the drag gesture for grid configuration."** Forced the header drag to
   justify itself rather than be assumed. Resolved in favour of header-to-header reordering
   and against a Group By drop zone; the standard was amended to say which is which, so the
   next reader does not have to re-litigate it.
2. **"Filtering acts on defined columns, not visible ones."** Unchanged by this work, and the
   reason `Hide column`'s tooltip says filters keep working — hiding is a layout choice, not
   an un-asking of the question.
3. **"Every user-visible grid preference goes through the single `patch` in
   `useGridState`."** Why the menu holds no layout state and why the commands arrive as one
   `columnControls` bundle from that hook rather than as ad-hoc props.

**Amended by this spec:** a new _"The column menu is where everything that acts on a column
lives"_ section, the drag clause above, and `lib/grid/columnMenu.ts` added to the pure-module
table.

## `components/ux-principles.md`

- **"Keyboard first on desktop… anything reachable by mouse should be reachable by key"** and
  the decision-guide row _"Is the action only reachable by hover / right-click / double-click
  / a shortcut? → It is broken on touch — add a tappable path."_ Together these are why every
  header gesture has a menu twin: drag → Move left / Move right, double-click-the-handle →
  Reset width, Shift-click → explained in the sort items' tooltips.
- **"Clarity over cleverness — if users have to guess how to do something, the design has
  already failed."** The one-sentence statement of the whole problem.
- **"Progressive disclosure"** is why the menu is a popover per column rather than more
  toolbar buttons, and why unavailable items are dimmed with a reason instead of hidden.
- **Accessibility exemption** (one user, no screen reader) is why the popover ships with
  roles and labels but no roving-tabindex keyboard model; native buttons in DOM order plus
  Escape are the bar.

## `development/testing.md`

- **"Put real logic in `src/lib/**`, with a `foo.test.ts` beside it."** → `lib/grid/columnMenu.ts`.
- **"Do not write React component tests."** → the popover is verified by driving the real app
  in a browser; the ten unit tests cover the availability edges and the drag off-by-one.
- **"A test earns its place if it would fail on a plausible mistake."** The mistakes tested
  for: hiding the last column, moving past either end, reading only the _primary_ sort key
  when asking whether this column is sorted, and a rightward drag overshooting by one.
- No database code changed, so no `*.integration.test.ts` was in play.

## `components/responsive.md`

Consulted and found to be a no-op for this work: there is no column header below `md`, so
the entire surface is desktop-only by construction. Confirmed at 390×844 — the compact card
rows render with no header row at all.
