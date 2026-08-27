import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { amazonOrderItems, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { importAmazonSlim } from "./import";
import {
  deleteAmazonCharge,
  deleteAmazonItem,
  deleteAmazonSubscription,
  updateAmazonChargeReview,
  updateAmazonSubscriptionReview,
} from "./mutations";
import {
  getAmazonCharge,
  getAmazonSubscription,
  listAmazonChargeOrders,
  listAmazonCharges,
  listAmazonItems,
  listAmazonReviewItems,
  listAmazonSubscriptions,
} from "./queries";
import { persistAmazonSnapshot } from "./reconcile";
import { SNAPSHOT_SOURCE, SNAPSHOT_VERSION, type AmazonSnapshot } from "./snapshot";
import { SLIM_SOURCE, SLIM_VERSION } from "./types";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("amazon snapshot evidence");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `amazon-sns-${crypto.randomUUID()}@localhost`,
      name: "Amazon SNS Test",
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

function snapshot(overrides?: Partial<AmazonSnapshot>): AmazonSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    source: SNAPSHOT_SOURCE,
    generatedAt: "2026-08-27T16:00:00.000Z",
    capturedOn: "2026-08-27",
    completeness: { subscriptions: true, payments: true, orders: true },
    subscriptions: [
      {
        subscriptionId: "sub-tp-1",
        asin: "B00TOILET1",
        productName: "Toilet paper",
        quantity: 2,
        cadence: { unit: "month", n: 2 },
        cadenceLabel: "Deliver every 2 months",
        nextDeliveryDate: "2026-09-03",
        status: "active",
      },
    ],
    payments: [
      {
        paymentId: "pay-111",
        date: "2026-08-01",
        amountCents: -2114,
        status: "completed",
        cardLast4: "3448",
        instrumentKind: "card",
        amazonOrderIds: ["114-1111111-1111111", "114-2222222-2222222"],
      },
    ],
    orders: [
      {
        amazonOrderId: "114-1111111-1111111",
        orderDate: "2026-07-31",
        orderStatus: "Shipped",
        subscribeAndSave: true,
      },
    ],
    items: [
      {
        lineId: "114-1111111-1111111:B00TOILET1:0",
        amazonOrderId: "114-1111111-1111111",
        asin: "B00TOILET1",
        productName: "Toilet paper",
        quantity: 2,
        itemPaidCents: 1899,
        itemTaxCents: 115,
        discountsCents: -200,
        shippingChargeCents: 0,
        subscribeAndSave: true,
        subscriptionId: "sub-tp-1",
      },
    ],
    ...overrides,
  };
}

