import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEDULE_VIEW,
  parseScheduleView,
  serializeScheduleView,
  slotDurationOf,
} from "./schedule";

describe("parseScheduleView", () => {
  it("round-trips what it wrote", () => {
    const settings = {
      slotMinutes: 6,
      workWeek: true,
      dayCount: 20,
      anchorMode: "aligned",
      railOpen: false,
      railShowCompleted: true,
      railGroupByArea: false,
      railShowTasks: true,
      railSortByPriority: false,
    } as const;
    expect(parseScheduleView(serializeScheduleView(settings))).toEqual(settings);
  });

  /**
   * The rail's switches joined this scope after `slotMinutes` / `workWeek` shipped, so blobs
   * already stored carry neither. Per-key fallback is what stops the upgrade resetting a
   * granularity someone chose.
   */
  it("keeps a stored granularity when the rail keys are absent", () => {
    expect(parseScheduleView({ slotMinutes: 15, workWeek: true })).toEqual({
      ...DEFAULT_SCHEDULE_VIEW,
      slotMinutes: 15,
      workWeek: true,
    });
  });

  it("keeps a rail switch turned off rather than reading false as absent", () => {
    const parsed = parseScheduleView({
      railOpen: false,
      railShowCompleted: false,
      railShowTasks: true,
    });
    expect(parsed.railOpen).toBe(false);
    expect(parsed.railShowCompleted).toBe(false);
    expect(parsed.railShowTasks).toBe(true);
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

  /**
   * Every blob written before day counts existed carries none of these three keys, and the
   * calendar those blobs describe is a seven-day one — so the fallback has to be the new
   * default rather than "whatever this blob was doing", which is nothing.
   */
  it("gives a pre-day-count blob the new defaults", () => {
    const parsed = parseScheduleView({ slotMinutes: 15, workWeek: true });
    expect(parsed.dayCount).toBe(7);
    expect(parsed.anchorMode).toBe("rolling");
    expect(parsed.railOpen).toBe(true);
  });

  it("refuses a day count that is not one of Achieve's", () => {
    // Google Calendar's 4-day view is the tempting one to store; it is not on the list.
    expect(parseScheduleView({ dayCount: 4 }).dayCount).toBe(7);
    expect(parseScheduleView({ dayCount: "20" }).dayCount).toBe(7);
    expect(parseScheduleView({ dayCount: 20 }).dayCount).toBe(20);
    expect(parseScheduleView({ dayCount: 1 }).dayCount).toBe(1);
  });

  it("refuses an unknown anchor mode", () => {
    expect(parseScheduleView({ anchorMode: "today" }).anchorMode).toBe("rolling");
    expect(parseScheduleView({ anchorMode: "aligned" }).anchorMode).toBe("aligned");
  });

  /**
   * Calendar vs Agenda is a page now, so it is in the URL and every blob written before that
   * carries a `viewMode` nothing reads. It falls out rather than surviving as a stray property.
   */
  it("ignores the viewMode key left behind by older builds", () => {
    expect(parseScheduleView({ viewMode: "agenda" })).not.toHaveProperty("viewMode");
  });

  it("keeps each field independent of the other being junk", () => {
    expect(parseScheduleView({ slotMinutes: 7, workWeek: true })).toEqual({
      ...DEFAULT_SCHEDULE_VIEW,
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
