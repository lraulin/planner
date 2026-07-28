import { describe, expect, it } from "vitest";
import {
  atMinutes,
  contrastText,
  fromDateKey,
  minutesOfDay,
  normalizeTimeRange,
  snapMinutes,
  sortDays,
  startOfWeek,
  toDateKey,
  weekDays,
} from "./geometry";

describe("snapMinutes", () => {
  it("snaps to 15-minute steps", () => {
    expect(snapMinutes(7)).toBe(0);
    expect(snapMinutes(8)).toBe(15);
    expect(snapMinutes(22)).toBe(15);
    expect(snapMinutes(23)).toBe(30);
  });
});

describe("normalizeTimeRange", () => {
  it("clamps and snaps", () => {
    expect(normalizeTimeRange(-10, 5)).toEqual({
      startMinute: 0,
      durationMinutes: 15,
    });
  });
});

describe("startOfWeek / weekDays", () => {
  it("starts on Sunday by default", () => {
    // Wednesday 2026-07-29
    const wed = fromDateKey("2026-07-29");
    const start = startOfWeek(wed, 0);
    expect(toDateKey(start)).toBe("2026-07-26");
    expect(weekDays(start).map(toDateKey)).toEqual([
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
    ]);
  });
});

describe("atMinutes / minutesOfDay", () => {
  it("round-trips", () => {
    const day = fromDateKey("2026-07-28");
    const at = atMinutes(day, 14 * 60 + 30);
    expect(minutesOfDay(at)).toBe(14 * 60 + 30);
  });
});

describe("sortDays", () => {
  it("dedupes and sorts", () => {
    expect(sortDays([5, 1, 1, 3, 9, -1])).toEqual([1, 3, 5]);
  });
});

describe("contrastText", () => {
  it("uses light text on dark fills and dark text on light fills", () => {
    expect(contrastText("#000080")).toBe("#f5f5f7");
    expect(contrastText("#90ee90")).toBe("#1b1d23");
    expect(contrastText("#c8e0f0")).toBe("#1b1d23");
    expect(contrastText("#fff")).toBe("#1b1d23");
  });
});
