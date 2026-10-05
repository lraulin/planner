import { describe, expect, it } from "vitest";
import { leafMonthlyCents, lineSourceOf, type SupplyAmounts } from "./amount";
import { splitLine } from "./split";

const NO_SUPPLY: SupplyAmounts = {
  itemMonthlyCents: new Map(),
  groupMonthlyCents: new Map(),
};

describe("splitLine", () => {
  it("moves a manual amount, cadence included, onto the child and clears the parent", () => {
    const plan = splitLine({
      type: "manual",
      amountCents: 25000,
      cadence: { unit: "month", n: 1 },
    });
    const child = lineSourceOf(plan.child);
    expect(child).toEqual({
      type: "manual",
      amountCents: 25000,
      cadence: { unit: "month", n: 1 },
    });
    expect(lineSourceOf(plan.parent)).toEqual({ type: "none" });
    // The total the parent contributed is exactly what the child now contributes.
    expect(leafMonthlyCents(child, NO_SUPPLY)).toBe(25000);
  });

  it("moves a supply source too", () => {
    const plan = splitLine({ type: "supplyGroup", supplyGroupId: "pets" });
    expect(lineSourceOf(plan.child)).toEqual({
      type: "supplyGroup",
      supplyGroupId: "pets",
    });
    expect(plan.parent.supplyGroupId).toBeNull();
  });
});
