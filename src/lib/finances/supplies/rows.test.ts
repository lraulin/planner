import { describe, expect, it } from "vitest";
import type { SupplyItemRow, SupplyOptionRow } from "./queries";
import {
  itemIdsOfSelection,
  supplyDeleteTargets,
  supplyGroups,
  supplyItemRows,
  supplyRowTotals,
} from "./rows";

function option(over: Partial<SupplyOptionRow> = {}): SupplyOptionRow {
  return {
    id: crypto.randomUUID(),
    itemId: "item",
    brand: "Fancy Feast",
    vendor: "Walmart",
    qtyPerItem: 42,
    costPerOrderCents: 3897,
    inUse: false,
    pricedOn: null,
    asin: "",
    notes: "",
    ...over,
  };
}

function item(over: Partial<SupplyItemRow> = {}): SupplyItemRow {
  return {
    id: "item",
    name: "Canned Cat Food",
    groupLabel: "Pets",
    envelopeId: null,
    envelopeName: null,
    envelopeBudgetedCents: null,
    unitLabel: "can",
    rateBasis: "units_per_day",
    unitsPerDayMilli: 4000,
    daysPerUnitTenths: null,
    notes: "",
    options: [],
    ...over,
  };
}

describe("itemIdsOfSelection", () => {
  it("reduces offer rows to their parent items and ignores a second offer on the same item", () => {
    const cat = item({
      id: "cat",
      options: [
        option({ id: "walmart", itemId: "cat" }),
        option({ id: "chewy", itemId: "cat" }),
      ],
    });
    const drink = item({
      id: "drink",
      options: [option({ id: "amazon", itemId: "drink" })],
    });
    expect(itemIdsOfSelection(new Set(["walmart", "chewy"]), [cat, drink])).toEqual([
      "cat",
    ]);
    expect(itemIdsOfSelection(new Set(["walmart", "amazon"]), [cat, drink])).toEqual([
      "cat",
      "drink",
    ]);
    expect(itemIdsOfSelection(new Set(["drink", "walmart"]), [cat, drink])).toEqual([
      "drink",
      "cat",
    ]);
  });
});

describe("supplyDeleteTargets", () => {
  const cat = item({
    id: "cat",
    options: [
      option({ id: "walmart", itemId: "cat" }),
      option({ id: "chewy", itemId: "cat" }),
    ],
  });
  const drink = item({
    id: "drink",
    name: "Energy",
    options: [option({ id: "amazon", itemId: "drink" })],
  });
  const items = [cat, drink];
  const order = ["cat", "walmart", "chewy", "drink", "amazon"];

  it("drops offers when their parent item is also selected", () => {
    expect(
      supplyDeleteTargets(new Set(["cat", "walmart", "chewy"]), items, order),
    ).toEqual({ itemIds: ["cat"], optionIds: [] });
  });

  it("keeps offers whose parent is not selected", () => {
    expect(supplyDeleteTargets(new Set(["walmart", "amazon"]), items, order)).toEqual({
      itemIds: [],
      optionIds: ["walmart", "amazon"],
    });
  });

  it("deletes two item heads without their offers listed", () => {
    expect(supplyDeleteTargets(new Set(["cat", "drink"]), items, order)).toEqual({
      itemIds: ["cat", "drink"],
      optionIds: [],
    });
  });
});

