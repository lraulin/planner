import { describe, expect, it } from "vitest";
import {
  expandRecurrence,
  expandTimeChartAreas,
  type RecurrenceInput,
} from "./recurrence";
import { fromDateKey, startOfWeek, toDateKey } from "./geometry";

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

/** A 1-hour appointment at 09:00 on the given day key. */
function at9(key: string): { startAt: Date; endAt: Date } {
  const startAt = fromDateKey(key);
  startAt.setHours(9, 0, 0, 0);
  return { startAt, endAt: new Date(startAt.getTime() + 60 * 60_000) };
}

/** Half-open window [from, to) covering whole local days. */
function window(from: string, to: string): [Date, Date] {
  return [fromDateKey(from), fromDateKey(to)];
}

const keysOf = (occ: { startAt: Date }[]) => occ.map((o) => toDateKey(o.startAt));

describe("expandRecurrence — daily", () => {
  it("steps by the interval rather than every day", () => {
    const occ = expandRecurrence(
      master({
        ...at9("2026-03-02"),
        recurrenceFrequency: "daily",
        recurrenceInterval: 3,
      }),
      ...window("2026-03-01", "2026-03-13"),
    );
    expect(keysOf(occ)).toEqual([
      "2026-03-02",
      "2026-03-05",
      "2026-03-08",
      "2026-03-11",
    ]);
  });

  it("treats `until` as inclusive of its calendar day", () => {
    const occ = expandRecurrence(
      master({
        ...at9("2026-03-02"),
        recurrenceFrequency: "daily",
        recurrenceEnd: "until",
        // Midnight on the 4th: the appointment that day is at 09:00, so an exclusive
        // comparison would drop it. It should be kept.
        recurrenceUntil: fromDateKey("2026-03-04"),
      }),
      ...window("2026-03-01", "2026-03-13"),
    );
    expect(keysOf(occ)).toEqual(["2026-03-02", "2026-03-03", "2026-03-04"]);
  });

  it("clips a series that began long before the window", () => {
    const occ = expandRecurrence(
      master({ ...at9("2026-01-01"), recurrenceFrequency: "daily" }),
      ...window("2026-03-02", "2026-03-05"),
    );
    expect(keysOf(occ)).toEqual(["2026-03-02", "2026-03-03", "2026-03-04"]);
  });

  it("does not resurrect a counted series in a later window", () => {
    // Three occurrences from Jan 1, viewed in March. The series is long over.
    const occ = expandRecurrence(
      master({
        ...at9("2026-01-01"),
        recurrenceFrequency: "daily",
        recurrenceEnd: "count",
        recurrenceCount: 3,
      }),
      ...window("2026-03-01", "2026-03-08"),
    );
    expect(occ).toEqual([]);
  });

  it("keeps local wall-clock time across a DST spring-forward", () => {
    // US DST begins Sun 2026-03-08. A 09:00 appointment stays at 09:00, even though
    // the 7th→8th gap is only 23 hours.
    const occ = expandRecurrence(
      master({ ...at9("2026-03-06"), recurrenceFrequency: "daily" }),
      ...window("2026-03-06", "2026-03-11"),
    );
    expect(keysOf(occ)).toEqual([
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
    ]);
    expect(occ.every((o) => o.startAt.getHours() === 9)).toBe(true);
  });
});

describe("expandRecurrence — weekly", () => {
  it("skips weeks when the interval is greater than one", () => {
    // Biweekly Monday, from Mon 2026-03-02.
    const occ = expandRecurrence(
      master({
        ...at9("2026-03-02"),
        recurrenceFrequency: "weekly",
        recurrenceInterval: 2,
      }),
      ...window("2026-03-01", "2026-04-12"),
    );
    expect(keysOf(occ)).toEqual(["2026-03-02", "2026-03-16", "2026-03-30"]);
  });

  it("does not resurrect a counted series in a later window", () => {
    // Weekly Monday from Jan 5, three occurrences: Jan 5, 12, 19. Viewed in March,
    // the series is long over and nothing should be emitted.
    const occ = expandRecurrence(
      master({
        ...at9("2026-01-05"),
        recurrenceFrequency: "weekly",
        recurrenceEnd: "count",
        recurrenceCount: 3,
      }),
      ...window("2026-03-01", "2026-03-29"),
    );
    expect(occ).toEqual([]);
  });

  it("stops at `until` in a later window", () => {
    const occ = expandRecurrence(
      master({
        ...at9("2026-01-05"),
        recurrenceFrequency: "weekly",
        recurrenceEnd: "until",
        recurrenceUntil: fromDateKey("2026-01-19"),
      }),
      ...window("2026-03-01", "2026-03-29"),
    );
    expect(occ).toEqual([]);
  });
});

describe("expandRecurrence — monthly and yearly", () => {
  it("repeats on the same day each month", () => {
    const occ = expandRecurrence(
      master({ ...at9("2026-03-10"), recurrenceFrequency: "monthly" }),
      ...window("2026-03-01", "2026-06-01"),
    );
    expect(keysOf(occ)).toEqual(["2026-03-10", "2026-04-10", "2026-05-10"]);
  });

  it("clamps a 31st series into short months", () => {
    const occ = expandRecurrence(
      master({ ...at9("2026-01-31"), recurrenceFrequency: "monthly" }),
      ...window("2026-01-01", "2026-05-01"),
    );
    // February has no 31st. What matters is that every emitted date is real and
    // ordered; the exact clamp policy is pinned here so a change is deliberate.
    expect(keysOf(occ)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-28",
      "2026-04-28",
    ]);
  });

  it("repeats annually", () => {
    const occ = expandRecurrence(
      master({ ...at9("2024-05-20"), recurrenceFrequency: "yearly" }),
      ...window("2026-01-01", "2027-01-01"),
    );
    expect(keysOf(occ)).toEqual(["2026-05-20"]);
  });

  it("keeps a Feb 29 series on a real date in common years", () => {
    const occ = expandRecurrence(
      master({ ...at9("2024-02-29"), recurrenceFrequency: "yearly" }),
      ...window("2025-01-01", "2026-01-01"),
    );
    expect(keysOf(occ)).toEqual(["2025-02-28"]);
  });
});

describe("expandRecurrence — bounds", () => {
  it("never exceeds maxOccurrences", () => {
    const occ = expandRecurrence(
      master({ ...at9("2026-01-01"), recurrenceFrequency: "daily" }),
      ...window("2026-01-01", "2027-01-01"),
      10,
    );
    expect(occ.length).toBeLessThanOrEqual(10);
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
