import { describe, expect, it } from "vitest";
import { isDeferred, nextDue } from "./nextDue";

/** A local-time date, so the DST cases below mean what they say. */
function at(year: number, month: number, day: number, hour = 9): Date {
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

/** Local `YYYY-MM-DD`, for asserting on a returned Date without timezone noise. */
function localKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

describe("nextDue", () => {
  it("does not repeat when the frequency is none", () => {
    expect(nextDue(at(2026, 3, 3), "none", 1)).toBeNull();
  });

  it("steps by the interval rather than by one unit", () => {
    expect(localKey(nextDue(at(2026, 3, 3), "daily", 3)!)).toBe("2026-03-06");
    expect(localKey(nextDue(at(2026, 3, 3), "weekly", 2)!)).toBe("2026-03-17");
    expect(localKey(nextDue(at(2026, 3, 3), "monthly", 3)!)).toBe("2026-06-03");
    expect(localKey(nextDue(at(2026, 3, 3), "yearly", 2)!)).toBe("2028-03-03");
  });

  it("measures from the completion, so falling behind does not create a backlog", () => {
    // Fortnightly chore, completed four days late. The next one is due 14 days from the
    // completion (Mar 21), not 14 days from when it was "supposed" to be done (Mar 17).
    expect(localKey(nextDue(at(2026, 3, 7), "weekly", 2)!)).toBe("2026-03-21");
  });

  it("clamps into a short month instead of overflowing into the next one", () => {
    // Jan 31 + 1 month is the end of February, not March 3.
    expect(localKey(nextDue(at(2026, 1, 31), "monthly", 1)!)).toBe("2026-02-28");
    expect(localKey(nextDue(at(2028, 1, 31), "monthly", 1)!)).toBe("2028-02-29");
  });

  it("keeps a Feb 29 yearly series on a real date in common years", () => {
    expect(localKey(nextDue(at(2028, 2, 29), "yearly", 1)!)).toBe("2029-02-28");
  });

  it("lands on the next local day across a DST spring-forward", () => {
    // US DST begins 2026-03-08. Adding 86_400_000 ms to a 09:00 completion would give
    // 10:00 on the 8th; going through the local setters gives the right calendar day.
    const next = nextDue(at(2026, 3, 7, 9), "daily", 1)!;
    expect(localKey(next)).toBe("2026-03-08");
  });

  it("returns local midnight rather than the time it was ticked at", () => {
    // Not tidiness. These dates are compared as **UTC** calendar days by `isDeferred` and
    // `useToday`, so a routine finished at 20:00 Eastern and left at 20:00 would carry a
    // defer date whose UTC day is the day after the one it is due, and stay hidden through
    // most of it. Local midnight in a western zone lands on the intended UTC day.
    const next = nextDue(at(2026, 8, 1, 20), "daily", 1)!;
    expect(localKey(next)).toBe("2026-08-02");
    expect(next.getHours()).toBe(0);
    expect(next.getMinutes()).toBe(0);
  });

  it("floors a zero or negative interval to 1 rather than repeating instantly", () => {
    // An empty number field mid-edit must not be able to produce "due again immediately".
    expect(localKey(nextDue(at(2026, 3, 3), "daily", 0)!)).toBe("2026-03-04");
    expect(localKey(nextDue(at(2026, 3, 3), "daily", -5)!)).toBe("2026-03-04");
  });
});

describe("isDeferred", () => {
  /** UTC midnight, matching how the app derives day keys (`useToday`). */
  const utc = (key: string) => new Date(`${key}T00:00:00Z`);

  it("is available on the day it is due, not only the day after", () => {
    // The boundary that matters: `deferredDate > new Date()` reads as correct and hides a
    // routine for most of the day it was actually due.
    expect(isDeferred(utc("2026-03-08"), "2026-03-08")).toBe(false);
  });

  it("is deferred while the date is still in the future", () => {
    expect(isDeferred(utc("2026-03-09"), "2026-03-08")).toBe(true);
  });

  it("is available once the date has passed", () => {
    expect(isDeferred(utc("2026-03-01"), "2026-03-08")).toBe(false);
  });

  it("ignores the time of day on the stored timestamp", () => {
    // Deferred to 17:00 today; still available at 09:00 today.
    expect(isDeferred(new Date("2026-03-08T17:00:00Z"), "2026-03-08")).toBe(false);
  });

  it("treats a task with no deferred date as available", () => {
    expect(isDeferred(null, "2026-03-08")).toBe(false);
  });

  it("defers nothing when today is unknown, so server and client agree", () => {
    expect(isDeferred(utc("2099-01-01"), null)).toBe(false);
  });
});
