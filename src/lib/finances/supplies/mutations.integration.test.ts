import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  amazonOrderItems,
  amazonOrders,
  financeBudgetAllocations,
  financeBudgetCategories,
  financeSupplyItems,
  financeSupplyOptions,
  users,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { monthKeyOf } from "@/lib/finances/budget/envelope";
import { localDateKey } from "@/lib/schedule/geometry";
import {
  addSupplyItemFromAmazon,
  addSupplyOptionFromAmazon,
  createSupplyItem,
  createSupplyItemFromSuggestion,
  createSupplyOption,
  deleteSupplyItem,
  deleteSupplyOption,
  mergeSupplyItems,
  previewSupplyMerge,
  setSupplyOptionInUse,
  updateSupplyItem,
  updateSupplyOption,
} from "./mutations";
import { listSupplyItems } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("supply mutations");

async function makeUser(label: string): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({
      email: `supplies-${label}-${crypto.randomUUID()}@example.com`,
      name: label,
    })
    .returning({ id: users.id });
  return row.id;
}

const CAT_FOOD = {
  name: "Canned Cat Food",
  rate: { rateBasis: "units_per_day", unitsPerDayMilli: 4000 },
} as const;

async function buy(
  userId: string,
  input: { asin: string; productName: string; orderDate: string; unitPrice?: string },
): Promise<void> {
  const amazonOrderId = `order-${crypto.randomUUID()}`;
  const [order] = await db
    .insert(amazonOrders)
    .values({
      userId,
      amazonOrderId,
      channel: "retail",
      orderDate: input.orderDate,
      orderStatus: "Shipped",
      externalSource: "test",
      externalId: amazonOrderId,
    })
    .returning({ id: amazonOrders.id });
  await db.insert(amazonOrderItems).values({
    userId,
    orderId: order.id,
    amazonOrderId,
    channel: "retail",
    asin: input.asin,
    productName: input.productName,
    quantity: 1,
    unitPrice: input.unitPrice ?? "23.66",
    subscribeAndSave: false,
    externalSource: "test",
    externalId: `${amazonOrderId}-item`,
  });
}

