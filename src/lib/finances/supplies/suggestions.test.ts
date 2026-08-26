import { describe, expect, it } from "vitest";
import type { AmazonRepeatPurchase } from "./queries";
import { supplySuggestions } from "./suggestions";

function purchase(over: Partial<AmazonRepeatPurchase> = {}): AmazonRepeatPurchase {
  return {
    asin: "B00CATFOOD",
    productName: "Purina Fancy Feast Grilled Wet Cat Food, 24 ct",
    orderCount: 5,
    totalQuantity: 5,
    firstOrderDate: "2026-01-01",
    lastOrderDate: "2026-07-01",
    latestUnitPriceCents: 2299,
    subscribeAndSave: false,
    ...over,
  };
}

describe("supplySuggestions", () => {
  it("infers a units-per-day rate from pack size, quantity and span", () => {
    // 5 orders × 24 cans over 181 days = 0.663 cans/day.
    const [row] = supplySuggestions([purchase()]);
    expect(row.spanDays).toBe(181);
    expect(row.packCount).toBe(24);
    expect(row.qtyPerItem).toBe(24);
    expect(row.rateBasis).toBe("units_per_day");
    expect(row.unitsPerDayMilli).toBe(Math.round(((5 * 24) / 181) * 1000));
    expect(row.daysPerUnitTenths).toBeNull();
    expect(row.costPerOrderCents).toBe(2299);
  });

  it("falls back to days-per-unit when the title never states a pack size", () => {
    // Nothing countable in "1 L", so the only honest statement is how long one lasted.
    const [row] = supplySuggestions([
      purchase({
        productName: "Listerine Cool Mint Antiseptic Mouthwash, 1 L",
        totalQuantity: 4,
      }),
    ]);
    expect(row.packCount).toBeNull();
    expect(row.qtyPerItem).toBe(1);
    expect(row.rateBasis).toBe("days_per_unit");
    expect(row.daysPerUnitTenths).toBe(Math.round((181 / 4) * 10));
    expect(row.unitsPerDayMilli).toBeNull();
  });

  it("skips a purchase whose orders all fall on one day", () => {
    // Three of the same thing in one basket says nothing about how fast it is used.
    expect(
      supplySuggestions([
        purchase({ firstOrderDate: "2026-03-04", lastOrderDate: "2026-03-04" }),
      ]),
    ).toEqual([]);
  });

  it("skips an ASIN already on the worksheet", () => {
    expect(
      supplySuggestions([purchase()], { knownAsins: new Set(["B00CATFOOD"]) }),
    ).toEqual([]);
  });

  it("never infers a rate of zero", () => {
    // One unit over eight years rounds to 0.0003/day; a stored zero would violate the
    // rate_set check and price the item at nothing.
    const [row] = supplySuggestions([
      purchase({
        totalQuantity: 1,
        firstOrderDate: "2018-01-01",
        lastOrderDate: "2026-01-01",
        productName: "Some Widget (Pack of 1)",
      }),
    ]);
    expect(row.unitsPerDayMilli).toBe(1);
  });

  it("carries the evidence the user needs to correct the guess", () => {
    const [row] = supplySuggestions([purchase({ subscribeAndSave: true })]);
    expect(row.orderCount).toBe(5);
    expect(row.firstOrderDate).toBe("2026-01-01");
    expect(row.lastOrderDate).toBe("2026-07-01");
    expect(row.subscribeAndSave).toBe(true);
  });
});
