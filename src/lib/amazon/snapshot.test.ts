import { describe, expect, it } from "vitest";
import { amazonCalendarDay } from "./csv";
import {
  amazonSnapshotOrderCheck,
  cadenceFromLabel,
  looksLikePlannerAmazon,
  parseAmazonSnapshot,
  PLANNER_AMAZON_HEADER,
  serializeAmazonSnapshot,
  SNAPSHOT_OUT_OF_DATE,
  SNAPSHOT_SOURCE,
  SNAPSHOT_VERSION,
  type AmazonSnapshot,
} from "./snapshot";

function snapshotText(overrides?: Record<string, unknown>): string {
  const body = {
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
        nextDeliveryDate: "September 3, 2026",
        status: "active",
      },
    ],
    payments: [
      {
        sourceOrderId: "114-1111111-1111111",
        date: "2026-08-01",
        amount: "$21.14",
        status: "completed",
        cardLast4: "3448",
        instrumentKind: "card",
        amazonOrderIds: ["114-1111111-1111111", "114-2222222-2222222"],
      },
    ],
    orders: [
      {
        amazonOrderId: "114-1111111-1111111",
        orderDate: "2026-07-31T21:04:32Z",
        orderStatus: "Shipped",
        subscribeAndSave: true,
        total: "$21.14",
        summaryLines: [
          { label: "Item(s) Subtotal:", amount: "$18.99" },
          { label: "Shipping & Handling:", amount: "$0.00" },
          { label: "Subscription saving:", amount: "-$2.00" },
          { label: "Total before tax:", amount: "$16.99" },
          { label: "Estimated tax to be collected:", amount: "$4.15" },
          { label: "Grand Total:", amount: "$21.14" },
        ],
      },
    ],
    items: [
      {
        amazonOrderId: "114-1111111-1111111",
        asin: "B00TOILET1",
        productName: "Toilet paper",
        quantity: 2,
        itemPaid: "18.99",
        itemTax: "1.15",
        discounts: "-2.00",
        shippingCharge: "0",
        subscribeAndSave: true,
        subscriptionId: "sub-tp-1",
      },
    ],
    ...overrides,
  };
  return `${PLANNER_AMAZON_HEADER}\n${JSON.stringify(body)}\n`;
}

describe("amazonCalendarDay", () => {
  it("keeps a written YYYY-MM-DD without parsing it as an instant", () => {
    expect(amazonCalendarDay("2026-08-01")).toBe("2026-08-01");
  });

  it("rejects a date that does not exist", () => {
    expect(amazonCalendarDay("2026-02-30")).toBe("");
    expect(amazonCalendarDay("February 30, 2026")).toBe("");
  });

  it("reads Amazon display dates and ISO instants as UTC calendar days", () => {
    expect(amazonCalendarDay("August 27, 2026")).toBe("2026-08-27");
    expect(amazonCalendarDay("Thu, Aug 27, 2026")).toBe("2026-08-27");
    expect(amazonCalendarDay("8/27/2026")).toBe("2026-08-27");
    expect(amazonCalendarDay("2018-12-27T11:10:19Z")).toBe("2018-12-27");
  });
});

