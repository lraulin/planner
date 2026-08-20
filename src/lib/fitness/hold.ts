/**
 * The one running hold stopwatch. Kept out of the components so React's purity rule is
 * satisfied — a clock read during render is exactly what that rule guards — and so the
 * straight-set editor and the round-major group view describe it the same way.
 */

import { elapsedSince } from "./duration";

export type RunningHold = {
  /** `DraftExercise.key` — which block is timing. */
  blockKey: string;
  /** Index into that block's sets; inside a group this is the round. */
  setIndex: number;
  startedAt: number;
};

export function beginHold(blockKey: string, setIndex: number): RunningHold {
  return { blockKey, setIndex, startedAt: Date.now() };
}

export function secondsHeld(hold: RunningHold): number {
  return elapsedSince(hold.startedAt, Date.now());
}

/** When this block's row is the one being timed, and since when. */
export function holdStartedAt(
  hold: RunningHold | null,
  blockKey: string,
  setIndex: number,
): number | null {
  if (!hold || hold.blockKey !== blockKey || hold.setIndex !== setIndex) return null;
  return hold.startedAt;
}