describe("supplyItemRows", () => {
  it("prices the item from the in-use offer only", () => {
    const inUse = option({ inUse: true });
    const rival = option({ vendor: "Chewy", qtyPerItem: 24, costPerOrderCents: 2399 });
    const [head, ...children] = supplyItemRows(item({ options: [inUse, rival] }));

    expect(head.kind).toBe("item");
    expect(head.kind === "item" && head.totals?.biweeklyCents).toBe(5196);
    expect(children).toHaveLength(2);
    // The comparison row prices itself, but nothing above it moves.
    const candidate = children[1];
    expect(candidate.kind === "option" && candidate.totals.biweeklyCents).toBe(
      Math.round((2399 / 24) * 4 * 14),
    );
    expect(
      candidate.kind === "option" && candidate.comparison?.deltaPerUnitCents,
    ).toBeGreaterThan(0);
  });

  it("leaves the in-use row with nothing to compare against", () => {
    const [, first] = supplyItemRows(item({ options: [option({ inUse: true })] }));
    expect(first.kind === "option" && first.comparison).toBeNull();
  });

  it("prices an item with no offer in use at nothing rather than guessing", () => {
    const [head] = supplyItemRows(item({ options: [option()] }));
    expect(head.kind === "item" && head.totals).toBeNull();
    expect(head.kind === "item" && head.inUse).toBeNull();
  });
});

describe("supplyGroups", () => {
  it("subtotals from the displayed row values and totals the groups", () => {
    const catFood = item({ options: [option({ inUse: true })] });
    const drink = item({
      id: "drink",
      name: "Energy Drink",
      groupLabel: "Groceries",
      unitsPerDayMilli: 2000,
      options: [
        option({
          itemId: "drink",
          qtyPerItem: 12,
          costPerOrderCents: 2366,
          inUse: true,
        }),
      ],
    });

    const groups = supplyGroups([catFood, drink]);
    expect(groups.map((group) => group.label)).toEqual(["Groceries", "Pets"]);
    expect(groups[1].totals.biweeklyCents).toBe(5196);
    expect(groups[0].totals.biweeklyCents).toBe(5521);
  });
  it("sorts the ungrouped bucket last", () => {
    const groups = supplyGroups([
      item({ id: "a", groupLabel: "" }),
      item({ id: "b", groupLabel: "Pets" }),
    ]);
    expect(groups.map((group) => group.label)).toEqual(["Pets", ""]);
  });

  it("names the envelope only when the whole group agrees on one", () => {
    const funded = item({
      envelopeId: "env",
      envelopeName: "Groceries",
      envelopeBudgetedCents: 60_000,
    });
    const [agreed] = supplyGroups([funded, { ...funded, id: "second" }]);
    expect(agreed.envelopeName).toBe("Groceries");
    expect(agreed.envelopeBudgetedCents).toBe(60_000);

    // Mixed funding is the case the page exists to surface; naming one of the two would
    // report it as settled.
    const [mixed] = supplyGroups([funded, item({ id: "third" })]);
    expect(mixed.envelopeName).toBeNull();
    expect(mixed.envelopeBudgetedCents).toBeNull();
  });
});

describe("supplyRowTotals", () => {
  it("sums the item rows and ignores the offers under them", () => {
    // Both offers price the same item; counting the alternative would bill the user
    // once per vendor they compared.
    const rows = supplyItemRows(
      item({ options: [option({ inUse: true }), option({ id: "other" })] }),
    );
    expect(rows.filter((row) => row.kind === "option")).toHaveLength(2);
    expect(supplyRowTotals(rows).biweeklyCents).toBe(5196);
  });

  it("adds up to the grand total across groups, and follows a narrowed row set", () => {
    const catFood = item({ options: [option({ inUse: true })] });
    const drink = item({
      id: "drink",
      name: "Energy Drink",
      groupLabel: "Groceries",
      unitsPerDayMilli: 2000,
      options: [
        option({
          itemId: "drink",
          qtyPerItem: 12,
          costPerOrderCents: 2366,
          inUse: true,
        }),
      ],
    });
    const all = [...supplyItemRows(catFood), ...supplyItemRows(drink)];
    expect(supplyRowTotals(all).biweeklyCents).toBe(5196 + 5521);
    // Filter the cat food away and the total has to drop with it.
    expect(supplyRowTotals(supplyItemRows(drink)).biweeklyCents).toBe(5521);
  });

  it("is zero for an item priced at nothing", () => {
    expect(supplyRowTotals(supplyItemRows(item({ options: [option()] })))).toEqual({
      biweeklyCents: 0,
      monthlyCents: 0,
      yearlyCents: 0,
    });
  });
});
