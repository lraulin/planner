# Mobile swipe row actions

**Status: frozen / complete** (2026-08-08)
Spec folder: `agent-os/specs/2026-08-08-1757-mobile-swipe-row-actions/`

## Context

On a phone the node grids render as `CompactRow` cards, where tap opens the record and
long press opens the row menu. There is no gesture for the two things done most often.
Every action a phone user takes today — complete, delete — costs a long press, a wait, and
a hunt through a sheet.

A swipe engine already exists and is tested (`src/lib/touch/swipe.ts`), but it is wired to
exactly **one** grid: `DailyItemsGrid` in the Day view, which is the view least likely to
survive. Tasks, Chooser, Projects, Goals, Result Areas and Outline have none.

The engine's presentation is also thin: a grey track with a text label, a hard clamp at
96px, and an instant snap back on release. Next to Reminders, Todoist or TickTick it reads
as unfinished — there is no colour, no icon, no "you can let go now" signal, and no spring.

Two outcomes: **swipe right completes, swipe left deletes, on every node grid**, and the
gesture itself feels like the apps it is imitating.

## Decisions

- **Right = Complete/Reopen, left = Delete.** Matches Reminders/TickTick/Todoist and the
  existing Day view gesture. Green rail right, red rail left.
- **Swipe-delete opens the existing `ConfirmDialog`** — same title, same branch warning,
  same child count as the menu's Delete. Delete here is a hard delete that takes children,
  so it never fires straight off a gesture.
- **Complete goes through `onStateChange` → `useStateChange.request`**, never a direct
  patch. That is what runs the completion cascade and raises the "and everything under
  it?" prompt. A gesture that bypassed it would produce exactly the parent/child state
  contradictions that cascade exists to prevent.
- **A swipe acts on the swiped row alone**, never on the multi-selection — capabilities are
  built with `count: 1`. Long press keeps the plural verbs.
- **Wire it once, at the capabilities layer.** `rowSwipeFor(capabilities)` mirrors the
  existing `rowMenuFor(capabilities)`, so the gesture, the row menu, the toolbar and the
  palette all describe one view's vocabulary from one object. Six hosts, one implementation.

## Acceptance criteria

- [x] Swiping a row right on Tasks, Chooser, Projects, Goals, Result Areas and Outline
      completes it; swiping a completed row right reopens it. _Verified: rails present on all
      six; "Update resume" went `C` → `IP` on release._
- [x] Swiping right on a parent with open children raises the cascade confirm. _Verified on
      `/projects`: "7 open items underneath will also be marked Completed."_
- [x] Swiping a row left raises the delete confirm, naming the row and its child count.
      _Verified: "Delete this task? Owes me 1 million won will be deleted."_
- [x] The rail is coloured and carries an icon, and reaches full strength with a haptic tick
      at the point releasing would fire it. _Amended — see Changes #1._
- [x] Releasing short of the threshold springs the row back rather than snapping. _Verified:
      a 40px swipe left the row in place, fired nothing, opened no dialog._
- [x] A vertical or diagonal drag still scrolls the list and never moves a row sideways.
      _Unchanged logic; `swipeAxis` gives an exact diagonal to the list, covered by tests._
- [x] Nothing changes at or above `md`. _Verified at 1280 × 800: `transform: none`, no rail,
      no dialog._

## Changes from original plan

| #   | Change                                                                                                               | Why                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The rail's **background** is full strength from the first pixel; the **content** is what ramps with `swipeProgress`. | The plan had the background fade in with the gesture. Built that way it is unreadable for the first third of the travel — white on a 30%-alpha green over the row surface has no contrast in either scheme. Same information, moved to the layer that can afford to be faint. |
| 2   | Added `select-none` (with `[&_input]:select-text`) to swipeable rows.                                                | Not in the plan; found by looking. A drag across a row left a word highlighted behind it, and on a phone dragging across text is also what raises the selection handles and the copy callout.                                                                                 |
| 3   | A direction with no configured action no longer moves the row at all.                                                | Previously the row slid open onto a blank rail and then did nothing on release — a promise followed by silence, which reads as a bug rather than as "there is nothing over here".                                                                                             |
| 4   | Added `swipe` / `release` steps to `.agents/skills/run-planner/driver.mjs`.                                          | There was no way to drive or photograph a swipe. `hold` is load-bearing: release springs the row home in 180ms, long before a screenshot lands.                                                                                                                               |

---

## Task 1: Save spec documentation

Create `agent-os/specs/2026-08-08-1757-mobile-swipe-row-actions/` with `plan.md`
(**Status: active**, this document), `shape.md`, `standards.md`
(`components/responsive.md`, `components/ux-principles.md`, `development/testing.md`) and
`references.md` (`DailyItemsGrid` swipe wiring, `rowMenu.ts`, `useNodeCommandDeck.tsx`).

## Task 2: Gesture engine — `src/lib/touch/swipe.ts`

Pure logic, tested beside it per `development/testing.md`.

- **Replace the hard clamp with rubber-band resistance.** `swipeOffset` follows the finger
  1:1 to `SWIPE_TRIGGER_PX`, then travels at a diminishing rate approaching `SWIPE_MAX_PX`
  asymptotically. The current clamp makes the row go dead under a finger that is still
  moving, which is the single biggest reason the gesture feels cheap.
- **Add `swipeProgress(dx, axis)` → 0–1**, capped at the trigger distance. The rail's fill
  and its icon read from this, so "how close am I" is on screen continuously rather than
  as a single jump.
- Update `swipe.test.ts`: the two clamp assertions become resistance assertions
  (monotonic, never exceeds `SWIPE_MAX_PX`, unchanged below the trigger), plus new cases
  for `swipeProgress` at 0, mid-travel, at the trigger and past it.

