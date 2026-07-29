import { describe, expect, it } from "vitest";
import {
  expandRecurrence,
  expandTimeChartAreas,
  type RecurrenceInput,
} from "./recurrence";
import { fromDateKey, startOfWeek } from "./geometry";

function master(
  partial: Partial<RecurrenceInput> & Pick<RecurrenceInput, "startAt" | "endAt">,
): RecurrenceInput {
  return {
    id: "a1",
    subject: "Test",
    allDay: false,
    checkState: "open",
    projectId: null,
    recurrenceFrequency: "none",
    recurrenceInterval: 1,
    recurrenceByWeekday: null,
    recurrenceEnd: "never",
    recurrenceCount: null,
    recurrenceUntil: null,
    ...partial,
  };
}

describe("expandRecurrence", () => {
  it("returns a single non-recurring event in range", () => {
    const start = fromDateKey("2026-07-28");
    start.setHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60_000);
    const rangeStart = startOfWeek(start, 0);
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + 7);

    const occ = expandRecurrence(
      master({ startAt: start, endAt: end }),
      rangeStart,
      rangeEnd,
    );
    expect(occ).toHaveLength(1);
    expect(occ[0].subject).toBe("Test");
  });

  it("expands weekly on selected weekdays", () => {
    // Tuesday Jul 28 2026 9:00 for 1h, weekly Tue+Thu
    const start = fromDateKey("2026-07-28");
    start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60_000);
    const rangeStart = startOfWeek(start, 0);
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + 7);

    const occ = expandRecurrence(
      master({
        startAt: start,
        endAt: end,
        recurrenceFrequency: "weekly",
        recurrenceByWeekday: [2, 4], // Tue, Thu
      }),
      rangeStart,
      rangeEnd,
    );
    expect(occ.map((o) => o.startAt.getDay()).sort()).toEqual([2, 4]);
  });

  it("respects end after N occurrences", () => {
    const start = fromDateKey("2026-07-27"); // Monday
    start.setHours(8, 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60_000);
    const rangeStart = start;
    const rangeEnd = new Date(start);
    rangeEnd.setDate(rangeEnd.getDate() + 14);

    const occ = expandRecurrence(
      master({
        startAt: start,
        endAt: end,
        recurrenceFrequency: "daily",
        recurrenceEnd: "count",
        recurrenceCount: 3,
      }),
      rangeStart,
      rangeEnd,
    );
    expect(occ).toHaveLength(3);
  });
});

describe("expandTimeChartAreas", () => {
  it("places multi-day areas on each selected weekday", () => {
    const weekStart = fromDateKey("2026-07-26"); // Sunday
    const events = expandTimeChartAreas(
      [
        {
          id: "sleep",
          name: "Sleep",
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          startMinute: 0,
          durationMinutes: 6 * 60,
          backColor: "#000080",
          foreColor: "#ffffff",
          labelEnabled: true,
        },
        {
          id: "workout",
          name: "Work Out",
          daysOfWeek: [1, 2, 3, 4, 5],
          startMinute: 7 * 60,
          durationMinutes: 60,
          backColor: "#90ee90",
          foreColor: "#000000",
          labelEnabled: true,
        },
      ],
      weekStart,
    );
    expect(events.filter((e) => e.areaId === "sleep")).toHaveLength(7);
    expect(events.filter((e) => e.areaId === "workout")).toHaveLength(5);
  });
});
