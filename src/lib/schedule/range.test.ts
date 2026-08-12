import { describe, expect, it } from "vitest";
import { localDateKey, startOfWeek, weekDays } from "./geometry";
import {
  DAY_COUNTS,
  dayRange,
  isAnchorMode,
  isDayCount,
  scheduleRange,
  stepAnchor,
  weekRange,
  type DayCount,
  type RangeOptions,
} from "./range";

/** Wednesday, 12 August 2026. */
const WEDNESDAY = new Date(2026, 7, 12);
/** Sunday, 9 August 2026 — the start of `WEDNESDAY`'s week. */
const SUNDAY = new Date(2026, 7, 9);

function keys(days: Date[]): string[] {
  return days.map(localDateKey);
}

function opts(over: Partial<RangeOptions> = {}): RangeOptions {
  return { dayCount: 7, anchorMode: "rolling", workWeek: false, ...over };
}

describe("scheduleRange — rolling", () => {
  it("starts on the anchor at every day count", () => {
    for (const dayCount of DAY_COUNTS) {
      const range = scheduleRange(WEDNESDAY, opts({ dayCount }));
      expect(localDateKey(range.start)).toBe("2026-08-12");
      expect(range.days).toHaveLength(dayCount);
    }
  });

  it("runs consecutive calendar days, ending exclusively", () => {
    const range = scheduleRange(WEDNESDAY, opts({ dayCount: 3 }));
    expect(keys(range.days)).toEqual(["2026-08-12", "2026-08-13", "2026-08-14"]);
    expect(localDateKey(range.end)).toBe("2026-08-15");
  });

  it("normalizes an anchor that carries a time of day", () => {
    const range = scheduleRange(new Date(2026, 7, 12, 23, 45), opts({ dayCount: 1 }));
    expect(range.start.getHours()).toBe(0);
    expect(localDateKey(range.start)).toBe("2026-08-12");
  });
});

describe("scheduleRange — aligned", () => {
  it("reproduces the Sunday-aligned week at seven days", () => {
    const range = scheduleRange(
      WEDNESDAY,
      opts({ dayCount: 7, anchorMode: "aligned" }),
    );
    expect(keys(range.days)).toEqual(keys(weekDays(startOfWeek(WEDNESDAY, 0))));
  });

  it("honours a Monday week start", () => {
    const range = scheduleRange(
      WEDNESDAY,
      opts({ dayCount: 7, anchorMode: "aligned", weekStartsOn: 1 }),
    );
    expect(localDateKey(range.start)).toBe("2026-08-10");
  });

  it("still yields the requested number of days below a week", () => {
    const range = scheduleRange(
      WEDNESDAY,
      opts({ dayCount: 3, anchorMode: "aligned" }),
    );
    expect(keys(range.days)).toEqual(["2026-08-09", "2026-08-10", "2026-08-11"]);
  });
});

describe("scheduleRange — Work Week Mode", () => {
  it("counts visible columns, not calendar days", () => {
    for (const dayCount of DAY_COUNTS) {
      const range = scheduleRange(WEDNESDAY, opts({ dayCount, workWeek: true }));
      expect(range.days).toHaveLength(dayCount);
      expect(range.days.map((d) => d.getDay())).not.toContain(0);
      expect(range.days.map((d) => d.getDay())).not.toContain(6);
    }
  });

  it("gives Achieve's Monday–Friday work week at five days aligned", () => {
    const range = scheduleRange(
      WEDNESDAY,
      opts({ dayCount: 5, anchorMode: "aligned", workWeek: true }),
    );
    expect(keys(range.days)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
    ]);
  });

  it("skips the weekend a rolling range runs into", () => {
    // Friday: three visible days is Fri, then Mon and Tue.
    const friday = new Date(2026, 7, 14);
    const range = scheduleRange(friday, opts({ dayCount: 3, workWeek: true }));
    expect(keys(range.days)).toEqual(["2026-08-14", "2026-08-17", "2026-08-18"]);
  });

  it("ends after the last visible day even when the weekend follows", () => {
    const range = scheduleRange(SUNDAY, opts({ dayCount: 5, workWeek: true }));
    // Mon–Fri, so the exclusive end is Saturday — five columns spanning six calendar days
    // from the Sunday anchor.
    expect(localDateKey(range.end)).toBe("2026-08-15");
  });

  it("starts on the first weekday when the anchor is a weekend", () => {
    const range = scheduleRange(SUNDAY, opts({ dayCount: 1, workWeek: true }));
    expect(localDateKey(range.start)).toBe("2026-08-10");
  });
});

describe("scheduleRange — daylight saving", () => {
  it("keeps consecutive local midnights across the spring-forward boundary", () => {
    // 8 March 2026, 2am, in the timezone the suite pins (America/New_York).
    const range = scheduleRange(new Date(2026, 2, 6), opts({ dayCount: 5 }));
    expect(keys(range.days)).toEqual([
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
    ]);
    for (const day of range.days) expect(day.getHours()).toBe(0);
  });

  it("keeps consecutive local midnights across the fall-back boundary", () => {
    const range = scheduleRange(new Date(2026, 9, 30), opts({ dayCount: 5 }));
    expect(keys(range.days)).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ]);
    for (const day of range.days) expect(day.getHours()).toBe(0);
  });
});