describe("parseAmazonSnapshot", () => {
  it("accepts the tagged header and sanitises the allowlisted fields", () => {
    expect(looksLikePlannerAmazon(`\n${PLANNER_AMAZON_HEADER}`)).toBe(true);
    const parsed = parseAmazonSnapshot(
      snapshotText({
        email: "lee@example.com",
        address: "123 Nowhere St",
        subscriptions: [
          {
            subscriptionId: "sub-tp-1",
            asin: "B00TOILET1",
            productName: "Toilet paper",
            quantity: 1,
            cadenceLabel: "Deliver every 2 months",
            nextDeliveryDate: "2026-09-03",
            status: "active",
            shippingAddress: "123 Nowhere St",
          },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.snapshot.subscriptions[0]).toMatchObject({
      subscriptionId: "sub-tp-1",
      asin: "B00TOILET1",
      cadence: { unit: "month", n: 2 },
      nextDeliveryDate: "2026-09-03",
    });
    expect(JSON.stringify(parsed.snapshot)).not.toMatch(/Nowhere|lee@example/);
    expect(parsed.snapshot.payments[0].amountCents).toBe(-2114);
    expect(parsed.snapshot.payments[0].amazonOrderIds).toEqual([
      "114-1111111-1111111",
      "114-2222222-2222222",
    ]);
    expect(parsed.snapshot.items[0].lineId).toBe("114-1111111-1111111:B00TOILET1:0");
    expect(parsed.snapshot.orders[0].orderDate).toBe("2026-07-31");
  });

  it("pins malformed dates, money and identifiers as issues without inventing values", () => {
    const parsed = parseAmazonSnapshot(
      snapshotText({
        capturedOn: "February 30, 2026",
        subscriptions: [
          {
            subscriptionId: "sub with spaces",
            asin: "not-an-asin",
            productName: "Litter",
            nextDeliveryDate: "not a date",
          },
          {
            subscriptionId: "sub-ok",
            asin: "B00LITTER1",
            productName: "Litter",
            nextDeliveryDate: "2026-13-40",
          },
        ],
        payments: [
          {
            date: "2026-02-30",
            amount: "twelve dollars",
            status: "completed",
            cardLast4: "12",
            instrumentKind: "card",
            amazonOrderIds: ["not an order", "114-3333333-3333333"],
          },
          {
            date: "2026-08-01",
            amount: "$1.00",
            status: "completed",
            instrumentKind: "card",
          },
        ],
        items: [
          {
            amazonOrderId: "114-3333333-3333333",
            asin: "short",
            productName: "X",
            itemPaid: "n/a",
          },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.snapshot.capturedOn).toBe("");
    expect(parsed.snapshot.subscriptions).toHaveLength(1);
    expect(parsed.snapshot.subscriptions[0].subscriptionId).toBe("sub-ok");
    expect(parsed.snapshot.subscriptions[0].nextDeliveryDate).toBe("");
    // A charge with no readable amount and one that names no order cannot be identified,
    // and an identity guessed from page text is what v1 got wrong. Both are dropped.
    expect(parsed.snapshot.payments).toHaveLength(0);
    expect(parsed.snapshot.items[0].asin).toBe("");
    expect(parsed.snapshot.items[0].itemPaidCents).toBeNull();
    expect(
      parsed.issues.some((issue) => issue.message.includes("Malformed date")),
    ).toBe(true);
    expect(
      parsed.issues.some((issue) => issue.message.includes("Malformed amount")),
    ).toBe(true);
    expect(
      parsed.issues.some((issue) => issue.message.includes("Malformed ASIN")),
    ).toBe(true);
  });

  it("numbers duplicate line items instead of collapsing them", () => {
    const parsed = parseAmazonSnapshot(
      snapshotText({
        items: [
          {
            amazonOrderId: "114-1111111-1111111",
            asin: "B00TOILET1",
            productName: "Toilet paper A",
            itemPaid: "10.00",
            subscribeAndSave: true,
          },
          {
            amazonOrderId: "114-1111111-1111111",
            asin: "B00TOILET1",
            productName: "Toilet paper B",
            itemPaid: "11.00",
            subscribeAndSave: true,
          },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.snapshot.items.map((item) => item.lineId)).toEqual([
      "114-1111111-1111111:B00TOILET1:0",
      "114-1111111-1111111:B00TOILET1:1",
    ]);
    expect(parsed.snapshot.items.map((item) => item.itemPaidCents)).toEqual([
      1000, 1100,
    ]);
  });

  it("treats omitted completeness as incomplete so a partial page cannot imply cancellation", () => {
    const parsed = parseAmazonSnapshot(
      snapshotText({
        completeness: undefined,
        subscriptions: [],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.snapshot.completeness).toEqual({
      subscriptions: false,
      payments: false,
      orders: false,
    });
    expect(parsed.issues.some((issue) => issue.path === "completeness")).toBe(true);
  });

  it("does not flip an already-signed charge or a rewards component into a bank amount", () => {
    const parsed = parseAmazonSnapshot(
      snapshotText({
        payments: [
          {
            sourceOrderId: "114-1111111-1111111",
            date: "2026-08-01",
            amountCents: -2114,
            status: "completed",
            cardLast4: "3448",
            instrumentKind: "card",
            amazonOrderIds: ["114-1111111-1111111"],
          },
          {
            sourceOrderId: "114-1111111-1111111",
            date: "2026-08-01",
            amount: "$5.00",
            status: "completed",
            instrumentKind: "rewards",
            amazonOrderIds: ["114-1111111-1111111"],
          },
          {
            sourceOrderId: "114-1111111-1111111",
            date: "2026-08-02",
            amount: "$4.00",
            status: "refunded",
            instrumentKind: "card",
            amazonOrderIds: ["114-1111111-1111111"],
          },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.snapshot.payments.map((row) => row.amountCents)).toEqual([
      -2114, 500, 400,
    ]);
  });

  it("round-trips through serialize without picking up dropped PII keys", () => {
    const parsed = parseAmazonSnapshot(snapshotText());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const again = parseAmazonSnapshot(serializeAmazonSnapshot(parsed.snapshot));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.snapshot).toEqual(parsed.snapshot);
  });

  it("refuses a missing header", () => {
    const parsed = parseAmazonSnapshot('{"version":2}');
    expect(parsed.ok).toBe(false);
  });

  it("refuses a v1 snapshot with an actionable message rather than importing it", () => {
    const v1 = `# planner-amazon v1\n${JSON.stringify({
      version: 1,
      source: SNAPSHOT_SOURCE,
      orders: [],
      items: [],
      payments: [],
      subscriptions: [],
    })}\n`;
    const parsed = parseAmazonSnapshot(v1);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toBe(SNAPSHOT_OUT_OF_DATE);
    expect(parsed.error).toMatch(/capture again/i);
  });

  it("refuses a v1 body wearing the v2 header", () => {
    const parsed = parseAmazonSnapshot(
      `${PLANNER_AMAZON_HEADER}\n${JSON.stringify({
        version: 1,
        source: SNAPSHOT_SOURCE,
      })}\n`,
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toBe(SNAPSHOT_OUT_OF_DATE);
  });
});

describe("v2 order summaries", () => {
  it("stores Amazon's printed breakdown on the order", () => {
    const parsed = parseAmazonSnapshot(snapshotText());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const summary = parsed.snapshot.orders[0].summary;
    expect(summary).not.toBeNull();
    expect(summary?.itemsSubtotalCents).toBe(1899);
    expect(summary?.promotionCents).toBe(-200);
    expect(summary?.taxCents).toBe(415);
    expect(summary?.grandTotalCents).toBe(2114);
    expect(amazonSnapshotOrderCheck(parsed.snapshot.orders[0])?.status).toBe(
      "reconciled",
    );
  });

  it("keeps a history-only total as incomplete rather than calling it reconciled", () => {
    const parsed = parseAmazonSnapshot(
      snapshotText({
        orders: [
          {
            amazonOrderId: "114-1111111-1111111",
            orderDate: "2026-07-31",
            total: "$21.14",
          },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.snapshot.orders[0].summary?.grandTotalCents).toBe(2114);
    expect(amazonSnapshotOrderCheck(parsed.snapshot.orders[0])?.status).toBe(
      "incomplete",
    );
  });

  it("raises an issue when order history and the order page disagree on the total", () => {
    const parsed = parseAmazonSnapshot(
      snapshotText({
        orders: [
          {
            amazonOrderId: "114-1111111-1111111",
            orderDate: "2026-07-31",
            total: "$99.00",
            summaryLines: [
              { label: "Item(s) Subtotal:", amount: "$21.14" },
              { label: "Grand Total:", amount: "$21.14" },
            ],
          },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.snapshot.orders[0].summary?.grandTotalCents).toBe(2114);
    expect(parsed.issues.some((issue) => issue.path.endsWith(".total"))).toBe(true);
  });

  it("leaves an order with no printed money without a summary", () => {
    const parsed = parseAmazonSnapshot(
      snapshotText({
        orders: [{ amazonOrderId: "114-1111111-1111111", orderDate: "2026-07-31" }],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.snapshot.orders[0].summary).toBeNull();
    expect(amazonSnapshotOrderCheck(parsed.snapshot.orders[0])).toBeNull();
  });
});

describe("v2 charge identity", () => {
  const charge = {
    date: "2026-08-01",
    amount: "$21.14",
    status: "completed",
    cardLast4: "3448",
    instrumentKind: "card",
    amazonOrderIds: ["114-1111111-1111111", "114-2222222-2222222"],
  };

  it("mints an id from the payment rather than the page wording", () => {
    const parsed = parseAmazonSnapshot(
      snapshotText({
        payments: [{ ...charge, sourceOrderId: "114-1111111-1111111" }],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.snapshot.payments[0].paymentId).toBe(
      "114-1111111-1111111|2026-08-01|3448|-2114|0",
    );
  });

  it("collapses one charge fetched from each order it covers", () => {
    const parsed = parseAmazonSnapshot(
      snapshotText({
        payments: [
          { ...charge, sourceOrderId: "114-1111111-1111111" },
          { ...charge, sourceOrderId: "114-2222222-2222222" },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.snapshot.payments).toHaveLength(1);
    expect(parsed.snapshot.payments[0].amazonOrderIds).toEqual([
      "114-1111111-1111111",
      "114-2222222-2222222",
    ]);
  });

  it("keeps two identical charges one order's own page listed twice", () => {
    // Amazon warns that an order may have several charges; two shipments of equal value on
    // the same day are two payments, not one row seen twice.
    const parsed = parseAmazonSnapshot(
      snapshotText({
        payments: [
          { ...charge, sourceOrderId: "114-1111111-1111111" },
          { ...charge, sourceOrderId: "114-1111111-1111111" },
          { ...charge, sourceOrderId: "114-2222222-2222222" },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.snapshot.payments.map((row) => row.paymentId)).toEqual([
      "114-1111111-1111111|2026-08-01|3448|-2114|0",
      "114-1111111-1111111|2026-08-01|3448|-2114|1",
    ]);
  });

  it("is stable when Amazon rewords the row it was scraped from", () => {
    const first = parseAmazonSnapshot(
      snapshotText({
        payments: [
          { ...charge, sourceOrderId: "114-1111111-1111111", note: "Payment complete" },
        ],
      }),
    );
    const second = parseAmazonSnapshot(
      snapshotText({
        payments: [
          { ...charge, sourceOrderId: "114-1111111-1111111", note: "Charge settled" },
        ],
      }),
    );
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.snapshot.payments[0].paymentId).toBe(
      second.snapshot.payments[0].paymentId,
    );
  });
});

describe("cadenceFromLabel", () => {
  it("reads month, week and day labels Amazon prints on cards", () => {
    expect(cadenceFromLabel("Deliver every 2 months")).toEqual({ unit: "month", n: 2 });
    expect(cadenceFromLabel("every 4 weeks")).toEqual({ unit: "day", n: 28 });
    expect(cadenceFromLabel("Deliver every month")).toEqual({ unit: "month", n: 1 });
  });
});

describe("sanitised fixture shape", () => {
  it("never includes a real account payload in the unit fixture", () => {
    const parsed = parseAmazonSnapshot(snapshotText());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const fixture: AmazonSnapshot = parsed.snapshot;
    expect(fixture.payments[0].cardLast4).toBe("3448");
    expect(JSON.stringify(fixture)).not.toMatch(/@|street|cookie/i);
  });
});
