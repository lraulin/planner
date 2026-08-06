import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  addYears,
  daysBetween,
  daysInMonth,
  startOfDay,
} from "./dateMath";

/**
 * These are the **local wall-clock** helpers, so fixtures are built with local components
 * on purpose — the UTC-noon calendar encoding and `toDateKey` belong to `geometry.ts` and
 * are tested there. Nothing here asserts a UTC hour.
 *
 * The DST cases use US 2026 boundaries (spring forward Mar 8, fall back Nov 1). They pass
 * in a zone with no DST too, where they simply assert the ordinary case — the point is that
 * they fail loudly in a zone that does, which is where millisecond arithmetic goes wrong.
 */
describe("local wall-clock date math", () => {
  describe("addDays", () => {
    it("keeps the time of day across a spring-forward boundary", () => {
      const before = new Date(2026, 2, 7, 9, 30);
      const after = addDays(before, 1);
      expect([after.getFullYear(), after.getMonth(), after.getDate()]).toEqual([
        2026, 2, 8,
      ]);
      // 09:00 the day after a spring forward is still 09:00. Adding 86_400_000 ms would
      // land on 10:30 in a DST zone.
      expect([after.getHours(), after.getMinutes()]).toEqual([9, 30]);
    });

    it("keeps the time of day across a fall-back boundary", () => {
      const after = addDays(new Date(2026, 9, 31, 9, 30), 2);
      expect([after.getMonth(), after.getDate()]).toEqual([10, 2]);
      expect([after.getHours(), after.getMinutes()]).toEqual([9, 30]);
    });

    it("rolls over month and year boundaries, forwards and backwards", () => {
      const forward = addDays(new Date(2026, 11, 31), 1);
      expect([forward.getFullYear(), forward.getMonth(), forward.getDate()]).toEqual([
        2027, 0, 1,
      ]);
      const backward = addDays(new Date(2026, 0, 1), -1);
      expect([backward.getFullYear(), backward.getMonth(), backward.getDate()]).toEqual(
        [2025, 11, 31],
      );
    });
  });

  describe("addMonths", () => {
    // The whole reason the function is not a bare setMonth: Feb has no 31st, and setMonth
    // silently overflows into March rather than saying so.
    it("clamps to the end of a shorter month instead of overflowing", () => {
      const feb = addMonths(new Date(2026, 0, 31), 1);
      expect([feb.getMonth(), feb.getDate()]).toEqual([1, 28]);

      const april = addMonths(new Date(2026, 2, 31), 1);
      expect([april.getMonth(), april.getDate()]).toEqual([3, 30]);
    });

    it("clamps to Feb 29 in a leap year", () => {
      const feb = addMonths(new Date(2028, 0, 31), 1);
      expect([feb.getFullYear(), feb.getMonth(), feb.getDate()]).toEqual([2028, 1, 29]);
    });

    it("leaves a day that exists in the target month alone", () => {
      const d = addMonths(new Date(2026, 0, 15), 1);
      expect([d.getMonth(), d.getDate()]).toEqual([1, 15]);
    });

    it("clamps going backwards too, and crosses the year", () => {
      const feb = addMonths(new Date(2026, 2, 31), -1);
      expect([feb.getMonth(), feb.getDate()]).toEqual([1, 28]);

      const dec = addMonths(new Date(2026, 0, 31), -1);
      expect([dec.getFullYear(), dec.getMonth(), dec.getDate()]).toEqual([
        2025, 11, 31,
      ]);
    });

    it("keeps the time of day", () => {
      const d = addMonths(new Date(2026, 0, 31, 14, 45), 1);
      expect([d.getHours(), d.getMinutes()]).toEqual([14, 45]);
    });
  });

  describe("addYears", () => {
    it("moves a plain date by whole years", () => {
      const d = addYears(new Date(2026, 5, 15), 2);
      expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2028, 5, 15]);
    });

    it("lands Feb 29 on Feb 28 in a common year", () => {
      const d = addYears(new Date(2028, 1, 29), 1);
      expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2029, 1, 28]);
    });
  });

  describe("daysInMonth", () => {
    it("counts each month, with February following the leap rule", () => {
      expect(daysInMonth(2026, 1)).toBe(31);
      expect(daysInMonth(2026, 2)).toBe(28);
      expect(daysInMonth(2028, 2)).toBe(29);
      expect(daysInMonth(2026, 4)).toBe(30);
      expect(daysInMonth(2026, 12)).toBe(31);
    });

    // 2100 is divisible by 4 but not a leap year; a naive % 4 check gets this wrong.
    it("follows the century rule", () => {
      expect(daysInMonth(2100, 2)).toBe(28);
      expect(daysInMonth(2000, 2)).toBe(29);
    });
  });

  describe("daysBetween", () => {
    it("ignores the time of day", () => {
      expect(
        daysBetween(new Date(2026, 7, 1, 23, 59), new Date(2026, 7, 2, 0, 1)),
      ).toBe(1);
      expect(daysBetween(new Date(2026, 7, 1, 8), new Date(2026, 7, 1, 20))).toBe(0);
    });

    it("counts whole days across a DST boundary", () => {
      // The raw span here is 23 or 25 hours per day in a DST zone; without the rounding
      // this reads as 1 day (truncated) rather than 2.
      expect(daysBetween(new Date(2026, 2, 7), new Date(2026, 2, 9))).toBe(2);
      expect(daysBetween(new Date(2026, 9, 31), new Date(2026, 10, 2))).toBe(2);
    });

    it("is negative when the target is earlier", () => {
      expect(daysBetween(new Date(2026, 7, 10), new Date(2026, 7, 3))).toBe(-7);
    });
  });

  describe("startOfDay", () => {
    it("moves to local midnight without changing the calendar day", () => {
      const d = startOfDay(new Date(2026, 7, 1, 23, 59, 59, 999));
      expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 7, 1]);
      expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
    });

    it("does not mutate its argument", () => {
      const original = new Date(2026, 7, 1, 13, 30);
      startOfDay(original);
      expect(original.getHours()).toBe(13);
    });
  });
});
