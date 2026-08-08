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

/**
 * The ceiling the row approaches once past the trigger, and never quite reaches.
 *
 * An asymptote rather than a clamp: a row that stops dead under a finger that is still
 * moving reads as a bug in the page, where one that keeps creeping reads as the end of the
 * gesture. See {@link swipeOffset}.
 */
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
 *
 * The row tracks the finger exactly up to the trigger — inside that range the gesture is
 * still a question, and a row that lagged its own finger would make the answer feel
 * uncertain. Past it the travel is rubber-banded: `over / (over + slack)` gives back a
 * shrinking fraction of each further pixel, so the row approaches {@link SWIPE_MAX_PX}
 * without arriving. That ratio is chosen because its slope is exactly 1 where it takes
 * over, so there is no visible kink at the handover.
 */
export function swipeOffset(
  dx: number,
  axis: SwipeAxis,
  triggerPx: number = SWIPE_TRIGGER_PX,
  maxPx: number = SWIPE_MAX_PX,
): number {
  if (axis !== "horizontal") return 0;

  const distance = Math.abs(dx);
  if (distance <= triggerPx) return dx;

  const sign = dx < 0 ? -1 : 1;
  // No room to stretch into. Nothing in the app configures this, but a caller that passed a
  // ceiling at or below the trigger would otherwise divide by zero.
  const slack = maxPx - triggerPx;
  if (slack <= 0) return sign * Math.min(triggerPx, maxPx);

  const over = distance - triggerPx;
  return sign * (triggerPx + (slack * over) / (over + slack));
}

/**
 * How far along the gesture is, 0 to 1, where 1 means releasing would fire.
 *
 * The rail reads this to deepen its colour as the finger travels, so "how close am I" is
 * legible the whole way rather than arriving as a single jump at the threshold. It stays
 * at 1 past the trigger — there is no more commitment to express.
 */
export function swipeProgress(
  dx: number,
  axis: SwipeAxis,
  triggerPx: number = SWIPE_TRIGGER_PX,
): number {
  if (axis !== "horizontal" || triggerPx <= 0) return 0;
  return Math.min(1, Math.abs(dx) / triggerPx);
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
