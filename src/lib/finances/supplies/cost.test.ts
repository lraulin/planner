import { describe, expect, it } from "vitest";
import {
  DAYS_PER_MONTH,
  costPerDayCents,
  costPerUnitCents,
  daysPerPack,
  daysPerUnit,
  offerComparison,
  packsPerMonth,
  supplyTotals,
  unitsPerDay,
  type SupplyRate,
} from "./cost";

/** Row 1 of the spreadsheet this replaces: Fancy Feast, Walmart, 42ct, $38.97, 4/day. */
const CAT_FOOD_RATE: SupplyRate = { basis: "units_per_day", unitsPerDayMilli: 4000 };
const CAT_FOOD_OFFER = { qtyPerItem: 42, costPerOrderCents: 3897 };

/** Row 2: C4, Amazon, 12ct, $23.66, 2/day. */
const ENERGY_RATE: SupplyRate = { basis: "units_per_day", unitsPerDayMilli: 2000 };
const ENERGY_OFFER = { qtyPerItem: 12, costPerOrderCents: 2366 };

describe("rate bases", () => {
  it("reads both ends of the same rate", () => {
    expect(unitsPerDay(CAT_FOOD_RATE)).toBe(4);
    expect(daysPerUnit(CAT_FOOD_RATE)).toBe(0.25);

    const toothpaste: SupplyRate = { basis: "days_per_unit", daysPerUnitTenths: 450 };
    expect(daysPerUnit(toothpaste)).toBe(45);
    expect(unitsPerDay(toothpaste)).toBeCloseTo(1 / 45, 10);
  });

  it("does not divide by a zero rate", () => {
    expect(unitsPerDay({ basis: "days_per_unit", daysPerUnitTenths: 0 })).toBe(0);
    expect(daysPerUnit({ basis: "units_per_day", unitsPerDayMilli: 0 })).toBe(0);
  });
});

describe("cost per unit", () => {
  it("stays fractional rather than rounding to whole cents", () => {
    // $0.9279, not $0.93 — rounding here is what stops a column summing to the receipt.
    expect(costPerUnitCents(CAT_FOOD_OFFER)).toBeCloseTo(92.7857, 4);
    expect(costPerUnitCents(CAT_FOOD_OFFER)).not.toBe(93);
  });

  it("is zero rather than infinite on a zero pack size", () => {
    expect(costPerUnitCents({ qtyPerItem: 0, costPerOrderCents: 500 })).toBe(0);
  });
});

describe("period totals", () => {
  it("reproduces the biweekly figure from both spreadsheet rows", () => {
    expect(supplyTotals(CAT_FOOD_RATE, CAT_FOOD_OFFER).biweeklyCents).toBe(5196);
    expect(supplyTotals(ENERGY_RATE, ENERGY_OFFER).biweeklyCents).toBe(5521);
  });

  it("derives the year from the daily rate, not from the rounded month", () => {
    const totals = supplyTotals(ENERGY_RATE, ENERGY_OFFER);
    // 365.25/12 days a month, so the two disagree by a few cents. Asserted rather than
    // discovered: deriving year = month × 12 is the drift the source sheet had.
    expect(totals.monthlyCents * 12).not.toBe(totals.yearlyCents);
    expect(Math.abs(totals.monthlyCents * 12 - totals.yearlyCents)).toBeLessThan(12);
    expect(totals.yearlyCents).toBe(Math.round((2366 / 12) * 2 * 365.25));
  });

  it("prices a days-per-unit item with no countable daily rate", () => {
    // One tube lasts 45 days, $4.29 a tube.
    const totals = supplyTotals(
      { basis: "days_per_unit", daysPerUnitTenths: 450 },
      { qtyPerItem: 1, costPerOrderCents: 429 },
    );
    expect(totals.monthlyCents).toBe(Math.round((429 / 45) * (365.25 / 12)));
    expect(totals.daysPerUnit).toBe(45);
  });

  it("keeps the rate independent of pack size", () => {
    // A 3-pack of 45-day tubes lasts 135 days, so the daily cost is unchanged — this is
    // what makes "days one unit lasts" a property of the item and not of the offer.
    const rate: SupplyRate = { basis: "days_per_unit", daysPerUnitTenths: 450 };
    const single = costPerDayCents(rate, { qtyPerItem: 1, costPerOrderCents: 429 });
    const threePack = costPerDayCents(rate, { qtyPerItem: 3, costPerOrderCents: 1287 });
    expect(threePack).toBeCloseTo(single, 10);
  });
});

