# Responsive / Mobile — Shaping Notes

**Status: frozen / complete** (2026-08-27)  
Authoritative detail: `plan.md`.

## The ask

"The app is looking great on desktop, but it needs a serious overhaul" — on an iPhone 12.
The brief that came with it proposed an adaptive mobile IA: bottom nav, lists instead of dense
grids, full-screen or bottom-sheet forms, a capture FAB, 44pt targets, safe-area padding, and
dark mode as first-class. Plus: update the coding standards to cover responsive design.

## What shaping found

Four things changed the shape of the work.

### 1. There is no AG Grid, and no component library at all

The brief assumed a MUI + AG Grid stack (a reasonable guess — the inherited
`drawer-pattern.md` is written for one, and says so at its top). The reality is **hand-rolled
React with Tailwind v4 CSS-first theming**; the only third-party UI dependency is FullCalendar.

This is good news. Everything routes through **one 729-line `DataGrid`**, so a single branch in
the row renderer converts all seven grids at once — Outline, Projects, Tasks, Goals, Wishes,
Notes, Chooser and Day. There is no vendor grid to fight and no `sx` prop to unwind.

Similarly, tokens live entirely in `globals.css` with no `tailwind.config.ts`, so adding
breakpoint behaviour, safe-area utilities and the iOS input fix is a **one-file change**.

### 2. The 16px input rule is the highest-leverage line in the change

Everything editable in the app is `text-[0.8125rem]`. iOS Safari zooms the viewport on focus of
any control under 16px and does not zoom back on blur. That single behaviour would make the app
feel broken on the phone no matter how good the layout was, and it is fixed by five lines in
`globals.css`.

It was not in the original brief. It belongs in the standard.

### 3. Drag-to-reorder cannot be saved, and two grids hide commands behind right-click

`DataGrid` arms `draggable` during `onMouseDown` specifically so a drag does not steal text
selection inside cell inputs. That is a correct desktop trade-off and a dead end on touch —
`onMouseDown` does not reliably precede a touch drag.

So drag goes off below `md`, and everything it does becomes a named command. Which forced a
second finding: the Day tab's _Promote to task…_, _Move to tomorrow_, _Mark delegated_ and
_Remove from this day_ exist **only** in a right-click menu, as do Notes' indent/outdent. A
long-press menu is therefore not a nice-to-have — without it the Day tab on a phone can tick
boxes and nothing else.

### 4. Two standards said the opposite of what mobile needs

`ux-principles.md` says **"Keyboard first"** and **"Accessibility is not a goal here — skip
contrast ratios and screen-reader testing."** Both are right for the desktop instrument, and
together they read as licence to ship hover-only, shortcut-only affordances — precisely the
class of thing that breaks on touch.

Rather than quietly violating them, the standards were amended: keyboard-first is now scoped to
desktop with a touch-complete counterpart below `md`, and the accessibility exemption keeps its
intent (no ARIA audits, no contrast work) while explicitly **not** covering hit-target size and
touch-reachability — those are usability for the one user, on the phone he owns.

`ux-principles.md` also opens with "never hide the outline." At 390px that is unaffordable, so
the compact layout gives it up in one place and the standard now says where and why.

## Scope calls

**First-class on phone:** Day + Quick Capture (the daily driver), the list tabs (Tasks,
Projects, Goals, Wishes), Notes.

**Non-broken only:** Outline, Weekly Schedule, Task Chooser, Week Plan, planning wizard, time
chart, Fitness. These scroll rather than squash.

Outline was explicitly _not_ chosen for first-class treatment, but it shares `DataGrid`, so it
inherits card rows for free. It will be usable and untuned — a six-column hierarchical tree at
390px deserves its own cycle.

Weekly Schedule gets one cheap exception to "no redesign": switching FullCalendar to
`timeGridDay` with a day pager below `md`. A 7-day × 24h grid at 390px is worse than useless,
and the switch is a prop change.

**Desktop:** layout and density unchanged. Only token-level polish — a spacing scale, a stronger
focus ring, an elevation token — which desktop inherits without moving.

## Alternatives rejected

| Option                                   | Why not                                                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Keep columns, add horizontal scroll      | Least work, genuinely bad one-handed. The grid is for scanning; you cannot scan what you pan.                                 |
| Card list **plus** a "table view" toggle | A second surface to maintain and another persisted setting, for an escape hatch to a layout that is bad on the device anyway. |
| A route group `(app)/layout.tsx`         | Cleaner in principle, but moves 12 route directories. `AppShell` gets the same result as a mechanical, reviewable edit.       |
| Per-component breakpoints                | Twelve components each deciding what "small" means is how a codebase stops being responsive.                                  |
| A touch-drag polyfill                    | Preserves a gesture at the cost of a fragile input path. The command is more discoverable anyway.                             |
| A theme toggle                           | Dark mode is already first-class via `prefers-color-scheme`. A toggle is a product decision, not part of this.                |

## Open questions

- Whether the compact meta line should show the same fields on every grid or be tuned per view.
  Starting with a default derivation from `ColumnDef` order; tune only where it reads badly.
- Whether Outline earns a tuned compact layout later, or stays a desktop surface permanently.
