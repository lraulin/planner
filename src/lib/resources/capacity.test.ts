import { describe, expect, it } from "vitest";
import { weeklyAvailableMinutes, weeklyWorkingMinutes } from "./capacity";

const STANDARD_WEEK = {
  mondayMinutes: 8 * 60,
  tuesdayMinutes: 8 * 60,
  wednesdayMinutes: 8 * 60,
  thursdayMinutes: 8 * 60,
  fridayMinutes: 8 * 60,
  saturdayMinutes: 0,
  sundayMinutes: 0,
};

describe("resource capacity", () => {
  it("sums every day before applying adjustments", () => {
    expect(weeklyWorkingMinutes({ ...STANDARD_WEEK, saturdayMinutes: 3 * 60 })).toBe(
      43 * 60,
    );
  });

  it("deducts overhead before scaling remaining time by effectiveness", () => {
    expect(
      weeklyAvailableMinutes({
        ...STANDARD_WEEK,
        overheadPercent: 10,
        effectivenessPercent: 80,
      }),
    ).toBe(1728);
  });

  it("rounds only the final average-person minute", () => {
    expect(
      weeklyAvailableMinutes({
        mondayMinutes: 1,
        tuesdayMinutes: 0,
        wednesdayMinutes: 0,
        thursdayMinutes: 0,
        fridayMinutes: 0,
        saturdayMinutes: 0,
        sundayMinutes: 0,
        overheadPercent: 25,
        effectivenessPercent: 110,
      }),
    ).toBe(1);
  });

  it("does not yield negative capacity from malformed values", () => {
    expect(
      weeklyAvailableMinutes({
        ...STANDARD_WEEK,
        mondayMinutes: -100,
        overheadPercent: 150,
        effectivenessPercent: -1,
      }),
    ).toBe(0);
  });
});
