import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { importFinanceCsvFiles } from "@/lib/finances/import";
import { listTransactions } from "@/lib/finances/queries";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { importAmazonSlim } from "./import";
import { deleteAmazonItem } from "./mutations";
import { getAmazonItem, listAmazonItems } from "./queries";
import { SLIM_SOURCE, SLIM_VERSION, type SlimAmazonOrders } from "./types";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("amazon import");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `amazon-import-${crypto.randomUUID()}@localhost`,
      name: "Amazon Import Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

function slimDoc(overrides?: Partial<SlimAmazonOrders>): string {
  const document: SlimAmazonOrders = {
    version: SLIM_VERSION,
    source: SLIM_SOURCE,
    generatedAt: "2026-08-14T18:00:00.000Z",
    orders: [
      {
        amazonOrderId: "114-aaa",
        channel: "retail",
        orderDate: "2026-03-30",
        orderStatus: "Authorized",
        paymentMethod: "Visa - 9910",
        paymentLast4: "9910",
        website: "Amazon.com",
        currency: "USD",
      },
    ],
    items: [
      {
        lineId: "114-aaa:B00TP:0",
        amazonOrderId: "114-aaa",
        channel: "retail",
        asin: "B00TP",
        productName: "Toilet paper",
        quantity: 1,
        unitPriceCents: 630,
        unitPriceTaxCents: 0,
        itemPaidCents: 630,
        itemTaxCents: 0,
        discountsCents: 0,
        shippingChargeCents: 0,
        shippingOption: "std-sns-us",
        shipmentStatus: "Shipped",
        subscribeAndSave: true,
        shipDate: "2026-03-31",
        orderDate: "2026-03-30",
        orderStatus: "Authorized",
        paymentMethod: "Visa - 9910",
        paymentLast4: "9910",
        website: "Amazon.com",
        currency: "USD",
      },
    ],
    refunds: [],
    returns: [],
    replacements: [],
    ...overrides,
  };
  return JSON.stringify(document);
}

describeDb("amazon import", () => {
  it("creates items, upserts status on re-import, and isolates users", async () => {
    const userA = await makeUser();
    const userB = await makeUser();

    const first = await importAmazonSlim({ userId: userA, text: slimDoc() });
    expect(first.itemsCreated).toBe(1);
    expect(first.ordersCreated).toBe(1);

    const rows = await listAmazonItems(userA);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      productName: "Toilet paper",
      subscribeAndSave: true,
      orderStatus: "Authorized",
      paymentLast4: "9910",
    });

    const closed = JSON.parse(slimDoc()) as SlimAmazonOrders;
    closed.orders[0].orderStatus = "Closed";
    closed.items[0].orderStatus = "Closed";
    const second = await importAmazonSlim({
      userId: userA,
      text: JSON.stringify(closed),
    });
    expect(second.itemsCreated).toBe(0);
    expect(second.ordersCreated).toBe(0);
    expect(second.ordersUpdated).toBe(1);
    expect(second.itemsUnchanged).toBe(1);

    const after = await listAmazonItems(userA);
    expect(after[0].orderStatus).toBe("Closed");

    expect(await listAmazonItems(userB)).toEqual([]);
    expect(await getAmazonItem(userB, rows[0].id)).toBeNull();
    expect(await deleteAmazonItem(userB, rows[0].id)).toBe(false);
    expect(await getAmazonItem(userA, rows[0].id)).not.toBeNull();
  });

  it("does not create or change finance_transactions", async () => {
    const userId = await makeUser();
    await importFinanceCsvFiles({
      userId,
      files: [
        {
          name: "Chase9910.csv",
          text: [
            "Transaction Date,Post Date,Description,Category,Type,Amount,Memo",
            "03/30/2026,03/31/2026,AMAZON MKTPL,Shopping,Sale,-6.30,",
          ].join("\n"),
        },
      ],
    });
    const before = await listTransactions(userId);
    expect(before).toHaveLength(1);
    const amount = before[0].amountCents;

    await importAmazonSlim({ userId, text: slimDoc() });

    const after = await listTransactions(userId);
    expect(after).toHaveLength(1);
    expect(after[0].amountCents).toBe(amount);
    expect(after[0].id).toBe(before[0].id);
  });
});
