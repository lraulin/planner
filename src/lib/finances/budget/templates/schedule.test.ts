import { describe, expect, it } from "vitest";

import {
  baseMonthlyContribution,
  billFundingDemand,
  type BillSnapshot,
} from "./schedule";

function snap(overrides: Partial<BillSnapshot> = {}): BillSnapshot {
  return {
    id: "rent",
    name: "Rent",
    cadenceMonths: 1,
    cadenceDays: null,
    expectedCents: 185_000,
    nextDueKey: "2026-08-01",
    ...overrides,
  };
}

describe("billFundingDemand", () => {
  it("assigns this month's amount for a monthly bill due this month", () => {
    expect(billFundingDemand(snap(), "2026-08-01", 0).toBudgetCents).toBe(185_000);
  });

  it("sinks a yearly bill: remaining / (months until due + 1), reduced by carry-in", () => {
    const taxes = snap({
      id: "taxes",
      name: "Taxes",
      cadenceMonths: 12,
      expectedCents: 240_000,
      nextDueKey: "2027-04-15",
    });
    // August 2026 → April 2027 is 8 months, 9 slices. 240000 / 9 = 26667.
    expect(billFundingDemand(taxes, "2026-08-01", 0).toBudgetCents).toBe(
      Math.round(240_000 / 9),
    );
    // $1,000 already saved → (240000 - 100000) / 9.
    expect(billFundingDemand(taxes, "2026-08-01", 100_000).toBudgetCents).toBe(
      Math.round(140_000 / 9),
    );
  });

  it("a quarterly bill sinks too, funding in full the month it's due", () => {
    const insurance = snap({
      id: "insurance",
      name: "Insurance",
      cadenceMonths: 3,
      expectedCents: 90_000,
      nextDueKey: "2026-08-01",
    });
    // Due this month: 0 months until due, so the whole remaining amount is demanded.
    expect(billFundingDemand(insurance, "2026-08-01", 0).toBudgetCents).toBe(90_000);
  });

  it("sums weekly occurrences that fall in the month", () => {
    const pizza = snap({
      id: "pizza",
      name: "Pizza",
      cadenceMonths: 1,
      cadenceDays: 7,
      expectedCents: 2000,
      nextDueKey: "2026-08-07",
    });
    // August 2026 has five Fridays starting the 7th: 7, 14, 21, 28 — four occurrences,
    // since the walk starts at nextDueKey and steps by 7 days.
    const result = billFundingDemand(pizza, "2026-08-01", 0);
    expect(result.toBudgetCents).toBe(2000 * 4);
  });

  it("does not count the 1st of next month as an occurrence this month", () => {
    // monthKey is YYYY-MM-01. Appending "-01" again made the exclusive end
    // "2026-09-01-01", so "2026-09-01" compared as still inside August.
    const weekly = snap({
      id: "rent-share",
      name: "Rent share",
      cadenceMonths: 1,
      cadenceDays: 7,
      expectedCents: 2000,
      nextDueKey: "2026-09-01",
    });
    // Back from Sep 1: Aug 25, 18, 11, 4. Four August Tuesdays. Sep 1 is next month.
    expect(billFundingDemand(weekly, "2026-08-01", 0).toBudgetCents).toBe(2000 * 4);
  });

  it("returns zero when the amount is zero", () => {
    expect(
      billFundingDemand(snap({ expectedCents: 0 }), "2026-08-01", 0).toBudgetCents,
    ).toBe(0);
  });
});

describe("already funded", () => {
  it("falls back to the base monthly rate when carry-in already covers the target", () => {
    const taxes = snap({
      id: "taxes",
      name: "Taxes",
      cadenceMonths: 12,
      expectedCents: 240_000,
      nextDueKey: "2027-04-15",
    });
    expect(baseMonthlyContribution(taxes)).toBe(240_000 / 12);
    expect(billFundingDemand(taxes, "2026-08-01", 240_000).toBudgetCents).toBe(
      Math.round(240_000 / 12),
    );
  });
});
