import { describe, expect, it } from "vitest";
import { toDateKey } from "./geometry";
import { allDayRange, draftFromCalendarSelect } from "./allDay";

describe("allDayRange", () => {
  it("turns a same-day timed range into a one-day exclusive pair", () => {
    // The Google 400: toggling All day on 9:00–10:00 left both keys on the 12th.
    const start = new Date(2026, 7, 12, 9, 0, 0);
    const end = new Date(2026, 7, 12, 10, 0, 0);
    const range = allDayRange(start, end);
    expect(toDateKey(range.startAt)).toBe("2026-08-12");
    expect(toDateKey(range.endAt)).toBe("2026-08-13");
    expect(range.startAt.getUTCHours()).toBe(12);
    expect(range.endAt.getUTCHours()).toBe(12);
  });

  it("keeps an already-exclusive midnight end rather than adding another day", () => {
    const start = new Date(2026, 7, 12, 0, 0, 0);
    const end = new Date(2026, 7, 13, 0, 0, 0);
    const range = allDayRange(start, end);
    expect(toDateKey(range.startAt)).toBe("2026-08-12");
    expect(toDateKey(range.endAt)).toBe("2026-08-13");
  });

  it("includes the end's calendar day when the timed range spans midnight", () => {
    const start = new Date(2026, 7, 12, 9, 0, 0);
    const end = new Date(2026, 7, 14, 10, 0, 0);
    const range = allDayRange(start, end);
    expect(toDateKey(range.startAt)).toBe("2026-08-12");
    expect(toDateKey(range.endAt)).toBe("2026-08-15");
  });

  it("still produces a one-day span when start and end are the same instant", () => {
    // New all-day from the calendar's all-day strip used to set endAt === startAt.
    const at = new Date(2026, 7, 12, 0, 0, 0);
    const range = allDayRange(at, at);
    expect(toDateKey(range.startAt)).toBe("2026-08-12");
    expect(toDateKey(range.endAt)).toBe("2026-08-13");
  });

  it("uses the wall-clock day, not the UTC date, of an evening instant", () => {
    // 9pm Eastern on the 12th is 01:00Z on the 13th. toDateKey would make this the 13th.
    const start = new Date(2026, 7, 12, 21, 0, 0);
    const end = new Date(2026, 7, 12, 22, 0, 0);
    const range = allDayRange(start, end);
    expect(toDateKey(range.startAt)).toBe("2026-08-12");
    expect(toDateKey(range.endAt)).toBe("2026-08-13");
  });
});

describe("draftFromCalendarSelect", () => {
  it("does not treat a midnight-to-midnight span as all-day without the flag", () => {
    // The all-day strip and a genuine 24-hour timed event produce the same instants.
    // Dropping FullCalendar's `allDay` is how "New all-day event" became a 24-hour block.
    const start = new Date(2026, 7, 12, 0, 0, 0);
    const end = new Date(2026, 7, 13, 0, 0, 0);
    expect(draftFromCalendarSelect(start, end, false)).toEqual({
      startAt: start,
      endAt: end,
      allDay: false,
    });
    const allDay = draftFromCalendarSelect(start, end, true);
    expect(allDay.allDay).toBe(true);
    expect(toDateKey(allDay.startAt)).toBe("2026-08-12");
    expect(toDateKey(allDay.endAt)).toBe("2026-08-13");
  });

  it("opens a one-day all-day draft from a same-instant all-day click", () => {
    const at = new Date(2026, 7, 12, 0, 0, 0);
    const draft = draftFromCalendarSelect(at, at, true);
    expect(draft.allDay).toBe(true);
    expect(toDateKey(draft.startAt)).toBe("2026-08-12");
    expect(toDateKey(draft.endAt)).toBe("2026-08-13");
  });
});