describe("stepAnchor — rolling", () => {
  it("tiles: the next range starts the day after this one ends", () => {
    for (const dayCount of DAY_COUNTS) {
      const options = opts({ dayCount });
      const first = scheduleRange(WEDNESDAY, options);
      const next = scheduleRange(stepAnchor(WEDNESDAY, 1, options), options);
      expect(localDateKey(next.start)).toBe(localDateKey(first.end));
    }
  });

  it("tiles backwards without a gap or an overlap", () => {
    for (const dayCount of DAY_COUNTS) {
      const options = opts({ dayCount });
      const first = scheduleRange(WEDNESDAY, options);
      const prev = scheduleRange(stepAnchor(WEDNESDAY, -1, options), options);
      expect(localDateKey(prev.end)).toBe(localDateKey(first.start));
    }
  });

  it("returns where it started after a round trip, with or without weekends", () => {
    for (const workWeek of [false, true]) {
      for (const dayCount of DAY_COUNTS) {
        const options = opts({ dayCount, workWeek });
        const there = stepAnchor(WEDNESDAY, 1, options);
        const back = stepAnchor(there, -1, options);
        expect(keys(scheduleRange(back, options).days)).toEqual(
          keys(scheduleRange(WEDNESDAY, options).days),
        );
      }
    }
  });

  it("tiles in visible days when weekends are hidden", () => {
    const options = opts({ dayCount: 10, workWeek: true });
    const first = scheduleRange(new Date(2026, 7, 10), options);
    expect(keys(first.days)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
    ]);
    const next = scheduleRange(stepAnchor(new Date(2026, 7, 10), 1, options), options);
    expect(localDateKey(next.start)).toBe("2026-08-24");
  });
});

describe("stepAnchor — aligned", () => {
  it("moves a week at a time regardless of the day count", () => {
    for (const dayCount of DAY_COUNTS) {
      const options = opts({ dayCount, anchorMode: "aligned" });
      expect(localDateKey(stepAnchor(WEDNESDAY, 1, options))).toBe("2026-08-16");
      expect(localDateKey(stepAnchor(WEDNESDAY, -1, options))).toBe("2026-08-02");
    }
  });

  it("stays on the week boundary when stepped repeatedly", () => {
    const options = opts({ dayCount: 7, anchorMode: "aligned" });
    let anchor = WEDNESDAY;
    for (let i = 0; i < 5; i++) anchor = stepAnchor(anchor, 1, options);
    expect(localDateKey(anchor)).toBe("2026-09-13");
    expect(anchor.getDay()).toBe(0);
  });
});

describe("scheduleRange — bad input", () => {
  it("throws on an invalid anchor rather than searching for a weekday forever", () => {
    expect(() => scheduleRange(new Date("nonsense"), opts({ workWeek: true }))).toThrow(
      /valid date/,
    );
  });
});

describe("weekRange / dayRange", () => {
  it("gives the Sunday-aligned week whatever day it is handed", () => {
    expect(keys(weekRange(WEDNESDAY).days)).toEqual(
      keys(weekDays(startOfWeek(WEDNESDAY, 0))),
    );
    expect(keys(weekRange(SUNDAY).days)).toEqual(keys(weekRange(WEDNESDAY).days));
  });

  it("keeps weekends even though the calendar may be hiding them", () => {
    // Work Week Mode is a property of the calendar, not of "a week" — the planning wizard
    // and the agent's week tools would otherwise silently lose two days.
    expect(weekRange(WEDNESDAY).days).toHaveLength(7);
  });

  it("gives exactly the day asked for", () => {
    const range = dayRange(SUNDAY);
    expect(keys(range.days)).toEqual(["2026-08-09"]);
    expect(localDateKey(range.end)).toBe("2026-08-10");
  });
});

describe("guards", () => {
  it("accepts only Achieve's day counts", () => {
    expect(isDayCount(7)).toBe(true);
    expect(isDayCount(20)).toBe(true);
    // 4 is Google Calendar's, not Achieve's, and an arbitrary count would still draw —
    // which is why this is membership-checked rather than range-checked.
    expect(isDayCount(4)).toBe(false);
    expect(isDayCount("7")).toBe(false);
    expect(isDayCount(undefined)).toBe(false);
  });

  it("accepts only the two anchor modes", () => {
    expect(isAnchorMode("rolling")).toBe(true);
    expect(isAnchorMode("aligned")).toBe(true);
    expect(isAnchorMode("today")).toBe(false);
    expect(isAnchorMode(7)).toBe(false);
  });
});

describe("type surface", () => {
  it("keeps DayCount assignable from the exported tuple", () => {
    const counts: DayCount[] = [...DAY_COUNTS];
    expect(counts).toEqual([1, 3, 5, 7, 10, 20]);
  });
});
