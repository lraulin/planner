# Mobile swipe row actions — Shaping Notes

**Status: frozen / complete** (2026-08-08)

## Scope

Row swipe gestures on the phone layout of the node grids, and a rail that looks like the
one in the apps this is imitating.

- **Swipe right → Complete / Reopen.** Through the host's existing `onStateChange`, so the
  completion cascade and its confirmation are unchanged.
- **Swipe left → Delete.** Opens the existing `ConfirmDialog` with the existing branch
  warning. Never fires straight off the gesture.
- **Six hosts:** Tasks, Chooser, Projects, Goals, Result Areas, Outline.
- **The gesture itself:** rubber-band resistance past the trigger, a coloured rail with an
  icon that fills as the finger travels, a haptic tick when releasing would fire, and an
  animated spring back on release.

### Out of scope

- **A rest-open action rail** (Apple Mail / Reminders style: partial swipe parks the row
  open showing tappable buttons). Considered and declined for this slice — it needs
  one-open-row-at-a-time coordination, tap-outside-to-close and a full-swipe shortcut, and
  the single-action-per-direction engine already exists and is tested.
- **Undo / soft delete.** The best-feeling delete is an immediate one with a 5s undo toast,
  but the app has no toast system and `deleteNodeAction` is a hard delete. That is a schema
  and infrastructure change, not a gesture change.
- **Notes and Wish List.** Both run on their own data paths rather than
  `useNodeCommandDeck`, and "complete" carries less meaning on either.
- **`--color-danger`.** `text-danger` / `bg-danger` are used in `MetricDrawer.tsx` and
  `GoalMetricsPanel.tsx` but the token is defined nowhere, so those classes render nothing
  today. A real bug, found while looking for a destructive hue; fixed separately.

## Decisions

- **Right completes, left deletes.** Reminders, TickTick and Todoist all put complete on
  the right, and the app's own Day view already does. Inverting it to match the literal
  phrasing of the request would fight muscle memory from every other app on the phone.
- **Delete stays behind the confirmation.** `deleteNodeAction` is a hard delete that takes
  the whole branch, and `nodeDeleteMessage` already says "This cannot be undone". A gesture
  that fired it directly would be the one irreversible thing in the app reachable by
  accident.
- **Complete routes through `useStateChange.request`, not a patch.** That hook owns the
  cascade — settling a row settles the open work under it — and the "and everything under
  it?" prompt. Bypassing it is precisely how parent/child state contradictions appear.
- **A swipe is about one row.** Capabilities are built with `count: 1`, so a swipe never
  acts on a lingering multi-selection. The plural verbs stay on long press.
- **One implementation at the capabilities layer.** `rowSwipeFor(capabilities)` mirrors
  `rowMenuFor(capabilities)`: a host states what it can do for a row, and the gesture, the
  row menu, the toolbar and the palette all fall out of that one object. Six hosts get the
  same gestures without six wirings that can drift.
- **The Day view keeps its own pair** (Complete / Tomorrow). Its left action is genuinely
  different from the list tabs', and it is the one view where "push it to tomorrow" is the
  second most common thing you do.

## Context

- **Visuals:** None. Reference behaviour is Apple Reminders, Todoist and TickTick.
- **References:** see `references.md`.
- **Product alignment:** `mission.md` promises the app is "reachable from phone, tablet,
  and any OS" and it installs as a PWA. `responsive.md` states the phone layout is a
  different information architecture over the same data, not a shrunken desktop — a
  gesture for the two most common actions is part of that architecture, not a nicety.

## Standards Applied

- **components/responsive.md** — owns the gesture table, the axis-lock rule, the 44px tap
  minimum and the phone verification checklist. This work also amends its swipe bullet.
- **components/ux-principles.md** — reserves modals for destructive confirmations, which is
  the licence the swipe-delete confirm operates under.
- **development/testing.md** — swipe thresholds are pure logic in `src/lib/touch/` with
  tests beside them; there are no component tests, so the phone checklist is the gate.
