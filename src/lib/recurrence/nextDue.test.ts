import { describe, expect, it } from "vitest";
import { fromDateKey, toDateKey } from "@/lib/schedule/geometry";
import { isDeferred, nextDue } from "./nextDue";

/** A wall-clock local date (simulates an instant of completion). */
function at(year: number, month: number, day: number, hour = 9): Date {
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

/** Calendar-day key of a stored date. */
function key(date: Date): string {
  return toDateKey(date);
}

describe("nextDue", () => {
  it("does not repeat when the frequency is none", () => {
    expect(nextDue(at(2026, 3, 3), "none", 1)).toBeNull();
  });

  it("steps by the interval rather than by one unit", () => {
    expect(key(nextDue(at(2026, 3, 3), "daily", 3)!)).toBe("2026-03-06");
    expect(key(nextDue(at(2026, 3, 3), "weekly", 2)!)).toBe("2026-03-17");
    expect(key(nextDue(at(2026, 3, 3), "monthly", 3)!)).toBe("2026-06-03");
    expect(key(nextDue(at(2026, 3, 3), "yearly", 2)!)).toBe("2028-03-03");
  });

  it("measures from the completion, so falling behind does not create a backlog", () => {
    // Fortnightly chore, completed four days late. The next one is due 14 days from the
    // completion (Mar 21), not 14 days from when it was "supposed" to be done (Mar 17).
    expect(key(nextDue(at(2026, 3, 7), "weekly", 2)!)).toBe("2026-03-21");
  });

  it("clamps into a short month instead of overflowing into the next one", () => {
    // Jan 31 + 1 month is the end of February, not March 3.
    expect(key(nextDue(at(2026, 1, 31), "monthly", 1)!)).toBe("2026-02-28");
    expect(key(nextDue(at(2028, 1, 31), "monthly", 1)!)).toBe("2028-02-29");
  });

  it("keeps a Feb 29 yearly series on a real date in common years", () => {
    expect(key(nextDue(at(2028, 2, 29), "yearly", 1)!)).toBe("2029-02-28");
  });

  it("lands on the next local day across a DST spring-forward", () => {
    // US DST begins 2026-03-08. Adding 86_400_000 ms to a 09:00 completion would give
    // 10:00 on the 8th; going through the local setters gives the right calendar day.
    const next = nextDue(at(2026, 3, 7, 9), "daily", 1)!;
    expect(key(next)).toBe("2026-03-08");
  });

  it("returns a calendar-day encoding rather than the time it was ticked at", () => {
    // Completion stamped as a calendar day (what DateField / asCalendarDay write).
    const next = nextDue(fromDateKey("2026-08-01"), "daily", 1)!;
    expect(key(next)).toBe("2026-08-02");
    expect(next.getUTCHours()).toBe(12);
    expect(next.getUTCMinutes()).toBe(0);
  });

  it("floors a zero or negative interval to 1 rather than repeating instantly", () => {
    // An empty number field mid-edit must not be able to produce "due again immediately".
    expect(key(nextDue(at(2026, 3, 3), "daily", 0)!)).toBe("2026-03-04");
    expect(key(nextDue(at(2026, 3, 3), "daily", -5)!)).toBe("2026-03-04");
  });
});

describe("isDeferred", () => {
  /** Stored calendar day (UTC noon), matching DateField / `fromDateKey`. */
  const day = (k: string) => fromDateKey(k);

  it("is available on the day it is due, not only the day after", () => {
    // The boundary that matters: `deferredDate > new Date()` reads as correct and hides a
    // routine for most of the day it was actually due.
    expect(isDeferred(day("2026-03-08"), "2026-03-08")).toBe(false);
  });

  it("is deferred while the date is still in the future", () => {
    expect(isDeferred(day("2026-03-09"), "2026-03-08")).toBe(true);
  });

  it("is available once the date has passed", () => {
    expect(isDeferred(day("2026-03-01"), "2026-03-08")).toBe(false);
  });

  it("ignores the time of day on the stored timestamp", () => {
    // Deferred to 17:00 today; still available at 09:00 today (local).
    expect(isDeferred(new Date(2026, 2, 8, 17, 0, 0), "2026-03-08")).toBe(false);
  });

  it("treats a task with no deferred date as available", () => {
    expect(isDeferred(null, "2026-03-08")).toBe(false);
  });

  it("defers nothing when today is unknown, so server and client agree", () => {
    expect(isDeferred(day("2099-01-01"), null)).toBe(false);
  });
});
