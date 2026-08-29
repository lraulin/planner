import { describe, expect, it } from "vitest";
import {
  billChargeCents,
  billClaimAccepts,
  minimumCadenceGapDays,
  type BillClaimFacet,
} from "./billClaimMatch";

const monthly = (expectedCents: number | null): BillClaimFacet => ({
  expectedCents,
  cadenceMonths: 1,
  cadenceDays: null,
});

describe("billChargeCents", () => {
  it("uses the declared amount, in the register's sign", () => {
    expect(billChargeCents(monthly(500), [])).toBe(-500);
  });

  it("falls back to the median of the charges on file", () => {
    expect(
      billChargeCents(monthly(null), [
        { transactionDate: "2026-06-01", amountCents: -500 },
        { transactionDate: "2026-07-01", amountCents: -520 },
        { transactionDate: "2026-08-01", amountCents: -505 },
      ]),
    ).toBe(-505);
  });

  it("has no answer for a bill that declares nothing and has no history", () => {
    expect(billChargeCents(monthly(null), [])).toBeNull();
  });
});

describe("billClaimAccepts", () => {
  it("refuses the shopping trip that broke a $5.00 membership envelope", () => {
    // `CVS $22.84` on 2026-08-18 landed in the $5.00/month CVS ExtraCare envelope through
    // the payee claim, spending a balanced envelope $22.84 over with nothing to show for
    // it. CVS is both a subscription and a shop, so "this merchant's charges" is wrong.
    const accepted = billClaimAccepts(
      monthly(500),
      [],
      [{ id: "trip", transactionDate: "2026-08-18", amountCents: -2284 }],
    );
    expect(accepted.has("trip")).toBe(false);
  });

  it("still files the membership charge itself", () => {
    const accepted = billClaimAccepts(
      monthly(500),
      [],
      [{ id: "membership", transactionDate: "2026-08-05", amountCents: -500 }],
    );
    expect(accepted.has("membership")).toBe(true);
  });

  it("allows a bill to move within Actual's approximate band", () => {
    // Rent-style: the amount is the bill's own, give or take. 7.5% of $1,200 is $90.
    const accepted = billClaimAccepts(
      monthly(120000),
      [],
      [
        { id: "near", transactionDate: "2026-08-01", amountCents: -124000 },
        { id: "far", transactionDate: "2026-08-01", amountCents: -140000 },
      ],
    );
    expect([...accepted]).toEqual(["near"]);
  });

  it("refuses a second charge inside one cadence period", () => {
    const accepted = billClaimAccepts(
      monthly(500),
      [{ transactionDate: "2026-08-05", amountCents: -500 }],
      [{ id: "again", transactionDate: "2026-08-12", amountCents: -500 }],
    );
    expect(accepted.has("again")).toBe(false);
  });

  it("accepts the next cycle even in a short month", () => {
    // Feb 1 → Mar 1 is 28 days against a 30.44-day cycle. A guard set at the nominal
    // cycle would refuse the March rent every leap-free year.
    const accepted = billClaimAccepts(
      monthly(120000),
      [{ transactionDate: "2026-02-01", amountCents: -120000 }],
      [{ id: "march", transactionDate: "2026-03-01", amountCents: -120000 }],
    );
    expect(accepted.has("march")).toBe(true);
  });

  it("files the first of two same-cycle charges and leaves the second uncategorized", () => {
    const accepted = billClaimAccepts(
      monthly(500),
      [],
      [
        { id: "second", transactionDate: "2026-08-12", amountCents: -500 },
        { id: "first", transactionDate: "2026-08-05", amountCents: -500 },
      ],
    );
    expect([...accepted]).toEqual(["first"]);
  });

  it("keeps the old meaning when the bill declares nothing and has no history", () => {
    const accepted = billClaimAccepts(
      monthly(null),
      [],
      [{ id: "any", transactionDate: "2026-08-18", amountCents: -2284 }],
    );
    expect(accepted.has("any")).toBe(true);
  });

  it("counts a day cadence in days", () => {
    // Vetsource ships every four weeks; gaps of 28–31 days are one cycle, not two.
    const facet: BillClaimFacet = {
      expectedCents: 8900,
      cadenceMonths: 1,
      cadenceDays: 28,
    };
    expect(minimumCadenceGapDays({ unit: "day", n: 28 })).toBeCloseTo(24.64);
    const accepted = billClaimAccepts(
      facet,
      [{ transactionDate: "2026-08-01", amountCents: -8900 }],
      [
        { id: "next", transactionDate: "2026-08-29", amountCents: -8900 },
        { id: "dupe", transactionDate: "2026-08-10", amountCents: -8900 },
      ],
    );
    expect([...accepted]).toEqual(["next"]);
  });
});
