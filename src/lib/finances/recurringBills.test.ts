import { describe, expect, it } from "vitest";
import {
  annualCents,
  cadenceColumns,
  cadenceFromKey,
  cadenceKey,
  cadenceLabel,
  cadenceMonthsFromGapDays,
  cadenceOf,
  detectCadence,
  nextDueDate,
  nextDueFrom,
  previousDueDate,
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
    expect(nextDueFrom("2025-03-04", { unit: "month", n: 6 }, "2026-08-14")).toBe(
      "2026-09-04",
    );
  });

  it("returns the first cycle when it is already ahead of today", () => {
    expect(nextDueFrom("2026-06-04", { unit: "month", n: 6 }, "2026-08-14")).toBe(
      "2026-12-04",
    );
  });

  it("treats a due date equal to today as due, not past", () => {
    expect(nextDueFrom("2026-02-14", { unit: "month", n: 6 }, "2026-08-14")).toBe(
      "2026-08-14",
    );
  });
});

describe("spanDays", () => {
  it("measures the real days a charge covers, not a notional average", () => {
    // Mar 3 → Sep 3 is 184 days; Sep 4 → Mar 4 is 181. Both are "every 6 months".
    expect(spanDays("2026-03-03", { unit: "month", n: 6 })).toBe(184);
    expect(spanDays("2025-09-04", { unit: "month", n: 6 })).toBe(181);
    expect(spanDays("2026-01-15", { unit: "month", n: 12 })).toBe(365);
    // The one year in four whose span swallows a leap day is a day longer.
    expect(spanDays("2028-01-15", { unit: "month", n: 12 })).toBe(366);
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
    expect(annualCents(141_260, { unit: "month", n: 6 })).toBe(282_520);
  });

  it("leaves a monthly bill alone", () => {
    expect(annualCents(210_000, { unit: "month", n: 1 })).toBe(2_520_000);
  });

  it("is the charge itself for a yearly bill", () => {
    expect(annualCents(85_000, { unit: "month", n: 12 })).toBe(85_000);
  });
});

describe("cadenceLabel", () => {
  it("names the cadences a person would use", () => {
    expect(cadenceLabel({ unit: "month", n: 1 })).toBe("Monthly");
    expect(cadenceLabel({ unit: "month", n: 3 })).toBe("Quarterly");
    expect(cadenceLabel({ unit: "month", n: 6 })).toBe("Every 6 months");
    expect(cadenceLabel({ unit: "month", n: 12 })).toBe("Yearly");
  });

  it("falls back to the number for a cadence outside the offered list", () => {
    expect(cadenceLabel({ unit: "month", n: 4 })).toBe("Every 4 months");
  });
});

describe("nextDueDate", () => {
  it("is one cadence on from the last charge", () => {
    expect(nextDueDate("2026-03-03", { unit: "month", n: 6 })).toBe("2026-09-03");
  });
});

/** Vetsource's real history: Dante's Simparico Trio, shipped and charged every four weeks. */
const VETSOURCE = [
  "2025-10-30",
  "2025-11-29",
  "2025-12-27",
  "2026-01-24",
  "2026-02-24",
  "2026-03-26",
  "2026-04-23",
  "2026-05-21",
  "2026-06-18",
  "2026-07-16",
  "2026-08-14",
];

describe("detectCadence", () => {
  it("calls Vetsource a 28-day cycle, not a monthly bill", () => {
    // Gaps of 30, 28, 28, 31, 30, 28, 28, 28, 28, 29 — indistinguishable from a monthly
    // bill's. What settles it is the day of the month: 30, 29, 27, 24, 24, 26, 23, 21, 18,
    // 16, 14, walking backwards a couple of days a cycle.
    expect(detectCadence(VETSOURCE)).toEqual({ unit: "day", n: 28 });
  });

  it("calls rent monthly from gaps in the same 28-to-31 range", () => {
    expect(
      detectCadence([
        "2026-03-01",
        "2026-04-01",
        "2026-05-01",
        "2026-06-01",
        "2026-07-01",
      ]),
    ).toEqual({ unit: "month", n: 1 });
  });

  it("treats a bill anchored to the end of the month as monthly", () => {
    // The 31st does not exist in February, so the day of the month moves — but its distance
    // from the month's end does not, which is the case `calendarAnchored` has to survive.
    expect(
      detectCadence([
        "2025-12-31",
        "2026-01-31",
        "2026-02-28",
        "2026-03-31",
        "2026-04-30",
      ]),
    ).toEqual({ unit: "month", n: 1 });
  });

  it("keeps calling a barely-drifting series monthly", () => {
    // Gaps of 29 with the day of the month holding at 5, 3, 4, 2 is a monthly bill posting
    // a day or two early, not a 29-day cycle. Months are the fallback in every uncertain
    // case, because a day count is the stronger claim and has to be earned.
    expect(
      detectCadence(["2026-01-05", "2026-02-03", "2026-03-04", "2026-04-02"]),
    ).toEqual({ unit: "month", n: 1 });
  });

  it("will not claim a day cadence from three charges", () => {
    // Four charges before the stronger claim can be made. Three is one coincidence away.
    expect(detectCadence(VETSOURCE.slice(0, 3))).toEqual({ unit: "month", n: 1 });
  });

  it("falls back to months when the gaps are ragged", () => {
    // Gaps of 46, 10 and 30: a median that looks monthly and individual gaps that make
    // "every 30 days" a fiction. The month is the honest answer.
    expect(
      detectCadence(["2026-01-05", "2026-02-20", "2026-03-02", "2026-04-01"]),
    ).toEqual({ unit: "month", n: 1 });
  });

  it("proposes nothing for a gap that belongs to no cadence at all", () => {
    expect(detectCadence(["2026-01-05", "2026-08-30"])).toBeNull();
  });
});

