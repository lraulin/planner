import { describe, expect, it } from "vitest";

import { monthEndKey } from "../envelope";
import {
  countWeekdayInMonth,
  monthsLeft,
  occurrenceDatesInMonth,
  outstandingCharges,
  scheduleSpreads,
  wholeOccurrences,
  type ScheduleBill,
} from "./cadence";
import type { Cadence } from "./types";

const sunday: Cadence = { unit: "week", weekday: 0 };

const monthly = (nextDueKey: string, expectedKey?: string): ScheduleBill => ({
  cadenceMonths: 1,
  cadenceDays: null,
  nextDueKey,
  expectedKey: expectedKey ?? nextDueKey,
});

const weeklyBill = (nextDueKey: string): ScheduleBill => ({
  cadenceMonths: 0,
  cadenceDays: 7,
  nextDueKey,
  expectedKey: nextDueKey,
});

const yearlyBill = (nextDueKey: string): ScheduleBill => ({
  cadenceMonths: 12,
  cadenceDays: null,
  nextDueKey,
  expectedKey: nextDueKey,
});

describe("countWeekdayInMonth", () => {
  it("finds the fifth Sunday in August 2026 and only four in September", () => {
    expect(countWeekdayInMonth("2026-08-01", 0)).toBe(5);
    expect(countWeekdayInMonth("2026-09-01", 0)).toBe(4);
  });

  it("counts a month whose 1st is the anchor weekday", () => {
    // 2026-11-01 is a Sunday.
    expect(countWeekdayInMonth("2026-11-01", 0)).toBe(5);
  });

  it("counts a month whose last day is the anchor weekday", () => {
    // 2026-01-31 is a Saturday.
    expect(countWeekdayInMonth("2026-01-01", 6)).toBe(5);
  });

  it("handles February in a common year and a leap year", () => {
    // 2027-02-01 is a Monday: 28 days, four of each weekday.
    expect(countWeekdayInMonth("2027-02-01", 1)).toBe(4);
    // 2028-02-01 is a Tuesday and the month has 29 days, so Tuesday gets a fifth.
    expect(countWeekdayInMonth("2028-02-01", 2)).toBe(5);
    expect(countWeekdayInMonth("2028-02-01", 1)).toBe(4);
  });

  it("sums every weekday to the length of the month", () => {
    for (const month of ["2026-08-01", "2027-02-01", "2028-02-01", "2026-11-01"]) {
      const total = [0, 1, 2, 3, 4, 5, 6].reduce(
        (sum, weekday) => sum + countWeekdayInMonth(month, weekday),
        0,
      );
      expect(total).toBe(Number(monthEndKey(month).slice(8, 10)));
    }
  });
});

describe("wholeOccurrences", () => {
  it("counts the whole month, however many anchors have already passed", () => {
    // Sundays: 2, 9, 16, 23, 30. The 28th does not make August cheaper.
    expect(wholeOccurrences(sunday, "2026-08-01")).toBe(5);
    expect(wholeOccurrences(sunday, "2026-09-01")).toBe(4);
    expect(wholeOccurrences({ unit: "month", day: 1 }, "2026-08-01")).toBe(1);
  });

  it("counts the whole month a target started in, not the anchors after its start day", () => {
    // The reported bug: `since` was the day the budget was created (the 24th), which cut
    // August from five Sundays to one and called a half-funded envelope Funded.
    expect(wholeOccurrences(sunday, "2026-08-01", undefined, "2026-08-24")).toBe(5);
    expect(wholeOccurrences(sunday, "2026-08-01", undefined, "2026-08-30")).toBe(5);
    expect(
      wholeOccurrences(
        { unit: "month", day: 1 },
        "2026-08-01",
        undefined,
        "2026-08-24",
      ),
    ).toBe(1);
  });

  it("asks nothing for a month entirely before the target, and all of one after", () => {
    expect(wholeOccurrences(sunday, "2026-07-01", undefined, "2026-08-24")).toBe(0);
    expect(wholeOccurrences(sunday, "2026-09-01", undefined, "2026-08-24")).toBe(4);
  });

  it("counts a target that started on the 1st exactly like one with no start day", () => {
    expect(wholeOccurrences(sunday, "2026-08-01", undefined, "2026-08-01")).toBe(5);
  });
});

