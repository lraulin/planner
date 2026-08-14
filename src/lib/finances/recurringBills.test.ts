import { describe, expect, it } from "vitest";
import {
  annualCents,
  cadenceLabel,
  cadenceMonthsFromGapDays,
  nextDueDate,
  nextDueFrom,
  shiftDateKeyMonths,
  spanDays,
} from "./recurringBills";

describe("shiftDateKeyMonths", () => {
  it("keeps the day of the month when the target month is long enough", () => {
    expect(shiftDateKeyMonths("2026-03-03", 6)).toBe("2026-09-03");
    expect(shiftDateKeyMonths("2025-09-04", 6)).toBe("2026-03-04");
  });

  it("clamps into a short month instead of overflowing past it", () => {
    // The naive `setMonth` answer is Mar 3 — a bill that walks a day later every year.
    expect(shiftDateKeyMonths("2025-08-31", 6)).toBe("2026-02-28");
    expect(shiftDateKeyMonths("2027-08-31", 6)).toBe("2028-02-29");
    expect(shiftDateKeyMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("lands Feb 29 on Feb 28 in a common year", () => {
    expect(shiftDateKeyMonths("2028-02-29", 12)).toBe("2029-02-28");
  });

  it("crosses the year boundary in both directions", () => {
    expect(shiftDateKeyMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(shiftDateKeyMonths("2026-02-15", -3)).toBe("2025-11-15");
    expect(shiftDateKeyMonths("2026-01-15", -1)).toBe("2025-12-15");
  });

  it("does not shift the day when the timezone would push midnight backwards", () => {
    // The Aug 1 → Jul 31 regression: nothing here goes through a local-midnight Date.
    expect(shiftDateKeyMonths("2026-08-01", 12)).toBe("2027-08-01");
    expect(shiftDateKeyMonths("2026-08-01", 0)).toBe("2026-08-01");
  });
});

describe("nextDueFrom", () => {
  it("walks past a stale anchor rather than reporting a date in the past", () => {
    // Last charged three cycles ago. A single `+ 6 months` would say Sep 2025.
    expect(nextDueFrom("2025-03-04", 6, "2026-08-14")).toBe("2026-09-04");
  });

  it("returns the first cycle when it is already ahead of today", () => {
    expect(nextDueFrom("2026-06-04", 6, "2026-08-14")).toBe("2026-12-04");
  });

  it("treats a due date equal to today as due, not past", () => {
    expect(nextDueFrom("2026-02-14", 6, "2026-08-14")).toBe("2026-08-14");
  });
});

describe("spanDays", () => {
  it("measures the real days a charge covers, not a notional average", () => {
    // Mar 3 → Sep 3 is 184 days; Sep 4 → Mar 4 is 181. Both are "every 6 months".
    expect(spanDays("2026-03-03", 6)).toBe(184);
    expect(spanDays("2025-09-04", 6)).toBe(181);
    expect(spanDays("2026-01-15", 12)).toBe(365);
    // The one year in four whose span swallows a leap day is a day longer.
    expect(spanDays("2028-01-15", 12)).toBe(366);
  });
});

describe("cadenceMonthsFromGapDays", () => {
  it("recognises the standard cadences at their exact gaps", () => {
    expect(cadenceMonthsFromGapDays(30)).toBe(1);
    expect(cadenceMonthsFromGapDays(91)).toBe(3);
    expect(cadenceMonthsFromGapDays(183)).toBe(6);
    expect(cadenceMonthsFromGapDays(365)).toBe(12);
  });

  it("accepts a bill that slipped a fortnight", () => {
    expect(cadenceMonthsFromGapDays(200)).toBe(6);
    expect(cadenceMonthsFromGapDays(170)).toBe(6);
  });

  it("proposes nothing for a gap that belongs to no cadence", () => {
    // 7.9 months. Nobody bills on it, and a proposal nobody can make sense of invites a
    // confirming click.
    expect(cadenceMonthsFromGapDays(240)).toBeNull();
    expect(cadenceMonthsFromGapDays(150)).toBeNull();
    expect(cadenceMonthsFromGapDays(480)).toBeNull();
  });

  it("does not let a quarterly gap pass for monthly", () => {
    // The reason the tolerance is proportional: a fixed ±20 days would match both.
    expect(cadenceMonthsFromGapDays(91)).not.toBe(1);
    expect(cadenceMonthsFromGapDays(45)).toBeNull();
  });

  it("picks the nearer cadence when two are in range", () => {
    expect(cadenceMonthsFromGapDays(55)).toBe(2);
  });
});

describe("annualCents", () => {
  it("annualizes a semi-annual premium", () => {
    expect(annualCents(141_260, 6)).toBe(282_520);
  });

  it("leaves a monthly bill alone", () => {
    expect(annualCents(210_000, 1)).toBe(2_520_000);
  });

  it("is the charge itself for a yearly bill", () => {
    expect(annualCents(85_000, 12)).toBe(85_000);
  });
});

describe("cadenceLabel", () => {
  it("names the cadences a person would use", () => {
    expect(cadenceLabel(1)).toBe("Monthly");
    expect(cadenceLabel(3)).toBe("Quarterly");
    expect(cadenceLabel(6)).toBe("Every 6 months");
    expect(cadenceLabel(12)).toBe("Yearly");
  });

  it("falls back to the number for a cadence outside the offered list", () => {
    expect(cadenceLabel(4)).toBe("Every 4 months");
  });
});

describe("nextDueDate", () => {
  it("is one cadence on from the last charge", () => {
    expect(nextDueDate("2026-03-03", 6)).toBe("2026-09-03");
  });
});