describeDb("supply worksheet", () => {
  let owner = "";
  let intruder = "";

  beforeEach(async () => {
    owner = await makeUser("owner");
    intruder = await makeUser("intruder");
  });

  afterEach(async () => {
    if (owner) await db.delete(users).where(eq(users.id, owner));
    if (intruder) await db.delete(users).where(eq(users.id, intruder));
  });

  it("prices an item from its in-use option and leaves comparisons inert", async () => {
    const itemId = await createSupplyItem(owner, { ...CAT_FOOD, groupLabel: "Pets" });
    await createSupplyOption(owner, {
      itemId,
      brand: "Fancy Feast",
      vendor: "Walmart",
      qtyPerItem: 42,
      costPerOrderCents: 3897,
      inUse: true,
    });
    await createSupplyOption(owner, {
      itemId,
      brand: "Fancy Feast",
      vendor: "Chewy",
      qtyPerItem: 24,
      costPerOrderCents: 2399,
    });

    const [item] = await listSupplyItems(owner);
    expect(item.groupLabel).toBe("Pets");
    expect(item.options).toHaveLength(2);
    // In-use first, so the row driving the totals leads its own comparison list.
    expect(item.options[0].vendor).toBe("Walmart");
    expect(item.options.filter((option) => option.inUse)).toHaveLength(1);
  });

  it("refuses a second in-use option on one item", async () => {
    const itemId = await createSupplyItem(owner, CAT_FOOD);
    await createSupplyOption(owner, { itemId, vendor: "Walmart", inUse: true });
    // Straight at the table: the mutation clears the sibling, so only a raw insert proves
    // the index is what stops two rows driving one total.
    await expect(
      db.insert(financeSupplyOptions).values({
        userId: owner,
        itemId,
        vendor: "Chewy",
        inUse: true,
      }),
    ).rejects.toThrow();
  });

  it("moves in-use between options without ever holding two", async () => {
    const itemId = await createSupplyItem(owner, CAT_FOOD);
    const walmart = await createSupplyOption(owner, {
      itemId,
      vendor: "Walmart",
      qtyPerItem: 42,
      costPerOrderCents: 3897,
      inUse: true,
    });
    const chewy = await createSupplyOption(owner, {
      itemId,
      vendor: "Chewy",
      qtyPerItem: 24,
      costPerOrderCents: 2399,
    });

    await setSupplyOptionInUse(owner, chewy);
    const [item] = await listSupplyItems(owner);
    expect(item.options.find((option) => option.id === chewy)?.inUse).toBe(true);
    expect(item.options.find((option) => option.id === walmart)?.inUse).toBe(false);

    // Idempotent: re-flagging the one already in use must not clear it.
    await setSupplyOptionInUse(owner, chewy);
    const [again] = await listSupplyItems(owner);
    expect(again.options.filter((option) => option.inUse)).toHaveLength(1);
  });

  it("refuses a rate whose basis and populated column disagree", async () => {
    const itemId = await createSupplyItem(owner, CAT_FOOD);
    // The check constraint, not the mutation: a units_per_day row may not also carry a
    // days_per_unit figure, whatever writes it.
    await expect(
      db
        .update(financeSupplyItems)
        .set({ daysPerUnitTenths: 450 })
        .where(eq(financeSupplyItems.id, itemId)),
    ).rejects.toThrow();

    await expect(
      db.insert(financeSupplyItems).values({
        userId: owner,
        name: "Broken",
        rateBasis: "days_per_unit",
        unitsPerDayMilli: 4000,
        daysPerUnitTenths: 450,
      }),
    ).rejects.toThrow();
  });

  it("switches an item between rate bases, clearing the other column", async () => {
    const itemId = await createSupplyItem(owner, { ...CAT_FOOD, name: "Toothpaste" });
    await updateSupplyItem(owner, itemId, {
      rate: { rateBasis: "days_per_unit", daysPerUnitTenths: 450 },
    });
    const [item] = await listSupplyItems(owner);
    expect(item.rateBasis).toBe("days_per_unit");
    expect(item.daysPerUnitTenths).toBe(450);
    expect(item.unitsPerDayMilli).toBeNull();
  });

  it("shows what the linked envelope is assigned this month", async () => {
    const [envelope] = await db
      .insert(financeBudgetCategories)
      .values({ userId: owner, name: "Groceries", sortKey: "a" })
      .returning({ id: financeBudgetCategories.id });
    const month = monthKeyOf(localDateKey(new Date()));
    await db.insert(financeBudgetAllocations).values({
      userId: owner,
      month,
      categoryId: envelope.id,
      amountCents: 60_000,
    });

    await createSupplyItem(owner, { ...CAT_FOOD, envelopeId: envelope.id });
    const [item] = await listSupplyItems(owner);
    expect(item.envelopeName).toBe("Groceries");
    expect(item.envelopeBudgetedCents).toBe(60_000);
  });

  it("reports zero, not null, for an envelope with no allocation this month", async () => {
    const [envelope] = await db
      .insert(financeBudgetCategories)
      .values({ userId: owner, name: "Pets", sortKey: "a" })
      .returning({ id: financeBudgetCategories.id });
    await createSupplyItem(owner, { ...CAT_FOOD, envelopeId: envelope.id });
    const [item] = await listSupplyItems(owner);
    expect(item.envelopeBudgetedCents).toBe(0);
  });

  it("deletes an item's options with it", async () => {
    const itemId = await createSupplyItem(owner, CAT_FOOD);
    await createSupplyOption(owner, { itemId, vendor: "Walmart", inUse: true });
    await deleteSupplyItem(owner, itemId);
    expect(await listSupplyItems(owner)).toEqual([]);
    const left = await db
      .select()
      .from(financeSupplyOptions)
      .where(eq(financeSupplyOptions.userId, owner));
    expect(left).toEqual([]);
  });

  it("creates an item and its in-use option from one suggestion", async () => {
    await createSupplyItemFromSuggestion(owner, {
      name: "Energy Drink",
      rate: { rateBasis: "units_per_day", unitsPerDayMilli: 2000 },
      groupLabel: "Groceries",
      option: {
        brand: "C4 Energy Drink",
        vendor: "Amazon",
        qtyPerItem: 12,
        costPerOrderCents: 2366,
        asin: "B07C4ENERGY",
      },
    });
    const [item] = await listSupplyItems(owner);
    expect(item.name).toBe("Energy Drink");
    expect(item.options).toHaveLength(1);
    expect(item.options[0].inUse).toBe(true);
    expect(item.options[0].asin).toBe("B07C4ENERGY");
  });

  describe("merge", () => {
    it("reparents options onto the survivor, keeps one in-use, and deletes sources", async () => {
      const twelve = await createSupplyItemFromSuggestion(owner, {
        name: "C4 12ct",
        rate: { rateBasis: "units_per_day", unitsPerDayMilli: 2000 },
        option: {
          vendor: "Amazon",
          qtyPerItem: 12,
          costPerOrderCents: 2366,
          asin: "B07TWELVE",
        },
      });
      const twentyFour = await createSupplyItemFromSuggestion(owner, {
        name: "C4 24ct",
        rate: { rateBasis: "units_per_day", unitsPerDayMilli: 1500 },
        groupLabel: "Drinks",
        option: {
          vendor: "Amazon",
          qtyPerItem: 24,
          costPerOrderCents: 4199,
          asin: "B07TWENTY4",
        },
      });

      const preview = await previewSupplyMerge(owner, twelve, [twentyFour]);
      expect(preview.movedOptions).toBe(1);
      expect(preview.discardedRates).toHaveLength(1);
      expect(preview.discardedGroups).toEqual(["Drinks"]);
      expect(preview.willPromoteInUse).toBe(false);

      const result = await mergeSupplyItems(owner, twelve, [twentyFour]);
      expect(result.movedOptions).toBe(1);

      const items = await listSupplyItems(owner);
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe(twelve);
      expect(items[0].name).toBe("C4 12ct");
      expect(items[0].unitsPerDayMilli).toBe(2000);
      expect(items[0].groupLabel).toBe("");
      expect(items[0].options).toHaveLength(2);
      expect(items[0].options.map((option) => option.asin).sort()).toEqual([
        "B07TWELVE",
        "B07TWENTY4",
      ]);
      expect(items[0].options.filter((option) => option.inUse)).toHaveLength(1);
      expect(
        items[0].options.find((option) => option.asin === "B07TWELVE")?.inUse,
      ).toBe(true);
    });

    it("promotes a source in-use offer when the target has none", async () => {
      const empty = await createSupplyItem(owner, { ...CAT_FOOD, name: "Unpriced" });
      const priced = await createSupplyItemFromSuggestion(owner, {
        name: "Priced",
        rate: { rateBasis: "units_per_day", unitsPerDayMilli: 2000 },
        option: { vendor: "Amazon", asin: "B07PRICED", inUse: true },
      });

      const preview = await previewSupplyMerge(owner, empty, [priced]);
      expect(preview.willPromoteInUse).toBe(true);

      await mergeSupplyItems(owner, empty, [priced]);
      const [item] = await listSupplyItems(owner);
      expect(item.id).toBe(empty);
      expect(item.options).toHaveLength(1);
      expect(item.options[0].inUse).toBe(true);
      expect(item.options[0].asin).toBe("B07PRICED");
    });

    it("does not write when the same item is the only source", async () => {
      const itemId = await createSupplyItem(owner, CAT_FOOD);
      await expect(previewSupplyMerge(owner, itemId, [itemId])).rejects.toThrow(
        "Select two different items to merge.",
      );
      expect(await mergeSupplyItems(owner, itemId, [itemId])).toEqual({
        movedOptions: 0,
      });
      expect(await mergeSupplyItems(owner, itemId, [])).toEqual({ movedOptions: 0 });
      expect(await listSupplyItems(owner)).toHaveLength(1);
    });
  });

  describe("amazon attach", () => {
    it("puts the offer on the chosen item without rewriting its rate", async () => {
      await buy(owner, {
        asin: "B07ATTACH",
        productName: "C4 Energy Drink, 24-Count",
        orderDate: "2026-01-01",
      });
      await buy(owner, {
        asin: "B07ATTACH",
        productName: "C4 Energy Drink, 24-Count",
        orderDate: "2026-03-01",
      });
      const itemId = await createSupplyItem(owner, {
        name: "Energy Drink",
        rate: { rateBasis: "units_per_day", unitsPerDayMilli: 2000 },
        groupLabel: "Groceries",
      });

      await addSupplyOptionFromAmazon(owner, itemId, "B07ATTACH");
      const [item] = await listSupplyItems(owner);
      expect(item.name).toBe("Energy Drink");
      expect(item.unitsPerDayMilli).toBe(2000);
      expect(item.groupLabel).toBe("Groceries");
      expect(item.options).toHaveLength(1);
      expect(item.options[0].asin).toBe("B07ATTACH");
      expect(item.options[0].vendor).toBe("Amazon");
      expect(item.options[0].inUse).toBe(true);
      expect(item.options[0].brand).toBe("C4 Energy Drink, 24-Count");
    });

    it("refuses a duplicate ASIN even on another item", async () => {
      await buy(owner, {
        asin: "B07DUP",
        productName: "C4 Energy Drink, 12-Count",
        orderDate: "2026-01-01",
      });
      await addSupplyItemFromAmazon(owner, "B07DUP");
      const other = await createSupplyItem(owner, CAT_FOOD);
      await expect(addSupplyOptionFromAmazon(owner, other, "B07DUP")).rejects.toThrow(
        "already on the Supplies worksheet",
      );
    });

    it("lands a later offer as a comparison when the item already has one in use", async () => {
      await buy(owner, {
        asin: "B07SECOND",
        productName: "C4 Energy Drink, 24-Count",
        orderDate: "2026-01-01",
      });
      await buy(owner, {
        asin: "B07SECOND",
        productName: "C4 Energy Drink, 24-Count",
        orderDate: "2026-03-01",
      });
      const itemId = await createSupplyItemFromSuggestion(owner, {
        name: "Energy Drink",
        rate: { rateBasis: "units_per_day", unitsPerDayMilli: 2000 },
        option: { vendor: "Amazon", asin: "B07FIRST", inUse: true },
      });
      await addSupplyOptionFromAmazon(owner, itemId, "B07SECOND");
      const [item] = await listSupplyItems(owner);
      expect(item.options).toHaveLength(2);
      expect(item.options.find((option) => option.asin === "B07FIRST")?.inUse).toBe(
        true,
      );
      expect(item.options.find((option) => option.asin === "B07SECOND")?.inUse).toBe(
        false,
      );
    });
  });

  describe("user isolation", () => {
    let itemId = "";
    let optionId = "";

    beforeEach(async () => {
      itemId = await createSupplyItem(owner, { ...CAT_FOOD, groupLabel: "Pets" });
      optionId = await createSupplyOption(owner, {
        itemId,
        vendor: "Walmart",
        qtyPerItem: 42,
        costPerOrderCents: 3897,
        inUse: true,
      });
    });

    it("does not let a second user read another user's worksheet", async () => {
      expect(await listSupplyItems(intruder)).toEqual([]);
    });

    it("does not let a second user change another user's item", async () => {
      await expect(
        updateSupplyItem(intruder, itemId, { name: "Stolen" }),
      ).rejects.toThrow("That supply item does not exist.");
      expect((await listSupplyItems(owner))[0].name).toBe("Canned Cat Food");
    });

    it("does not let a second user delete another user's item", async () => {
      await expect(deleteSupplyItem(intruder, itemId)).rejects.toThrow(
        "That supply item does not exist.",
      );
      expect(await listSupplyItems(owner)).toHaveLength(1);
    });

    it("does not let a second user change another user's option", async () => {
      await expect(
        updateSupplyOption(intruder, optionId, { costPerOrderCents: 1 }),
      ).rejects.toThrow("That supply option does not exist.");
      expect((await listSupplyItems(owner))[0].options[0].costPerOrderCents).toBe(3897);
    });

    it("does not let a second user delete another user's option", async () => {
      await expect(deleteSupplyOption(intruder, optionId)).rejects.toThrow(
        "That supply option does not exist.",
      );
      expect((await listSupplyItems(owner))[0].options).toHaveLength(1);
    });

    it("does not let a second user flip in-use on another user's option", async () => {
      const second = await createSupplyOption(owner, { itemId, vendor: "Chewy" });
      await expect(setSupplyOptionInUse(intruder, second)).rejects.toThrow(
        "That supply option does not exist.",
      );
      const options = (await listSupplyItems(owner))[0].options;
      expect(options.find((option) => option.id === second)?.inUse).toBe(false);
    });

    it("does not let a second user attach an option to another user's item", async () => {
      await expect(
        createSupplyOption(intruder, { itemId, vendor: "Stolen" }),
      ).rejects.toThrow("That supply item does not exist.");
      expect((await listSupplyItems(owner))[0].options).toHaveLength(1);
    });

    it("does not let a second user preview or merge another user's items", async () => {
      const other = await createSupplyItem(owner, { ...CAT_FOOD, name: "Second" });
      await expect(previewSupplyMerge(intruder, itemId, [other])).rejects.toThrow(
        "That supply item does not exist.",
      );
      await expect(mergeSupplyItems(intruder, itemId, [other])).rejects.toThrow(
        "That supply item does not exist.",
      );
      expect(await listSupplyItems(owner)).toHaveLength(2);
    });

    it("does not let a second user attach an Amazon offer to another user's item", async () => {
      await buy(intruder, {
        asin: "B07INTRUDE",
        productName: "Stolen drink, 12-Count",
        orderDate: "2026-01-01",
      });
      await expect(
        addSupplyOptionFromAmazon(intruder, itemId, "B07INTRUDE"),
      ).rejects.toThrow("That supply item does not exist.");
      expect((await listSupplyItems(owner))[0].options).toHaveLength(1);
    });

    it("does not let a second user point an item at another user's envelope", async () => {
      const [envelope] = await db
        .insert(financeBudgetCategories)
        .values({ userId: owner, name: "Groceries", sortKey: "a" })
        .returning({ id: financeBudgetCategories.id });
      await expect(
        createSupplyItem(intruder, { ...CAT_FOOD, envelopeId: envelope.id }),
      ).rejects.toThrow("That envelope does not exist.");
    });
  });
});
