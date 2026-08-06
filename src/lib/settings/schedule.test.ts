import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEDULE_VIEW,
  parseScheduleView,
  serializeScheduleView,
  slotDurationOf,
} from "./schedule";

describe("parseScheduleView", () => {
  it("round-trips what it wrote", () => {
    const settings = { slotMinutes: 6, workWeek: true } as const;
    expect(parseScheduleView(serializeScheduleView(settings))).toEqual(settings);
  });

  it("returns the defaults for an unusable blob", () => {
    // This runs before the first paint. A stored value from an older version, or none at all,
    // must produce a drawable calendar rather than an exception.
    for (const junk of [null, undefined, 7, "thirty", [], { v: 99 }]) {
      expect(parseScheduleView(junk)).toEqual(DEFAULT_SCHEDULE_VIEW);
    }
  });

  it("refuses a granularity that is not on the list", () => {
    // 7 minutes would draw a grid whose lines never land on the hour.
    expect(parseScheduleView({ slotMinutes: 7 }).slotMinutes).toBe(30);
    expect(parseScheduleView({ slotMinutes: "30" }).slotMinutes).toBe(30);
    expect(parseScheduleView({ slotMinutes: 5 }).slotMinutes).toBe(5);
  });

  it("keeps each field independent of the other being junk", () => {
    expect(parseScheduleView({ slotMinutes: 7, workWeek: true })).toEqual({
      slotMinutes: 30,
      workWeek: true,
    });
  });
});

describe("slotDurationOf", () => {
  it("writes FullCalendar's HH:MM:SS", () => {
    expect(slotDurationOf(5)).toBe("00:05:00");
    expect(slotDurationOf(30)).toBe("00:30:00");
    // The hour is the one value that is not "00:MM:00", and it is the one most likely to be
    // written by hand as "00:60:00".
    expect(slotDurationOf(60)).toBe("01:00:00");
  });
});