describe("monthsLeft", () => {
  it("walks a yearly anchor forward once it has passed, because it repeats", () => {
    const october: Cadence = { unit: "year", month: 10 };
    expect(monthsLeft(october, "2026-08-01")).toBe(2);
    expect(monthsLeft(october, "2026-10-01")).toBe(0);
    expect(monthsLeft(october, "2026-11-01")).toBe(11);
  });

  it("floors a passed `by` deadline at zero, so balance asks the whole hole at once", () => {
    const by: Cadence = { unit: "by", month: "2026-10" };
    expect(monthsLeft(by, "2026-08-01")).toBe(2);
    expect(monthsLeft(by, "2026-10-01")).toBe(0);
    expect(monthsLeft(by, "2026-12-01")).toBe(0);
  });

  it("reports no horizon at all for a deadline-free balance", () => {
    expect(monthsLeft({ unit: "none" }, "2026-08-01")).toBeNull();
  });

  it("measures a sinking bill from the charge it is waiting for", () => {
    expect(
      monthsLeft({ unit: "schedule" }, "2026-08-01", yearlyBill("2026-10-15")),
    ).toBe(2);
  });
});

describe("occurrenceDatesInMonth", () => {
  it("lists every charge of a weekly bill inside the month", () => {
    expect(occurrenceDatesInMonth(weeklyBill("2026-08-06"), "2026-08-01")).toEqual([
      "2026-08-06",
      "2026-08-13",
      "2026-08-20",
      "2026-08-27",
    ]);
  });

  it("does not drift when a monthly anchor is clamped by a short month", () => {
    // Anchored on the 31st: every occurrence is measured from the anchor, so March keeps 31.
    expect(occurrenceDatesInMonth(monthly("2027-01-31"), "2027-02-01")).toEqual([
      "2027-02-28",
    ]);
    expect(occurrenceDatesInMonth(monthly("2027-01-31"), "2027-03-01")).toEqual([
      "2027-03-31",
    ]);
  });

  it("lists nothing in a month a sinking bill does not charge in", () => {
    expect(occurrenceDatesInMonth(yearlyBill("2026-10-15"), "2026-08-01")).toEqual([]);
    expect(occurrenceDatesInMonth(yearlyBill("2026-10-15"), "2026-10-01")).toEqual([
      "2026-10-15",
    ]);
  });
});

describe("scheduleSpreads", () => {
  it("sinks only for a cadence longer than a month", () => {
    expect(scheduleSpreads(yearlyBill("2026-10-15"))).toBe(true);
    expect(scheduleSpreads({ ...monthly("2026-08-15"), cadenceMonths: 3 })).toBe(true);
    expect(scheduleSpreads(monthly("2026-08-15"))).toBe(false);
    expect(scheduleSpreads(weeklyBill("2026-08-06"))).toBe(false);
  });
});

describe("outstandingCharges", () => {
  it("keeps a late unpaid bill asking after its due date", () => {
    // Due the 15th, unpaid on the 28th: `expectedKey` is still the 15th.
    expect(outstandingCharges(monthly("2026-09-15", "2026-08-15"), "2026-08-01")).toBe(
      1,
    );
  });

  it("stops asking once the charge is paid and the expected date moves on", () => {
    // Paid: the last posted charge advanced, so the outstanding charge is September's.
    expect(outstandingCharges(monthly("2026-09-15", "2026-09-15"), "2026-08-01")).toBe(
      0,
    );
  });

  it("counts only the weekly charges still outstanding", () => {
    const bill = weeklyBill("2026-08-20");
    expect(outstandingCharges(bill, "2026-08-01")).toBe(2);
    expect(wholeOccurrences({ unit: "schedule" }, "2026-08-01", bill)).toBe(4);
  });
});
