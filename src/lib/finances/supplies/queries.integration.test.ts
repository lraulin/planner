import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { amazonOrderItems, amazonOrders, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { listAmazonRepeatPurchases } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("supply suggestion queries");

async function makeUser(label: string): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({
      email: `supply-q-${label}-${crypto.randomUUID()}@example.com`,
      name: label,
    })
    .returning({ id: users.id });
  return row.id;
}

async function buy(
  userId: string,
  input: {
    asin: string;
    productName?: string;
    orderDate: string;
    quantity?: number;
    unitPrice?: string;
    orderStatus?: string;
    subscribeAndSave?: boolean;
    channel?: string;
  },
): Promise<void> {
  const amazonOrderId = `order-${crypto.randomUUID()}`;
  const [order] = await db
    .insert(amazonOrders)
    .values({
      userId,
      amazonOrderId,
      channel: input.channel ?? "retail",
      orderDate: input.orderDate,
      orderStatus: input.orderStatus ?? "Shipped",
      externalSource: "test",
      externalId: amazonOrderId,
    })
    .returning({ id: amazonOrders.id });
  await db.insert(amazonOrderItems).values({
    userId,
    orderId: order.id,
    amazonOrderId,
    channel: input.channel ?? "retail",
    asin: input.asin,
    productName: input.productName ?? "Purina Fancy Feast, 24 ct",
    quantity: input.quantity ?? 1,
    unitPrice: input.unitPrice ?? "23.99",
    subscribeAndSave: input.subscribeAndSave ?? false,
    externalSource: "test",
    externalId: `${amazonOrderId}-item`,
  });
}

describeDb("listAmazonRepeatPurchases", () => {
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

  it("aggregates repeat buys and reports the latest name and price", async () => {
    await buy(owner, { asin: "B01", orderDate: "2026-01-05", unitPrice: "21.99" });
    await buy(owner, { asin: "B01", orderDate: "2026-03-05", quantity: 2 });
    await buy(owner, {
      asin: "B01",
      orderDate: "2026-06-05",
      productName: "Purina Fancy Feast, 30 ct",
      unitPrice: "26.49",
    });

    const [row] = await listAmazonRepeatPurchases(owner);
    expect(row.asin).toBe("B01");
    expect(row.orderCount).toBe(3);
    expect(row.totalQuantity).toBe(4);
    expect(row.firstOrderDate).toBe("2026-01-05");
    expect(row.lastOrderDate).toBe("2026-06-05");
    expect(row.productName).toBe("Purina Fancy Feast, 30 ct");
    expect(row.latestUnitPriceCents).toBe(2649);
  });

  it("keeps a Subscribe & Save item below the repeat threshold", async () => {
    await buy(owner, { asin: "B02", orderDate: "2026-02-01", subscribeAndSave: true });
    await buy(owner, { asin: "B03", orderDate: "2026-02-01" });

    const asins = (await listAmazonRepeatPurchases(owner)).map((row) => row.asin);
    expect(asins).toEqual(["B02"]);
  });

  it("excludes cancelled orders, digital items and blank ASINs", async () => {
    for (const orderDate of ["2026-01-01", "2026-02-01", "2026-03-01"]) {
      await buy(owner, { asin: "B04", orderDate, orderStatus: "Cancelled" });
      await buy(owner, { asin: "B05", orderDate, channel: "digital" });
      await buy(owner, { asin: "", orderDate });
    }
    expect(await listAmazonRepeatPurchases(owner)).toEqual([]);
  });

  it("does not aggregate another user's purchase history", async () => {
    for (const orderDate of ["2026-01-01", "2026-02-01", "2026-03-01"]) {
      await buy(owner, { asin: "B06", orderDate });
    }
    expect(await listAmazonRepeatPurchases(intruder)).toEqual([]);
    expect(await listAmazonRepeatPurchases(owner)).toHaveLength(1);
  });
});
