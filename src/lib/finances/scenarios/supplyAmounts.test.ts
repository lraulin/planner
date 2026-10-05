import { describe, expect, it } from "vitest";
import type { SupplyItemRow, SupplyOptionRow } from "../supplies/queries";
import { supplyAmounts } from "./supplyAmounts";

function option(over: Partial<SupplyOptionRow> = {}): SupplyOptionRow {
  return {
    id: "option",
    itemId: "item",
    brand: "",
    vendor: "",
    qtyPerItem: 30,
    costPerOrderCents: 3000,
    inUse: true,
    pricedOn: null,
    asin: "",
    notes: "",
    ...over,
  };
}

function item(over: Partial<SupplyItemRow> = {}): SupplyItemRow {
  return {
    id: "item",
    name: "Item",
    groupId: null,
    groupLabel: "",
    envelopeId: null,
    envelopeName: null,
    envelopeBudgetedCents: null,
    unitLabel: "",
    rateBasis: "units_per_day",
    unitsPerDayMilli: 1000,
    daysPerUnitTenths: null,
    notes: "",
    options: [option()],
    ...over,
  };
}

describe("supplyAmounts", () => {
  it("prices an item at its in-use offer and a group at the sum of its items", () => {
    // $1 a unit, one unit a day: $30.4375 a month, which rounds to 3044.
    const a = item({ id: "a", groupId: "pets", groupLabel: "Pets" });
    const b = item({
      id: "b",
      groupId: "pets",
      groupLabel: "Pets",
      options: [option({ id: "ob", itemId: "b" })],
    });
    const loose = item({ id: "c", options: [option({ id: "oc", itemId: "c" })] });
    const amounts = supplyAmounts([a, b, loose]);
    expect(amounts.itemMonthlyCents.get("a")).toBe(3044);
    expect(amounts.groupMonthlyCents.get("pets")).toBe(6088);
    expect(amounts.groupMonthlyCents.size).toBe(1);
  });

  it("prices an item with no offer in use at nothing", () => {
    const amounts = supplyAmounts([item({ options: [option({ inUse: false })] })]);
    expect(amounts.itemMonthlyCents.get("item")).toBe(0);
  });

  it("keeps a group's figure under its id, so a rename does not move it", () => {
    const before = supplyAmounts([item({ groupId: "g", groupLabel: "Pets" })]);
    const after = supplyAmounts([item({ groupId: "g", groupLabel: "Cats" })]);
    expect(after.groupMonthlyCents.get("g")).toBe(before.groupMonthlyCents.get("g"));
  });
});
