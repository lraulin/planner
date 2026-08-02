import { describe, expect, it } from "vitest";
import {
  atMinutes,
  contrastText,
  daysBetweenKeys,
  fromDateKey,
  minutesOfDay,
  normalizeTimeRange,
  shiftDateKey,
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

describe("toDateKey / fromDateKey", () => {
  it("round-trips a local calendar day", () => {
    const d = fromDateKey("2026-03-08");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(8);
    expect(d.getHours()).toBe(0);
    expect(toDateKey(d)).toBe("2026-03-08");
  });

  it("uses the local day of an evening stamp, not the UTC day", () => {
    // 20:00 Eastern on 1 Aug is already 2 Aug UTC — toISOString would lie.
    const evening = new Date(2026, 7, 1, 20, 0, 0);
    expect(toDateKey(evening)).toBe("2026-08-01");
  });
});

describe("daysBetweenKeys / shiftDateKey", () => {
  it("counts whole days between keys without DST noise", () => {
    expect(daysBetweenKeys("2026-03-07", "2026-03-08")).toBe(1);
    expect(daysBetweenKeys("2026-03-08", "2026-03-01")).toBe(-7);
  });

  it("shifts a day label by N days", () => {
    expect(shiftDateKey("2026-03-08", 1)).toBe("2026-03-09");
    expect(shiftDateKey("2026-03-08", -7)).toBe("2026-03-01");
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
