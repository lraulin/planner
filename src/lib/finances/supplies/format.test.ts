import { describe, expect, it } from "vitest";
import {
  formatDeltaPercent,
  formatDerivedRate,
  formatRate,
  formatUnitCost,
} from "./format";
import type { SupplyRate } from "./cost";

const CANS: SupplyRate = { basis: "units_per_day", unitsPerDayMilli: 4000 };
const TUBE: SupplyRate = { basis: "days_per_unit", daysPerUnitTenths: 450 };

describe("formatUnitCost", () => {
  it("keeps the four decimals that tell two vendors apart", () => {
    expect(formatUnitCost(3897 / 42)).toBe("$0.9279");
    expect(formatUnitCost(2399 / 24)).toBe("$0.9996");
  });

  it("puts the sign outside the symbol", () => {
    expect(formatUnitCost(-9.48)).toBe("-$0.0948");
  });
});

describe("formatRate", () => {
  it("states the rate from the end it was typed from", () => {
    expect(formatRate(CANS, "can")).toBe("4 cans/day");
    expect(formatRate(TUBE, "tube")).toBe("1 tube lasts 45 days");
  });

  it("falls back to a generic unit and singularises one per day", () => {
    expect(formatRate({ basis: "units_per_day", unitsPerDayMilli: 1000 }, "")).toBe(
      "1 unit/day",
    );
  });

  it("shows the derived other end", () => {
    expect(formatDerivedRate(CANS, "can")).toBe("≈ 0.25 days per can");
    expect(formatDerivedRate(TUBE, "tube")).toBe("≈ 0.022 tube/day");
  });
});

describe("formatDeltaPercent", () => {
  it("signs the delta and blanks a zero", () => {
    expect(formatDeltaPercent(7.72)).toBe("+7.7%");
    expect(formatDeltaPercent(-10.21)).toBe("−10.2%");
    expect(formatDeltaPercent(0)).toBe("—");
  });
});
