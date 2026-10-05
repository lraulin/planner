import { describe, expect, it } from "vitest";
import {
  leafMonthlyCents,
  lineSourceOf,
  manualMonthlyCents,
  periodAmounts,
  sourceColumns,
  type SupplyAmounts,
} from "./amount";

const NO_SUPPLY: SupplyAmounts = {
  itemMonthlyCents: new Map(),
  groupMonthlyCents: new Map(),
};

describe("manualMonthlyCents", () => {
  it("reads 32.99 a week as $143.45 a month through annualCents, not × 4", () => {
    expect(manualMonthlyCents(3299, { unit: "day", n: 7 })).toBe(14345);
    expect(3299 * 4).toBe(13196);
  });

  it("handles a month cadence in either direction", () => {
    expect(manualMonthlyCents(242900, { unit: "month", n: 1 })).toBe(242900);
    expect(manualMonthlyCents(400000, { unit: "month", n: 12 })).toBe(33333);
    expect(manualMonthlyCents(12000, { unit: "month", n: 6 })).toBe(2000);
  });

  it("treats every 4 weeks as 28 days, not as a month", () => {
    // 13 charges a year, so a month is a little more than one charge (annualCents uses the Gregorian year).
    expect(manualMonthlyCents(10000, { unit: "day", n: 28 })).toBe(10870);
  });
});

describe("leafMonthlyCents", () => {
  it("follows a supply item and a supply group by id", () => {
    const supply: SupplyAmounts = {
      itemMonthlyCents: new Map([["item", 4200]]),
      groupMonthlyCents: new Map([["group", 9100]]),
    };
    expect(leafMonthlyCents({ type: "supplyItem", supplyItemId: "item" }, supply)).toBe(
      4200,
    );
    expect(
      leafMonthlyCents({ type: "supplyGroup", supplyGroupId: "group" }, supply),
    ).toBe(9100);
  });

  it("reads a source that no longer resolves, and a source-less line, as zero", () => {
    expect(
      leafMonthlyCents({ type: "supplyItem", supplyItemId: "gone" }, NO_SUPPLY),
    ).toBe(0);
    expect(leafMonthlyCents({ type: "none" }, NO_SUPPLY)).toBe(0);
  });
});

describe("source columns", () => {
  it("round-trips each source through the columns the table stores", () => {
    for (const source of [
      { type: "manual", amountCents: 500, cadence: { unit: "day", n: 7 } },
      { type: "supplyItem", supplyItemId: "i" },
      { type: "supplyGroup", supplyGroupId: "g" },
      { type: "none" },
    ] as const) {
      expect(lineSourceOf(sourceColumns(source))).toEqual(source);
    }
  });

  it("never populates two sources at once", () => {
    const columns = sourceColumns({ type: "supplyItem", supplyItemId: "i" });
    expect(columns).toMatchObject({
      amountCents: null,
      cadenceUnit: null,
      cadenceN: null,
      supplyGroupId: null,
    });
  });
});

describe("periodAmounts", () => {
  it("derives the pay period from the year, not from the month", () => {
    expect(periodAmounts(260000)).toEqual({
      monthlyCents: 260000,
      payPeriodCents: 120000,
      yearlyCents: 3120000,
    });
  });
});
