import { describe, expect, it } from "vitest";
import { monthsBetween, monthsUntilDate } from "./monthSpan";

describe("monthsBetween", () => {
  it("counts calendar months, including across a year", () => {
    expect(monthsBetween("2026-08-01", "2026-08-01")).toBe(0);
    expect(monthsBetween("2026-08-01", "2026-09-01")).toBe(1);
    expect(monthsBetween("2026-08-01", "2027-04-01")).toBe(8);
    expect(monthsBetween("2026-01-01", "2025-12-01")).toBe(-1);
  });
});

describe("monthsUntilDate", () => {
  it("keys the date to its month, not to the day of month", () => {
    // Sinking a yearly bill due Apr 15 from August is 8 months, not 8 months
    // plus a leftover day. Using the day number instead of the month would
    // make April look farther away than May.
    expect(monthsUntilDate("2026-08-01", "2027-04-15")).toBe(8);
    expect(monthsUntilDate("2026-08-01", "2027-04-01")).toBe(8);
    expect(monthsUntilDate("2026-08-01", "2026-08-31")).toBe(0);
  });
});
