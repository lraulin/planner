/**
 * Row swipe — one reversible action per direction.
 *
 * The whole difficulty is that a swipe and a scroll start identically, and the list must win
 * ties: a gesture that steals vertical movement makes the page feel broken in a way that is
 * much worse than a swipe that occasionally fails to register.
 *
 * `responsive.md` limits swipe to reversible actions, so nothing here needs a confirmation
 * step — but nothing here should be wired to a delete, either.
 */

/** Movement below this is a tap or a jitter and commits to no axis at all. */
export const AXIS_LOCK_PX = 12;

/** How far the row must travel before releasing commits the action. */
export const SWIPE_TRIGGER_PX = 72;

/** The row stops following the finger past here, so the gesture has an obvious ceiling. */
export const SWIPE_MAX_PX = 96;

export type SwipeAxis = "none" | "horizontal" | "vertical";

export type SwipeAction = "none" | "left" | "right";

/**
 * Which axis the gesture has committed to.
 *
 * Ties go to `vertical` — a perfectly diagonal drag is far more likely to be a scroll that
 * started crooked than a swipe the user meant to aim.
 */
export function swipeAxis(
  dx: number,
  dy: number,
  lockPx: number = AXIS_LOCK_PX,
): SwipeAxis {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < lockPx && ay < lockPx) return "none";
  return ax > ay ? "horizontal" : "vertical";
}

/**
 * How far to translate the row while the finger is down. Vertical and uncommitted gestures
 * do not move the row at all, so a scroll never wobbles the list sideways.
 */
export function swipeOffset(
  dx: number,
  axis: SwipeAxis,
  maxPx: number = SWIPE_MAX_PX,
): number {
  if (axis !== "horizontal") return 0;
  return Math.max(-maxPx, Math.min(maxPx, dx));
}

/** What releasing here would do. `left` and `right` name the direction of travel. */
export function swipeAction(
  dx: number,
  axis: SwipeAxis,
  triggerPx: number = SWIPE_TRIGGER_PX,
): SwipeAction {
  if (axis !== "horizontal") return "none";
  if (dx <= -triggerPx) return "left";
  if (dx >= triggerPx) return "right";
  return "none";
}
