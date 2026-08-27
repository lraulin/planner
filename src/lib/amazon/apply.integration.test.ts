import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financeBudgetCategories, users } from "@/db/schema";
import { importFinanceCsvFiles } from "@/lib/finances/import";
import { listSplitChildren, listTransactions } from "@/lib/finances/queries";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { applyAmazonSnapshotText } from "./apply";
import { listAmazonItems, listAmazonSubscriptions } from "./queries";
import { parseAmazonOrderSummary } from "./orderSummary";
import { serializeAmazonSnapshot, SNAPSHOT_SOURCE, SNAPSHOT_VERSION } from "./snapshot";
import { AMAZON_SNS_GROUP } from "./preview";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("amazon snapshot apply");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `amazon-apply-${crypto.randomUUID()}@localhost`,
      name: "Amazon Apply Test",
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

function snapshotText() {
  return serializeAmazonSnapshot({
    version: SNAPSHOT_VERSION,
    source: SNAPSHOT_SOURCE,
    generatedAt: "2026-08-27T16:00:00.000Z",
    capturedOn: "2026-08-27",
    completeness: { subscriptions: true, payments: true, orders: true },
    subscriptions: [
      {
        subscriptionId: "sub-tp",
        asin: "B00TOILET1",
        productName: "Toilet paper",
        quantity: 2,
        cadence: { unit: "month", n: 2 },
        cadenceLabel: "Deliver every 2 months",
        nextDeliveryDate: "2026-09-03",
        status: "active",
      },
      {
        subscriptionId: "sub-litter",
        asin: "B00LITTER1",
        productName: "Cat litter",
        quantity: 1,
        cadence: { unit: "month", n: 1 },
        cadenceLabel: "Deliver every month",
        nextDeliveryDate: "",
        status: "cancelled",
      },
    ],
    payments: [
      {
        paymentId: "pay-mix",
        date: "2026-08-01",
        amountCents: -2114,
        status: "completed",
        cardLast4: "3448",
        instrumentKind: "card",
        amazonOrderIds: ["114-mix"],
      },
    ],
    orders: [
      {
        amazonOrderId: "114-mix",
        orderDate: "2026-07-31",
        orderStatus: "Shipped",
        subscribeAndSave: true,
        summary: parseAmazonOrderSummary([
          { label: "Item(s) Subtotal:", amount: "$21.14" },
          { label: "Grand Total:", amount: "$21.14" },
        ]),
      },
    ],
    items: [
      {
        lineId: "114-mix:B00TOILET1:0",
        amazonOrderId: "114-mix",
        asin: "B00TOILET1",
        productName: "Toilet paper",
        quantity: 2,
        itemPaidCents: 1800,
        itemTaxCents: 0,
        discountsCents: 0,
        shippingChargeCents: 0,
        subscribeAndSave: true,
        subscriptionId: "sub-tp",
      },
      {
        lineId: "114-mix:B00SNACK01:0",
        amazonOrderId: "114-mix",
        asin: "B00SNACK01",
        productName: "Snacks",
        quantity: 1,
        itemPaidCents: 314,
        itemTaxCents: 0,
        discountsCents: 0,
        shippingChargeCents: 0,
        subscribeAndSave: false,
        subscriptionId: null,
      },
    ],
  });
}

describeDb("amazon snapshot apply", () => {
  it("creates an S&S bill, skips cancelled, and splits a mixed exact match", async () => {
    const userId = await makeUser();
    await importFinanceCsvFiles({
      userId,
      files: [
        {
          name: "Chase3448.csv",
          text: [
            "Transaction Date,Post Date,Description,Category,Type,Amount,Memo",
            "08/01/2026,08/02/2026,AMAZON MKTPL*ABC,Shopping,Sale,-21.14,",
          ].join("\n"),
        },
      ],
    });
    const before = await listTransactions(userId);
    expect(before).toHaveLength(1);
    const shopping = before[0].budgetCategoryId;

    const first = await applyAmazonSnapshotText(userId, snapshotText());
    expect(first.billsCreated).toBe(1);
    expect(first.matchesApplied).toBe(1);

    const subscriptions = await listAmazonSubscriptions(userId);
    const tp = subscriptions.find((row) => row.amazonSubscriptionId === "sub-tp");
    const litter = subscriptions.find(
      (row) => row.amazonSubscriptionId === "sub-litter",
    );
    expect(tp?.billId).toBeTruthy();
    expect(litter?.billId).toBeNull();

    const bills = await db
      .select()
      .from(financeBudgetCategories)
      .where(eq(financeBudgetCategories.userId, userId));
    expect(bills.map((row) => row.name)).toContain("Toilet paper");
    expect(bills.map((row) => row.name)).not.toContain("Cat litter");
    expect(bills.some((row) => row.name === AMAZON_SNS_GROUP)).toBe(false);

    const [parent] = await listTransactions(userId);
    expect(parent.splitChildCount).toBe(2);
    const children = await listSplitChildren(userId, parent.id);
    const sum = children.reduce((total, child) => total + child.amountCents, 0);
    expect(sum).toBe(-2114);
    expect(children.some((child) => child.budgetCategoryId === tp?.billId)).toBe(true);
    if (shopping) {
      expect(children.some((child) => child.budgetCategoryId === shopping)).toBe(true);
    }

    // The order reaches the register through its charge's match, not through anything
    // stored on the order.
    for (const row of await listAmazonItems(userId)) {
      expect(row.registerLabel).toBe("2026-08-01");
      expect(row.registerTransactionId).toBe(parent.id);
      expect(row.orderGrandTotalCents).toBe(2114);
    }

    const second = await applyAmazonSnapshotText(userId, snapshotText());
    expect(second.billsCreated).toBe(0);
    expect(second.matchesApplied).toBe(0);
    expect((await listTransactions(userId))[0].splitChildCount).toBe(2);
  });

  it("does not let a second user apply against the first user's register", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    await importFinanceCsvFiles({
      userId: owner,
      files: [
        {
          name: "Chase3448.csv",
          text: [
            "Transaction Date,Post Date,Description,Category,Type,Amount,Memo",
            "08/01/2026,08/02/2026,AMAZON MKTPL*ABC,Shopping,Sale,-21.14,",
          ].join("\n"),
        },
      ],
    });
    await applyAmazonSnapshotText(owner, snapshotText());
    const result = await applyAmazonSnapshotText(intruder, snapshotText());
    expect(result.matchesApplied).toBe(0);
    expect(await listTransactions(intruder)).toEqual([]);
    expect((await listAmazonSubscriptions(intruder)).length).toBeGreaterThan(0);
    expect((await listAmazonSubscriptions(owner)).length).toBeGreaterThan(0);
    const ownerBills = await db
      .select()
      .from(financeBudgetCategories)
      .where(eq(financeBudgetCategories.userId, owner));
    const intruderBills = await db
      .select()
      .from(financeBudgetCategories)
      .where(eq(financeBudgetCategories.userId, intruder));
    expect(ownerBills.some((row) => row.name === "Toilet paper")).toBe(true);
    expect(intruderBills.some((row) => row.name === "Toilet paper")).toBe(true);
    expect(ownerBills[0].id).not.toBe(
      intruderBills.find((row) => row.name === "Toilet paper")?.id,
    );
  });
});
