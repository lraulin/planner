import { describe, expect, it } from "vitest";
import {
  preservedOptionBrand,
  supplyMergeDecision,
  type SupplyMergeIdentity,
} from "./merge";

function identity(over: Partial<SupplyMergeIdentity> = {}): SupplyMergeIdentity {
  return {
    id: "target",
    name: "Canned Cat Food",
    groupLabel: "Pets",
    envelopeName: "Groceries",
    rateKey: "units_per_day:4000",
    rateLabel: "4 cans/day",
    optionCount: 1,
    hasInUse: true,
    ...over,
  };
}

describe("supplyMergeDecision", () => {
  it("keeps the target's in-use and names discarded rates, groups, and envelopes", () => {
    const target = identity();
    const source = identity({
      id: "source",
      name: "Fancy Feast 24ct",
      groupLabel: "Groceries",
      envelopeName: "Pets",
      rateKey: "units_per_day:2000",
      rateLabel: "2 cans/day",
      hasInUse: true,
    });
    const decision = supplyMergeDecision(target, [source], ["source-in-use"]);
    expect(decision.promoteOptionId).toBeNull();
    expect(decision.discardedRates).toEqual(["Fancy Feast 24ct: 2 cans/day"]);
    expect(decision.discardedGroups).toEqual(["Groceries"]);
    expect(decision.discardedEnvelopes).toEqual(["Pets"]);
  });

  it("promotes the first source's in-use offer when the target has none", () => {
    const target = identity({ hasInUse: false, optionCount: 0 });
    const decision = supplyMergeDecision(
      target,
      [identity({ id: "a", hasInUse: true }), identity({ id: "b", hasInUse: true })],
      ["a-in-use", "b-in-use"],
    );
    expect(decision.promoteOptionId).toBe("a-in-use");
  });

  it("does not list a source whose rate, group, and envelope already match", () => {
    const target = identity();
    const decision = supplyMergeDecision(target, [identity({ id: "same" })], []);
    expect(decision.discardedRates).toEqual([]);
    expect(decision.discardedGroups).toEqual([]);
    expect(decision.discardedEnvelopes).toEqual([]);
  });
});

describe("preservedOptionBrand", () => {
  it("keeps a brand that is already set", () => {
    expect(preservedOptionBrand("Fancy Feast Grilled", "Canned Cat Food")).toBe(
      "Fancy Feast Grilled",
    );
  });

  it("takes the item name when Amazon left brand empty", () => {
    expect(preservedOptionBrand("", "C4 Performance Energy Drink 12ct")).toBe(
      "C4 Performance Energy Drink 12ct",
    );
    expect(preservedOptionBrand("   ", "C4 24ct")).toBe("C4 24ct");
  });
});
