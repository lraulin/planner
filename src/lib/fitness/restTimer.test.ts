import { describe, expect, it } from "vitest";
import {
  clampRestDuration,
  formatRestClock,
  nudgeRestDuration,
  remainingUntil,
} from "./restTimer";

describe("formatRestClock", () => {
  it("formats minutes and seconds", () => {
    expect(formatRestClock(90)).toBe("1:30");
    expect(formatRestClock(5)).toBe("0:05");
    expect(formatRestClock(0)).toBe("0:00");
  });

  it("ceils fractional seconds so the last tick shows 1", () => {
    expect(formatRestClock(0.2)).toBe("0:01");
  });
});

describe("clampRestDuration / nudge", () => {
  it("clamps to a sensible rest range", () => {
    expect(clampRestDuration(5)).toBe(15);
    expect(clampRestDuration(9999)).toBe(30 * 60);
  });

  it("nudges by 15 seconds", () => {
    expect(nudgeRestDuration(90, 1)).toBe(105);
    expect(nudgeRestDuration(90, -1)).toBe(75);
  });
});

describe("remainingUntil", () => {
  it("returns zero when past the end", () => {
    expect(remainingUntil(1000, 1500)).toBe(0);
  });

  it("returns seconds left", () => {
    expect(remainingUntil(5000, 2000)).toBe(3);
  });
});
