import { describe, expect, it } from "vitest";
import { daysSince, elapsedParts, formatElapsed } from "./elapsed";

/** The parts of a span, as a compact string, so the expectations read like the column does. */
function elapsed(from: string, to: string): string | null {
  const parts = elapsedParts(from, to);
  return parts ? formatElapsed(parts) : null;
}

describe("daysSince", () => {
  it("counts whole days up to today", () => {
    expect(daysSince("2026-08-01", "2026-08-13")).toBe(12);
  });

  it("is negative for a date that has not happened", () => {
    expect(daysSince("2026-09-01", "2026-08-13")).toBe(-19);
  });

  it("does not shift across a DST boundary", () => {
    // The suite runs pinned to America/New_York, where 2026-03-08 springs forward. A helper
    // that went through local Date arithmetic would return 30 or 32 here.
    expect(daysSince("2026-02-25", "2026-03-27")).toBe(30);
  });
});

describe("elapsedParts", () => {
  it("breaks a long span into years, months and days", () => {
    expect(elapsed("2001-05-02", "2026-08-13")).toBe("25y 3m 11d");
  });

  it("returns zero days on the same date", () => {
    expect(elapsed("2026-08-13", "2026-08-13")).toBe("0d");
  });

  it("returns null for a date that has not happened yet", () => {
    expect(elapsedParts("2026-09-01", "2026-08-13")).toBeNull();
  });

  it("borrows correctly across a short month", () => {
    // Jan 31 → Mar 1. Subtracting components gives months = 2, days = -30; borrowing
    // February's 29 days still lands on -1. Stepping from January gives the right answer:
    // one whole month reaches Feb 29 (clamped), and Mar 1 is one day past it.
    expect(elapsed("2024-01-31", "2024-03-01")).toBe("1m 1d");
  });

  it("does not count a month that has not come round yet", () => {
    // Two calendar months apart by component subtraction, one month apart in fact.
    expect(elapsed("2026-01-15", "2026-03-14")).toBe("1m 27d");
  });

  it("counts a leap-day anniversary as a whole year on Feb 28 of a common year", () => {
    // 2025 has no Feb 29, so a year after 2024-02-29 clamps to 2025-02-28 — and that day is
    // the anniversary, not one day short of it.
    expect(elapsed("2024-02-29", "2025-02-28")).toBe("1y 0m 0d");
    expect(elapsed("2024-02-29", "2025-03-01")).toBe("1y 0m 1d");
  });

  it("counts an exact anniversary as whole years", () => {
    expect(elapsed("1998-06-15", "2026-06-15")).toBe("28y 0m 0d");
  });

  it("is one day short of an anniversary the day before it", () => {
    expect(elapsed("1998-06-15", "2026-06-14")).toBe("27y 11m 30d");
  });

  it("counts a span that crosses a year boundary", () => {
    expect(elapsed("2025-12-20", "2026-01-05")).toBe("16d");
  });
});

describe("formatElapsed", () => {
  it("drops leading zero units but keeps interior ones", () => {
    // "1y 0m 4d" must not collapse to "1y 4d" — that reads as a span you can add up, and
    // the reader would get a different number than the one being described.
    expect(formatElapsed({ years: 1, months: 0, days: 4 })).toBe("1y 0m 4d");
    expect(formatElapsed({ years: 0, months: 3, days: 4 })).toBe("3m 4d");
    expect(formatElapsed({ years: 0, months: 0, days: 4 })).toBe("4d");
    expect(formatElapsed({ years: 0, months: 0, days: 0 })).toBe("0d");
  });
});
