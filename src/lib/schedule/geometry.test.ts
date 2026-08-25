import { describe, expect, it } from "vitest";
import {
  asCalendarDay,
  atMinutes,
  contrastText,
  daysBetweenKeys,
  floatingDateTime,
  fromDateKey,
  localDateKey,
  minutesOfDay,
  normalizeTimeRange,
  parseFloatingDateTime,
  shiftDateKey,
  snapMinutes,
  sortDays,
  startOfWeek,
  toDateKey,
  weekDays,
  weekdayOfDateKey,
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
  it("round-trips a calendar day as UTC noon", () => {
    const d = fromDateKey("2026-03-08");
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(2);
    expect(d.getUTCDate()).toBe(8);
    expect(d.getUTCHours()).toBe(12);
    expect(toDateKey(d)).toBe("2026-03-08");
  });

  it("keeps the same key on either side of the Atlantic", () => {
    // Lee 2026-08: complete on Aug 1 → date completed showed Jul 31 after save.
    // Client local midnight Aug 1 EDT is 04:00Z; server startOfDay in UTC rewrote it to
    // 00:00Z; local getters on the laptop showed Jul 31. UTC-noon encoding prevents that.
    const fromClientPicker = fromDateKey("2026-08-01");
    expect(toDateKey(fromClientPicker)).toBe("2026-08-01");
    expect(toDateKey(asCalendarDay(fromClientPicker))).toBe("2026-08-01");
  });

  it("does not rewrite Aug 1 into Jul 31 the way startOfDay on a UTC server did", () => {
    // Simulate the old client stamp: local midnight of Aug 1 in a western zone is after
    // 00:00Z on Aug 1. asCalendarDay must still report Aug 1, not fall back a day.
    const clientLocalMidnight = new Date(Date.UTC(2026, 7, 1, 4, 0, 0)); // 00:00 EDT
    expect(toDateKey(asCalendarDay(clientLocalMidnight))).toBe("2026-08-01");
    // Server UTC startOfDay of that instant would be 00:00Z Aug 1 — local display Jul 31.
    const brokenServerStartOfDay = new Date(Date.UTC(2026, 7, 1, 0, 0, 0));
    expect(localDateKey(brokenServerStartOfDay)).not.toBe("2026-08-01"); // often Jul 31 in US
    expect(toDateKey(asCalendarDay(clientLocalMidnight))).not.toBe(
      localDateKey(brokenServerStartOfDay),
    );
  });

  it("localDateKey follows the wall clock for instants", () => {
    const evening = new Date(2026, 7, 1, 20, 0, 0);
    expect(localDateKey(evening)).toBe("2026-08-01");
  });

  it("does not treat an Eastern evening as tomorrow the way toDateKey of now does", () => {
    // 9pm EDT is already 01:00Z the next day. Finance pages used toDateKey(new Date())
    // for "today", so after ~8pm the budget month, upcoming bills, and Register year
    // collapse all jumped a day. "Today" of an instant is localDateKey.
    const evening = new Date(2026, 7, 25, 21, 0, 0);
    expect(localDateKey(evening)).toBe("2026-08-25");
    expect(toDateKey(evening)).toBe("2026-08-26");
  });
});

describe("weekdayOfDateKey / floatingDateTime", () => {
  it("reads the weekday off the key, not the process-local midnight", () => {
    // 2026-07-26 is a Sunday. UTC midnight of that day is Saturday evening in New York;
    // getDay() on new Date("2026-07-26") would report Saturday here.
    expect(weekdayOfDateKey("2026-07-26")).toBe(0);
    expect(weekdayOfDateKey("2026-07-27")).toBe(1);
  });

  it("writes a wall-clock time that is the same string in every zone", () => {
    expect(floatingDateTime("2026-08-13", 9 * 60)).toBe("2026-08-13T09:00:00");
    expect(floatingDateTime("2026-08-13", 9 * 60 + 30)).toBe("2026-08-13T09:30:00");
  });

  it("rolls minutes past midnight onto the next key", () => {
    expect(floatingDateTime("2026-08-13", 24 * 60)).toBe("2026-08-14T00:00:00");
    expect(floatingDateTime("2026-08-13", 22 * 60 + 8 * 60)).toBe(
      "2026-08-14T06:00:00",
    );
  });

  it("parses a floating string as local wall clock, not UTC", () => {
    const at = parseFloatingDateTime("2026-08-13T09:00:00");
    expect(at.getFullYear()).toBe(2026);
    expect(at.getMonth()).toBe(7);
    expect(at.getDate()).toBe(13);
    expect(at.getHours()).toBe(9);
    expect(at.getMinutes()).toBe(0);
  });

  it("returns an invalid Date rather than rolling a garbage string", () => {
    expect(Number.isNaN(parseFloatingDateTime("not a time").getTime())).toBe(true);
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