describe("restock", () => {
  it("lasts 10.5 days for the cat-food case and 6 for a 12-pack at 2/day", () => {
    expect(daysPerPack(CAT_FOOD_RATE, CAT_FOOD_OFFER)).toBe(10.5);
    expect(packsPerMonth(CAT_FOOD_RATE, CAT_FOOD_OFFER)).toBe(DAYS_PER_MONTH / 10.5);
    expect(supplyTotals(CAT_FOOD_RATE, CAT_FOOD_OFFER).daysPerPack).toBe(10.5);
    expect(supplyTotals(CAT_FOOD_RATE, CAT_FOOD_OFFER).packsPerMonth).toBe(
      DAYS_PER_MONTH / 10.5,
    );

    expect(daysPerPack(ENERGY_RATE, ENERGY_OFFER)).toBe(6);
  });

  it("scales Lasts with pack size and leaves cost-per-day alone", () => {
    // A 3-pack of 45-day tubes lasts 135 days; Packs/mo is a third of the single-tube figure.
    const rate: SupplyRate = { basis: "days_per_unit", daysPerUnitTenths: 450 };
    const single = { qtyPerItem: 1, costPerOrderCents: 429 };
    const threePack = { qtyPerItem: 3, costPerOrderCents: 1287 };
    expect(daysPerPack(rate, single)).toBe(45);
    expect(daysPerPack(rate, threePack)).toBe(135);
    expect(packsPerMonth(rate, threePack)).toBeCloseTo(
      packsPerMonth(rate, single) / 3,
      10,
    );
    expect(costPerDayCents(rate, threePack)).toBeCloseTo(
      costPerDayCents(rate, single),
      10,
    );
  });

  it("does not produce Infinity when the rate or qty is zero", () => {
    expect(
      daysPerPack({ basis: "units_per_day", unitsPerDayMilli: 0 }, CAT_FOOD_OFFER),
    ).toBe(0);
    expect(
      packsPerMonth({ basis: "units_per_day", unitsPerDayMilli: 0 }, CAT_FOOD_OFFER),
    ).toBe(0);
    expect(daysPerPack(CAT_FOOD_RATE, { qtyPerItem: 0, costPerOrderCents: 3897 })).toBe(
      0,
    );
    expect(
      packsPerMonth(CAT_FOOD_RATE, { qtyPerItem: 0, costPerOrderCents: 3897 }),
    ).toBe(0);
  });
});

describe("offer comparison", () => {
  it("is negative for a cheaper candidate and positive for a dearer one", () => {
    // Chewy: 24 cans for $23.99 → $0.9996/can, dearer than Walmart's $0.9279.
    const dearer = offerComparison(
      CAT_FOOD_OFFER,
      { qtyPerItem: 24, costPerOrderCents: 2399 },
      CAT_FOOD_RATE,
    );
    expect(dearer.deltaPerUnitCents).toBeGreaterThan(0);
    expect(dearer.deltaPercent).toBeGreaterThan(0);
    expect(dearer.yearlyDeltaCents).toBeGreaterThan(0);

    const cheaper = offerComparison(
      CAT_FOOD_OFFER,
      { qtyPerItem: 42, costPerOrderCents: 3499 },
      CAT_FOOD_RATE,
    );
    expect(cheaper.deltaPerUnitCents).toBeCloseTo((3499 - 3897) / 42, 10);
    expect(cheaper.deltaPercent).toBeCloseTo(((3499 - 3897) / 3897) * 100, 10);
    // Four cans a day for a year at 9.48¢ less each.
    expect(cheaper.yearlyDeltaCents).toBe(
      Math.round(((3499 - 3897) / 42) * 4 * 365.25),
    );
  });

  it("reports no percentage against an unpriced in-use offer", () => {
    const comparison = offerComparison(
      { qtyPerItem: 42, costPerOrderCents: 0 },
      CAT_FOOD_OFFER,
      CAT_FOOD_RATE,
    );
    expect(comparison.deltaPercent).toBe(0);
    expect(comparison.deltaPerUnitCents).toBeGreaterThan(0);
  });
});
