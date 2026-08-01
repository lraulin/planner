import { describe, expect, it } from "vitest";
import {
  IDLE,
  LONG_PRESS_MS,
  didFire,
  pressDown,
  pressMove,
  pressTick,
  pressUp,
} from "@/lib/touch/longPress";

describe("longPress", () => {
  it("fires once the delay has elapsed", () => {
    let state = pressDown(100, 100, 0);
    state = pressTick(state, LONG_PRESS_MS - 1);
    expect(didFire(state)).toBe(false);

    state = pressTick(state, LONG_PRESS_MS);
    expect(didFire(state)).toBe(true);
  });

  it("tolerates a finger that wanders inside the slop radius", () => {
    let state = pressDown(100, 100, 0);
    state = pressMove(state, 106, 106); // ~8.5px — inside 10
    state = pressTick(state, LONG_PRESS_MS);

    expect(didFire(state)).toBe(true);
  });

  it("cancels once the finger leaves the slop radius", () => {
    let state = pressDown(100, 100, 0);
    state = pressMove(state, 100, 120);

    expect(state.phase).toBe("cancelled");
  });

  it("measures slop radially, not per axis", () => {
    // 8px on each axis is under the threshold alone but 11.3px combined — a diagonal scroll
    // flick must not survive as a press.
    let state = pressDown(0, 0, 0);
    state = pressMove(state, 8, 8);

    expect(state.phase).toBe("cancelled");
  });

  it("never un-cancels when the finger wanders back", () => {
    let state = pressDown(100, 100, 0);
    state = pressMove(state, 100, 200);
    state = pressMove(state, 100, 100);
    state = pressTick(state, LONG_PRESS_MS * 4);

    expect(didFire(state)).toBe(false);
  });

  it("does not fire a press that was cancelled before the delay", () => {
    let state = pressDown(0, 0, 0);
    state = pressMove(state, 0, 40);
    state = pressTick(state, LONG_PRESS_MS);

    expect(state.phase).toBe("cancelled");
  });

  it("stays fired across further ticks so the menu opens once", () => {
    let state = pressDown(0, 0, 0);
    state = pressTick(state, LONG_PRESS_MS);
    const first = state;
    state = pressTick(state, LONG_PRESS_MS * 2);

    expect(state).toEqual(first);
  });

  it("ignores movement and ticks once idle", () => {
    expect(pressMove(IDLE, 999, 999)).toBe(IDLE);
    expect(pressTick(IDLE, 10_000)).toBe(IDLE);
  });

  it("returns to idle on lift", () => {
    expect(pressUp()).toEqual(IDLE);
  });

  it("respects a caller-supplied delay and slop", () => {
    let state = pressDown(0, 0, 0);
    expect(didFire(pressTick(state, 200, 150))).toBe(true);

    state = pressDown(0, 0, 0);
    expect(pressMove(state, 0, 20, 30).phase).toBe("pending");
  });
});
