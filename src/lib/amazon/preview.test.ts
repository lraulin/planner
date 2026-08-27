import { describe, expect, it } from "vitest";
import { previewAmazonSnapshot, uniqueBillName } from "./preview";
import { SNAPSHOT_SOURCE, SNAPSHOT_VERSION, type AmazonSnapshot } from "./snapshot";

function snapshot(overrides?: Partial<AmazonSnapshot>): AmazonSnapshot {
  return {
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
        paymentId: "pay-1",
        date: "2026-08-01",
        amountCents: -2114,
        status: "completed",
        cardLast4: "3448",
        instrumentKind: "card",
        amazonOrderIds: ["114-1"],
      },
    ],
    orders: [
      {
        amazonOrderId: "114-1",
        orderDate: "2026-07-31",
        orderStatus: "Shipped",
        subscribeAndSave: true,
      },
    ],
    items: [
      {
        lineId: "114-1:B00TOILET1:0",
        amazonOrderId: "114-1",
        asin: "B00TOILET1",
        productName: "Toilet paper",
        quantity: 2,
        itemPaidCents: 2114,
        itemTaxCents: 0,
        discountsCents: 0,
        shippingChargeCents: 0,
        subscribeAndSave: true,
        subscriptionId: "sub-tp",
      },
    ],
    ...overrides,
  };
}

describe("previewAmazonSnapshot", () => {
  it("creates a Bill for an active subscription and not for a cancelled one", () => {
    const preview = previewAmazonSnapshot({
      snapshot: snapshot(),
      issues: [],
      subscriptions: [],
      bills: [],
      accounts: [{ id: "acc", externalKey: "3448", closedAt: null }],
      transactions: [
        {
          id: "txn-1",
          accountId: "acc",
          transactionDate: "2026-08-01",
          amountCents: -2114,
          pending: false,
          isParent: false,
          description: "AMAZON MKTPL*ABC",
          budgetCategoryId: "shop",
        },
      ],
      matches: [],
      supplies: [],
    });
    expect(
      preview.bills
        .filter((row) => row.kind === "create")
        .map((row) => row.kind === "create" && row.subscriptionId),
    ).toEqual(["sub-tp"]);
    expect(preview.counts.matchesAuto).toBe(1);
    expect(preview.cancellationReviews).toEqual([]);
  });

  it("proposes cancellation only from a complete subscription snapshot", () => {
    const existing = {
      amazonSubscriptionId: "sub-gone",
      billId: "bill-gone",
      asin: "B00GONE000",
      productName: "Gone",
      quantity: 1,
      cadenceMonths: 1,
      cadenceDays: null,
      status: "active",
      nextDeliveryDate: "2026-09-01",
      needsReview: false,
    };
    const complete = previewAmazonSnapshot({
      snapshot: snapshot(),
      issues: [],
      subscriptions: [existing],
      bills: [],
      accounts: [],
      transactions: [],
      matches: [],
      supplies: [],
    });
    expect(complete.cancellationReviews.map((row) => row.subscriptionId)).toEqual([
      "sub-gone",
    ]);

    const incomplete = previewAmazonSnapshot({
      snapshot: snapshot({
        completeness: { subscriptions: false, payments: true, orders: true },
      }),
      issues: [],
      subscriptions: [existing],
      bills: [],
      accounts: [],
      transactions: [],
      matches: [],
      supplies: [],
    });
    expect(incomplete.cancellationReviews).toEqual([]);
  });

  it("does not auto-match a pending bank row and leaves an existing match settled", () => {
    const preview = previewAmazonSnapshot({
      snapshot: snapshot(),
      issues: [],
      subscriptions: [
        {
          amazonSubscriptionId: "sub-tp",
          billId: "bill-tp",
          asin: "B00TOILET1",
          productName: "Toilet paper",
          quantity: 2,
          cadenceMonths: 2,
          cadenceDays: null,
          status: "active",
          nextDeliveryDate: "2026-09-03",
          needsReview: false,
        },
      ],
      bills: [
        {
          id: "bill-tp",
          name: "Toilet paper",
          groupId: "g",
          expectedCents: 2114,
          cadenceMonths: 2,
          cadenceDays: null,
          status: "active",
        },
      ],
      accounts: [{ id: "acc", externalKey: "3448", closedAt: null }],
      transactions: [
        {
          id: "txn-pending",
          accountId: "acc",
          transactionDate: "2026-08-01",
          amountCents: -2114,
          pending: true,
          isParent: false,
          description: "AMAZON MKTPL",
          budgetCategoryId: null,
        },
      ],
      matches: [
        { paymentId: "pay-old", transactionId: "txn-old", splitProtected: false },
      ],
      supplies: [],
    });
    expect(preview.matches.find((row) => row.paymentId === "pay-1")?.kind).toBe(
      "review",
    );
  });
});

describe("uniqueBillName", () => {
  it("disambiguates duplicate product names with cadence then quantity", () => {
    const taken = new Set(["Toilet paper"]);
    expect(
      uniqueBillName(
        {
          productName: "Toilet paper",
          quantity: 2,
          cadenceLabel: "Deliver every 2 months",
        },
        taken,
      ),
    ).toBe("Toilet paper (Deliver every 2 months)");
  });
});
