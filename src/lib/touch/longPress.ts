/**
 * Long press — the touch replacement for right-click.
 *
 * On a phone this is the *only* way to reach the row menu, and two grids keep commands there
 * that exist nowhere else in the app (`DailyItemsGrid`'s "Promote to task…" and "Move to
 * tomorrow", `NotesGrid`'s indent/outdent). So the thresholds matter: too short and scrolling
 * the list pops menus, too long and the gesture feels broken.
 *
 * A pure reducer rather than a hook, because the part that can be subtly wrong — when a press
 * survives a finger that drifts, and when it does not — is exactly the part a component test
 * would not catch.
 */

/** Below this and a scroll flick opens menus; above it the gesture feels unresponsive. */
export const LONG_PRESS_MS = 500;

/** A finger resting on glass wanders a few pixels; a scroll does not stay within ten. */
export const LONG_PRESS_SLOP_PX = 10;

export type PressState =
  | { phase: "idle" }
  | { phase: "pending"; x: number; y: number; startedAt: number }
  | { phase: "fired" }
  | { phase: "cancelled" };

export const IDLE: PressState = { phase: "idle" };

export function pressDown(x: number, y: number, now: number): PressState {
  return { phase: "pending", x, y, startedAt: now };
}

/**
 * Track a moving finger. Past the slop radius the press is cancelled for good — a press that
 * could un-cancel by wandering back would fire menus at the end of a scroll.
 */
export function pressMove(
  state: PressState,
  x: number,
  y: number,
  slopPx: number = LONG_PRESS_SLOP_PX,
): PressState {
  if (state.phase !== "pending") return state;
  const dx = x - state.x;
  const dy = y - state.y;
  if (dx * dx + dy * dy > slopPx * slopPx) return { phase: "cancelled" };
  return state;
}

/** Drive from a timer or an animation frame; fires once, then stays fired. */
export function pressTick(
  state: PressState,
  now: number,
  delayMs: number = LONG_PRESS_MS,
): PressState {
  if (state.phase !== "pending") return state;
  return now - state.startedAt >= delayMs ? { phase: "fired" } : state;
}

/** Lifting the finger ends the gesture either way; the caller reads `didFire` first. */
export function pressUp(): PressState {
  return IDLE;
}

/**
 * Whether the press became a long press. The row uses this to swallow the tap that follows —
 * otherwise a long press opens the menu *and* the record behind it.
 */
export function didFire(state: PressState): boolean {
  return state.phase === "fired";
}
