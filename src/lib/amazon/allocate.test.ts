import { describe, expect, it } from "vitest";
import { allocateCharge, splitChildrenFromAllocation, stampBillIds } from "./allocate";

describe("allocateCharge", () => {
  it("splits recognised subscription lines to their Bills and keeps an exact remainder", () => {
    const allocation = stampBillIds(
      allocateCharge({
        chargeCents: -2114,
        lines: [
          {
            lineId: "o1:B00TP:0",
            amazonOrderId: "o1",
            asin: "B00TOILET1",
            itemPaidCents: 1899,
            subscribeAndSave: true,
            subscriptionId: "sub-tp",
          },
          {
            lineId: "o1:B00SNACK:0",
            amazonOrderId: "o1",
            asin: "B00SNACK01",
            itemPaidCents: 215,
            subscribeAndSave: false,
            subscriptionId: null,
          },
        ],
        subscriptions: [
          {
            subscriptionId: "sub-tp",
            asin: "B00TOILET1",
            status: "active",
            billId: null,
          },
        ],
      }),
      new Map([["sub-tp", "bill-tp"]]),
    );

    const total = allocation.lines.reduce((sum, line) => sum + line.amountCents, 0);
    expect(total).toBe(-2114);
    expect(allocation.byBill.get("bill-tp")).toBe(allocation.lines[0].amountCents);
    expect(allocation.remainderCents).toBe(allocation.lines[1].amountCents);
    const children = splitChildrenFromAllocation(allocation, "shopping");
    expect(children.reduce((sum, child) => sum + child.amountCents, 0)).toBe(-2114);
    expect(children.map((child) => child.billId).sort()).toEqual([
      "bill-tp",
      "shopping",
    ]);
  });

  it("keeps a mixed order's subscription saving off the line that never earned it", () => {
    // $18.99 of Subscribe & Save + $2.15 of snacks, less a $1.17 subscription saving,
    // plus $1.17 of tax. Smearing the saving across both lines would charge the snack
    // less than it cost and file the difference against a Bill.
    const lines = [
      {
        lineId: "o1:B00TP:0",
        amazonOrderId: "o1",
        asin: "B00TOILET1",
        itemPaidCents: 1899,
        subscribeAndSave: true,
        subscriptionId: "sub-tp",
      },
      {
        lineId: "o1:B00SNACK:0",
        amazonOrderId: "o1",
        asin: "B00SNACK01",
        itemPaidCents: 215,
        subscribeAndSave: false,
        subscriptionId: null,
      },
    ];
    const subscriptions = [
      {
        subscriptionId: "sub-tp",
        asin: "B00TOILET1",
        status: "active",
        billId: "bill-tp",
      },
    ];
    const withSaving = allocateCharge({
      chargeCents: -2114,
      lines,
      subscriptions,
      orderSavings: [{ amazonOrderId: "o1", subscriptionSavingCents: -117 }],
    });
    const withoutSaving = allocateCharge({ chargeCents: -2114, lines, subscriptions });

    expect(withSaving.lines.reduce((sum, line) => sum + line.amountCents, 0)).toBe(
      -2114,
    );
    // The whole saving lands on the S&S line, so the snack keeps its full share of the
    // subtotal-plus-tax bucket.
    const snack = withSaving.lines[1].amountCents;
    const snackWithout = withoutSaving.lines[1].amountCents;
    expect(snack).toBeLessThan(snackWithout);
    expect(withSaving.lines[0].amountCents - withoutSaving.lines[0].amountCents).toBe(
      snackWithout - snack,
    );
    expect(withSaving.byBill.get("bill-tp")).toBe(withSaving.lines[0].amountCents);
  });

  it("allocates tax across every line, not only the subscription ones", () => {
    // Order 111-7959899-2189857: $23.49 subtotal, -$1.17 saving, $1.34 tax, $23.66 charged.
    const allocation = allocateCharge({
      chargeCents: -2366,
      lines: [
        {
          lineId: "c4:B00SNS0001:0",
          amazonOrderId: "c4",
          asin: "B00SNS0001",
          itemPaidCents: 1349,
          subscribeAndSave: true,
          subscriptionId: "sub-c4",
        },
        {
          lineId: "c4:B00PLAIN01:0",
          amazonOrderId: "c4",
          asin: "B00PLAIN01",
          itemPaidCents: 1000,
          subscribeAndSave: false,
          subscriptionId: null,
        },
      ],
      subscriptions: [
        { subscriptionId: "sub-c4", asin: "B00SNS0001", status: "active", billId: "b" },
      ],
      orderSavings: [{ amazonOrderId: "c4", subscriptionSavingCents: -117 }],
    });
    expect(allocation.lines.reduce((sum, line) => sum + line.amountCents, 0)).toBe(
      -2366,
    );
    // Subtotal + tax is -$24.83 spread 1349:1000; the plain line takes none of the saving.
    expect(allocation.lines[1].amountCents).toBe(-1057);
    expect(allocation.lines[0].amountCents).toBe(-1309);
  });

  it("falls back to a plain proportional split when every line is Subscribe & Save", () => {
    const allocation = allocateCharge({
      chargeCents: -2000,
      lines: [
        {
          lineId: "o2:A:0",
          amazonOrderId: "o2",
          asin: "B00AAAAAA1",
          itemPaidCents: 1000,
          subscribeAndSave: true,
          subscriptionId: null,
        },
        {
          lineId: "o2:B:0",
          amazonOrderId: "o2",
          asin: "B00BBBBBB1",
          itemPaidCents: 1000,
          subscribeAndSave: true,
          subscriptionId: null,
        },
      ],
      subscriptions: [],
      orderSavings: [{ amazonOrderId: "o2", subscriptionSavingCents: -200 }],
    });
    expect(allocation.lines.map((line) => line.amountCents)).toEqual([-1000, -1000]);
  });

  it("ignores a saving on an order this charge does not cover", () => {
    const allocation = allocateCharge({
      chargeCents: -1000,
      lines: [
        {
          lineId: "o1:A:0",
          amazonOrderId: "o1",
          asin: "B00AAAAAA1",
          itemPaidCents: 800,
          subscribeAndSave: true,
          subscriptionId: null,
        },
        {
          lineId: "o1:B:0",
          amazonOrderId: "o1",
          asin: "B00BBBBBB1",
          itemPaidCents: 200,
          subscribeAndSave: false,
          subscriptionId: null,
        },
      ],
      subscriptions: [],
      orderSavings: [{ amazonOrderId: "other", subscriptionSavingCents: -500 }],
    });
    expect(allocation.lines.map((line) => line.amountCents)).toEqual([-800, -200]);
  });

  it("maps a historical S&S line by ASIN only when exactly one subscription fits", () => {
    const unique = allocateCharge({
      chargeCents: -1000,
      lines: [
        {
          lineId: "o1:B00TP:0",
          amazonOrderId: "o1",
          asin: "B00TOILET1",
          itemPaidCents: 1000,
          subscribeAndSave: true,
          subscriptionId: null,
        },
      ],
      subscriptions: [
        {
          subscriptionId: "sub-tp",
          asin: "B00TOILET1",
          status: "active",
          billId: "bill-tp",
        },
      ],
    });
    expect(unique.lines[0].billId).toBe("bill-tp");

    const duplicate = allocateCharge({
      chargeCents: -1000,
      lines: unique.lines.map((line) => ({
        lineId: line.lineId,
        amazonOrderId: line.amazonOrderId,
        asin: line.asin,
        itemPaidCents: 1000,
        subscribeAndSave: true,
        subscriptionId: null,
      })),
      subscriptions: [
        {
          subscriptionId: "sub-tp",
          asin: "B00TOILET1",
          status: "active",
          billId: "bill-tp",
        },
        {
          subscriptionId: "sub-tp-old",
          asin: "B00TOILET1",
          status: "cancelled",
          billId: null,
        },
      ],
    });
    expect(duplicate.lines[0].billId).toBeNull();
    expect(duplicate.remainderCents).toBe(-1000);
  });
});