describeDb("amazon snapshot evidence", () => {
  it("upserts subscriptions and charges idempotently and links several orders to one charge", async () => {
    const userId = await makeUser();
    const first = await persistAmazonSnapshot(userId, snapshot());
    expect(first.subscriptionsCreated).toBe(1);
    expect(first.chargesCreated).toBe(1);
    expect(first.chargeOrdersCreated).toBe(2);
    expect(first.itemsCreated).toBe(1);

    const second = await persistAmazonSnapshot(userId, snapshot());
    expect(second.subscriptionsCreated).toBe(0);
    expect(second.subscriptionsUnchanged).toBe(1);
    expect(second.chargesCreated).toBe(0);
    expect(second.chargesUnchanged).toBe(1);
    expect(second.chargeOrdersCreated).toBe(0);
    expect(second.itemsUnchanged).toBe(1);

    const charges = await listAmazonCharges(userId);
    expect(charges).toHaveLength(1);
    const links = await listAmazonChargeOrders(userId, charges[0].id);
    expect(links.map((row) => row.amazonOrderId).sort()).toEqual([
      "114-1111111-1111111",
      "114-2222222-2222222",
    ]);
  });

  it("enriches a privacy-import line instead of double-counting it", async () => {
    const userId = await makeUser();
    await importAmazonSlim({
      userId,
      text: JSON.stringify({
        version: SLIM_VERSION,
        source: SLIM_SOURCE,
        generatedAt: "2026-08-14T18:00:00.000Z",
        orders: [
          {
            amazonOrderId: "114-1111111-1111111",
            channel: "retail",
            orderDate: "2026-07-31",
            orderStatus: "Closed",
            paymentMethod: "Visa - 3448",
            paymentLast4: "3448",
            website: "Amazon.com",
            currency: "USD",
          },
        ],
        items: [
          {
            lineId: "114-1111111-1111111:B00TOILET1:0",
            amazonOrderId: "114-1111111-1111111",
            channel: "retail",
            asin: "B00TOILET1",
            productName: "Toilet paper 12-pack",
            quantity: 2,
            unitPriceCents: 999,
            unitPriceTaxCents: 0,
            itemPaidCents: 1899,
            itemTaxCents: 115,
            discountsCents: -200,
            shippingChargeCents: 0,
            shippingOption: "std-sns-us",
            shipmentStatus: "Shipped",
            subscribeAndSave: true,
            shipDate: "2026-08-01",
            orderDate: "2026-07-31",
            orderStatus: "Closed",
            paymentMethod: "Visa - 3448",
            paymentLast4: "3448",
            website: "Amazon.com",
            currency: "USD",
          },
        ],
        refunds: [],
        returns: [],
        replacements: [],
      }),
    });

    await persistAmazonSnapshot(
      userId,
      snapshot({
        items: [
          {
            lineId: "114-1111111-1111111:B00TOILET1:0",
            amazonOrderId: "114-1111111-1111111",
            asin: "B00TOILET1",
            productName: "",
            quantity: 2,
            itemPaidCents: null,
            itemTaxCents: null,
            discountsCents: null,
            shippingChargeCents: null,
            subscribeAndSave: true,
            subscriptionId: "sub-tp-1",
          },
        ],
      }),
    );

    const items = await listAmazonItems(userId);
    expect(items).toHaveLength(1);
    expect(items[0].productName).toBe("Toilet paper 12-pack");
    expect(items[0].unitPriceCents).toBe(999);
    expect(items[0].itemPaidCents).toBe(1899);
    const [stored] = await db
      .select({ shipDate: amazonOrderItems.shipDate })
      .from(amazonOrderItems)
      .where(eq(amazonOrderItems.userId, userId));
    expect(stored?.shipDate).toBe("2026-08-01");
  });

  it("adds a newly seen order on a later paste without dropping the first link", async () => {
    const userId = await makeUser();
    await persistAmazonSnapshot(userId, snapshot());
    await persistAmazonSnapshot(
      userId,
      snapshot({
        payments: [
          {
            paymentId: "pay-111",
            date: "2026-08-01",
            amountCents: -2114,
            status: "completed",
            cardLast4: "3448",
            instrumentKind: "card",
            amazonOrderIds: ["114-1111111-1111111", "114-3333333-3333333"],
          },
        ],
      }),
    );
    const [charge] = await listAmazonCharges(userId);
    const links = await listAmazonChargeOrders(userId, charge.id);
    expect(links.map((row) => row.amazonOrderId).sort()).toEqual([
      "114-1111111-1111111",
      "114-2222222-2222222",
      "114-3333333-3333333",
    ]);
  });

  it("refuses a second user every read, change and delete of the first user's evidence", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    await persistAmazonSnapshot(owner, snapshot());

    const [subscription] = await listAmazonSubscriptions(owner);
    const [charge] = await listAmazonCharges(owner);
    const [item] = await listAmazonItems(owner);
    expect(subscription).toBeTruthy();
    expect(charge).toBeTruthy();

    expect(await listAmazonSubscriptions(intruder)).toEqual([]);
    expect(await listAmazonCharges(intruder)).toEqual([]);
    expect(await listAmazonItems(intruder)).toEqual([]);
    expect(await getAmazonSubscription(intruder, subscription.id)).toBeNull();
    expect(await getAmazonCharge(intruder, charge.id)).toBeNull();

    expect(
      await updateAmazonSubscriptionReview(intruder, subscription.id, {
        needsReview: true,
        reviewReason: "stolen",
      }),
    ).toBe(false);
    expect(
      await updateAmazonChargeReview(intruder, charge.id, {
        needsReview: true,
        reviewReason: "stolen",
      }),
    ).toBe(false);
    expect(await deleteAmazonSubscription(intruder, subscription.id)).toBe(false);
    expect(await deleteAmazonCharge(intruder, charge.id)).toBe(false);
    expect(await deleteAmazonItem(intruder, item.id)).toBe(false);

    expect(await getAmazonSubscription(owner, subscription.id)).not.toBeNull();
    expect(await getAmazonCharge(owner, charge.id)).not.toBeNull();
    expect(await listAmazonItems(owner)).toHaveLength(1);
  });

  it("lists a review charge as its orders and items, never to a second user", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    await persistAmazonSnapshot(owner, snapshot());
    const [charge] = await listAmazonCharges(owner);
    await updateAmazonChargeReview(owner, charge.id, {
      needsReview: true,
      reviewReason: "date differs",
    });

    const listed = await listAmazonReviewItems(owner);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      kind: "charge",
      id: charge.id,
      title: "2 orders",
      reason: "date differs",
    });
    expect(listed[0].amazonOrderIds.slice().sort()).toEqual([
      "114-1111111-1111111",
      "114-2222222-2222222",
    ]);
    expect(listed[0].lines).toEqual([
      expect.objectContaining({
        amazonOrderId: "114-1111111-1111111",
        productName: "Toilet paper",
        itemPaidCents: 1899,
      }),
    ]);
    expect(await listAmazonReviewItems(intruder)).toEqual([]);

    const [item] = await listAmazonItems(owner);
    expect(item.matchLabel).toBe("Review");
    expect(item.chargeId).toBe(charge.id);
    expect((await listAmazonItems(intruder))[0]?.chargeId).toBeUndefined();
  });
});