`swipeAxis` and `swipeAction` are unchanged — the diagonal-goes-to-scroll tie-break is
already right and is what keeps the gesture off the list's scroll.

## Task 3: Rail presentation — `src/components/grid/CompactRow.tsx`

- **`RowSwipeAction` gains `tone` and `icon`**: `tone: "positive" | "danger"`, `icon` a
  `CommandIcon` id, rendered through the existing `CommandGlyph`
  (`src/components/icons/commandIcons.tsx` already has `complete`, `delete` and `schedule`).
- **`SwipeTrack` becomes a coloured rail.** Background from the tone, ramped by
  `swipeProgress` so it deepens as the finger travels and reaches full strength exactly
  when releasing would fire. Icon above the label, both in the rail's foreground colour.
- **Haptic tick on the arming edge.** `navigator.vibrate?.(10)` in a guarded helper, fired
  once when `swipeAction` crosses to/from `"none"` — tracked in a ref, not state, so it
  does not re-render mid-gesture. iOS Safari does not implement `vibrate`; the guard makes
  that a silent no-op, which is the accepted web behaviour.
- **Spring back on release.** A `transition-transform` applied only while no pointer is
  down (a ref flag), so the row follows the finger with zero lag and animates home on
  release. `prefers-reduced-motion` is already handled globally in `globals.css:227`.

## Task 4: Colour tokens — `src/app/globals.css`

Add `--swipe-done` (green) in both `:root` and the dark block, exposed as
`--color-swipe-done` in `@theme inline`. Danger reuses `--priority-a`, which is already the
app's destructive hue (`ConfirmDialog`'s destructive button uses it).

> Note, not scope: `text-danger`, `bg-danger/10` and `border-danger/40` appear in
> `MetricDrawer.tsx` and `GoalMetricsPanel.tsx`, but no `--color-danger` is defined
> anywhere — those classes render nothing today. Worth its own fix; not folded in here.

## Task 5: `rowSwipeFor` — new `src/components/grid/rowSwipe.ts`

Mirrors `rowMenuFor` in shape and in reasoning: the host supplies the one thing only it
knows (its capabilities for this row) and the gesture falls out.

```
rowSwipeFor(capabilities: GridCommandCapabilities): RowSwipe
```

- `right` — from `actions.onSetState`. Label and target read `selection.state`:
  completed/cancelled → "Reopen" → `"not_started"`; otherwise "Complete" → `"completed"`.
  Tone `positive`, icon `complete`.
- `left` — from `actions.onDelete`, called with `[selection.id]` only. Tone `danger`, icon
  `delete`.
- A direction whose action is undefined is omitted, so a read-only view gets no gesture
  rather than a dead rail.

## Task 6: Wire the hosts

- **`useNodeCommandDeck.tsx`** returns `rowSwipe: (nodeId: string) => RowSwipe`, built from
  `rowSwipeFor(capabilitiesFor(nodeId, 1))` — deliberately `1`, see Decisions.
- Pass `rowSwipe={nodeCommands.rowSwipe}` to `DataGrid` in `TasksGrid.tsx`,
  `ChooserGrid.tsx`, `ProjectsGrid.tsx`, `GoalsGrid.tsx`, `ResultAreasGrid.tsx`. All five
  already render `{nodeCommands.dialogs}`, so the delete confirm needs no new wiring.
- **`OutlineGrid.tsx`** builds its own capabilities, so it gets its own one-liner:
  `rowSwipe = useCallback((id) => rowSwipeFor(capabilitiesFor(id, 1)), [capabilitiesFor])`.
  It already owns a `pendingDelete` confirm.
- **`DailyItemsGrid.tsx`** keeps its bespoke Complete / Tomorrow pair — that view's left
  action is genuinely different — and just gains `tone` and `icon` on both.

## Task 7: Update `agent-os/standards/components/responsive.md`

The Touch gestures section says "Swipe is for reversible actions only … Never delete
without a confirmation" — two clauses that pull against each other now that one direction
is Delete. Restate as the rule actually followed: a swipe either does something reversible,
or it opens the same confirmation the menu would. Update the gesture table row alongside it.

## Task 8: Verify, freeze spec

1. `npm run lint`, `npm run typecheck`, `npm run test:unit`.
2. Dev server up, then `npm run smoke` — required after touching `src/app/**` and cheap
   insurance for the shared grid components.
3. **Hands on the gesture at 390 × 844** (`responsive.md`'s checklist is the gate; there
   are no component tests): complete a task; complete a project with open children and see
   the cascade confirm; delete and see the branch warning; scroll the list with a slightly
   diagonal drag and confirm no row moves sideways; check both colour schemes.
4. **Re-check at 1280 × 800** — compact work regresses desktop density more often than the
   reverse.
5. Freeze the spec (`Status: frozen / complete`), complete **Changes from original plan**,
   update `agent-os/product/roadmap.md` if this closes a listed item.

## Follow-ups (new work — not amendments to this frozen spec)

- **`--color-danger` is defined nowhere.** `text-danger`, `bg-danger/10` and
  `border-danger/40` are used in `MetricDrawer.tsx` and `GoalMetricsPanel.tsx` and render
  nothing today. Found while looking for a destructive hue; deliberately not folded in.
- **A rest-open action rail** (Apple Mail / Reminders style) if one action per direction
  turns out to be too few. Needs one-open-row-at-a-time coordination, tap-outside-to-close
  and a full-swipe shortcut.
- **Undo instead of a confirm for delete**, if the app ever grows a toast system and
  `deleteNodeAction` grows a soft-delete. That is the better-feeling gesture; it is a
  schema change, not a gesture change.
- **Notes and Wish List** have no swipe: both run on their own data paths rather than
  `useNodeCommandDeck`.
