import { describe, expect, it } from "vitest";

import { monthEndKey } from "../envelope";
import { countWeekdayInMonth, runWeekly } from "./weekly";
import type { WeeklyTemplate } from "./types";

const SUNDAY = 0;
const FRIDAY = 5;

function weekly(amountCents: number, weekday: number): WeeklyTemplate {
  return {
    id: "w1",
    directive: "template",
    type: "weekly",
    priority: 0,
    amountCents,
    weekday,
  };
}

describe("countWeekdayInMonth", () => {
  it("counts five Sundays in August 2026 and four in September", () => {
    expect(countWeekdayInMonth("2026-08-01", SUNDAY)).toBe(5);
    expect(countWeekdayInMonth("2026-09-01", SUNDAY)).toBe(4);
  });

  it("counts the 1st itself when the month opens on the anchor weekday", () => {
    // 2026-03-01 is a Sunday; a first-occurrence off-by-one would report 4.
    expect(countWeekdayInMonth("2026-03-01", SUNDAY)).toBe(5);
  });

  it("counts the last day when the month closes on the anchor weekday", () => {
    // 2026-01-31 is a Saturday.
    expect(countWeekdayInMonth("2026-01-01", 6)).toBe(5);
  });

  it("handles February, common and leap", () => {
    // 2027-02-01 is a Monday, so 28 days is exactly four of every weekday.
    expect(countWeekdayInMonth("2027-02-01", 1)).toBe(4);
    expect(countWeekdayInMonth("2027-02-01", SUNDAY)).toBe(4);
    // 2028-02-01 is a Tuesday; 29 days gives the 1st's weekday a fifth turn.
    expect(countWeekdayInMonth("2028-02-01", 2)).toBe(5);
    expect(countWeekdayInMonth("2028-02-01", 1)).toBe(4);
  });

  it("sums every weekday to the length of the month", () => {
    for (const month of ["2026-02-01", "2026-08-01", "2026-09-01", "2028-02-01"]) {
      const counted = [0, 1, 2, 3, 4, 5, 6].reduce(
        (sum, weekday) => sum + countWeekdayInMonth(month, weekday),
        0,
      );
      expect([month, counted]).toEqual([
        month,
        Number(monthEndKey(month).slice(8, 10)),
      ]);
    }
  });
});

describe("runWeekly", () => {
  it("multiplies the amount by the occurrences in the month", () => {
    expect(runWeekly(weekly(18_000, SUNDAY), "2026-08-01")).toBe(90_000);
    expect(runWeekly(weekly(18_000, SUNDAY), "2026-09-01")).toBe(72_000);
  });

  it("asks for the whole month regardless of where today falls (D2)", () => {
    // No today is passed at all — the signature is the guarantee.
    expect(runWeekly(weekly(4_500, FRIDAY), "2026-10-01")).toBe(
      4_500 * countWeekdayInMonth("2026-10-01", FRIDAY),
    );
  });

  it("rejects a non-integer amount", () => {
    expect(() => runWeekly(weekly(18_000.5, SUNDAY), "2026-08-01")).toThrow(
      /integer cents/,
    );
  });
});