describe("day cadences", () => {
  const autoship = { unit: "day", n: 28 } as const;

  it("walks forward by days, not by calendar months", () => {
    expect(nextDueDate("2026-08-14", autoship)).toBe("2026-09-11");
    // A monthly reading would say 2026-09-14, three days late and later every cycle.
    expect(nextDueDate("2026-08-14", { unit: "month", n: 1 })).toBe("2026-09-14");
    expect(nextDueFrom("2026-05-21", autoship, "2026-08-21")).toBe("2026-09-10");
  });

  it("costs a year at 13.04 cycles, not twelve", () => {
    // $29.70 every 28 days is $387.42 a year. Priced as monthly it reads $356.40 — the
    // $31 a year that made this whole unit worth having.
    expect(annualCents(2970, autoship)).toBe(38742);
    expect(annualCents(2970, { unit: "month", n: 1 })).toBe(35640);
  });

  it("covers exactly its own days", () => {
    expect(spanDays("2026-08-14", autoship)).toBe(28);
  });

  it("steps back a whole cycle", () => {
    expect(previousDueDate("2026-09-11", autoship)).toBe("2026-08-14");
    expect(previousDueDate("2026-09-01", { unit: "month", n: 1 })).toBe("2026-08-01");
  });

  it("reads as weeks where the days divide evenly", () => {
    expect(cadenceLabel(autoship)).toBe("Every 4 weeks");
    expect(cadenceLabel({ unit: "day", n: 7 })).toBe("Weekly");
    expect(cadenceLabel({ unit: "day", n: 45 })).toBe("Every 45 days");
  });
});

describe("cadenceOf and cadenceColumns", () => {
  it("lets days win over months, and treats absent days as months", () => {
    expect(cadenceOf({ cadenceMonths: 1, cadenceDays: 28 })).toEqual({
      unit: "day",
      n: 28,
    });
    expect(cadenceOf({ cadenceMonths: 6, cadenceDays: null })).toEqual({
      unit: "month",
      n: 6,
    });
    expect(cadenceOf({ cadenceMonths: 12 })).toEqual({ unit: "month", n: 12 });
  });

  it("round-trips through the columns, filling months with the nearest one", () => {
    // `cadence_months` is not null and has to hold something. The nearest month keeps any
    // reader that has never heard of day cadences close rather than on 1.
    expect(cadenceColumns({ unit: "day", n: 28 })).toEqual({
      cadenceMonths: 1,
      cadenceDays: 28,
    });
    expect(cadenceColumns({ unit: "day", n: 90 })).toEqual({
      cadenceMonths: 3,
      cadenceDays: 90,
    });
    expect(cadenceColumns({ unit: "month", n: 6 })).toEqual({
      cadenceMonths: 6,
      cadenceDays: null,
    });
    expect(cadenceOf(cadenceColumns({ unit: "day", n: 28 }))).toEqual({
      unit: "day",
      n: 28,
    });
  });
});

describe("cadenceKey", () => {
  it("round-trips both units", () => {
    expect(cadenceFromKey(cadenceKey({ unit: "day", n: 28 }))).toEqual({
      unit: "day",
      n: 28,
    });
    expect(cadenceFromKey(cadenceKey({ unit: "month", n: 12 }))).toEqual({
      unit: "month",
      n: 12,
    });
  });

  it("returns null rather than NaN for anything it does not recognise", () => {
    // A stale bookmark or a hand-edited option must not produce a cadence of NaN months.
    expect(cadenceFromKey("custom")).toBeNull();
    expect(cadenceFromKey("")).toBeNull();
    expect(cadenceFromKey("y3")).toBeNull();
    expect(cadenceFromKey("m0")).toBeNull();
  });
});
