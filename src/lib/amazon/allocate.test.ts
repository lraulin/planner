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
