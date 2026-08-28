import { describe, expect, it } from "vitest";

import { availableBefore, targetDemand, type DemandEnvelope } from "./demand";
import type { BillSnapshot } from "./derive";
import type { Target } from "./types";

const NO_BILLS = new Map<string, BillSnapshot>();

function envelope(
  target: Target | null,
  parts: Partial<DemandEnvelope> = {},
): DemandEnvelope {
  return {
    id: "e1",
    name: "Groceries",
    kind: "spending",
    target,
    carryInCents: 0,
    activityCents: 0,
    ...parts,
  };
}

const sundayRefill: Target = {
  behavior: "upTo",
  cadence: { unit: "week", weekday: 0 },
  amountCents: 21_096,
};

describe("the Groceries case this spec exists for", () => {
  // 2026-08-28: assigned $843.59, activity −$785.53, carry-in $0 → Available $58.06.
  const groceries = envelope(sundayRefill, { activityCents: -78_553 });

  it("asks $152.90 more, not $211.21 — one Sunday left, less what is already there", () => {
    const { amount } = targetDemand(groceries, "2026-08-01", "2026-08-28", NO_BILLS);
    // Needed assigned; the gap against $843.59 already assigned is $152.90.
    expect(amount).toBe(99_649);
    expect(amount - 84_359).toBe(15_290);
  });

  it("asks four Sundays in September, less whatever August leaves behind", () => {
    const september = envelope(sundayRefill, { carryInCents: 5806 });
    const { amount } = targetDemand(september, "2026-09-01", "2026-08-28", NO_BILLS);
    expect(amount).toBe(21_096 * 4 - 5806);
  });

  it("asks nothing for a month that has already happened", () => {
    const july = envelope(sundayRefill);
    expect(targetDemand(july, "2026-07-01", "2026-08-28", NO_BILLS).amount).toBe(0);
  });
});

describe("upTo measures against Available, not carry-in", () => {
  it("asks $300 to keep $500 when $400 carried in and $200 was spent", () => {
    const keep500: Target = {
      behavior: "upTo",
      cadence: { unit: "month", day: 31 },
      amountCents: 50_000,
    };
    const e = envelope(keep500, { carryInCents: 40_000, activityCents: -20_000 });
    expect(availableBefore(e)).toBe(20_000);
    expect(targetDemand(e, "2026-08-01", "2026-08-01", NO_BILLS).amount).toBe(30_000);
  });

  it("never returns a negative when the envelope is already over its target", () => {
    const keep500: Target = {
      behavior: "upTo",
      cadence: { unit: "month", day: 31 },
      amountCents: 50_000,
    };
    const e = envelope(keep500, { carryInCents: 90_000 });
    expect(targetDemand(e, "2026-08-01", "2026-08-01", NO_BILLS).amount).toBe(0);
  });
});

describe("add ignores what is already in the envelope", () => {
  const addMonthly: Target = {
    behavior: "add",
    cadence: { unit: "month", day: 31 },
    amountCents: 25_000,
  };

  it("asks the full contribution however much carried in or was spent", () => {
    const rich = envelope(addMonthly, { carryInCents: 500_000 });
    const spent = envelope(addMonthly, { activityCents: -100_000 });
    expect(targetDemand(rich, "2026-08-01", "2026-08-15", NO_BILLS).amount).toBe(
      25_000,
    );
    expect(targetDemand(spent, "2026-08-01", "2026-08-15", NO_BILLS).amount).toBe(
      25_000,
    );
  });

  it("counts the whole month of weekly contributions even late in the month", () => {
    const weekly: Target = {
      behavior: "add",
      cadence: { unit: "week", weekday: 0 },
      amountCents: 10_000,
    };
    // Five Sundays in August 2026; the 28th leaves only one, and `add` does not care.
    expect(
      targetDemand(envelope(weekly), "2026-08-01", "2026-08-28", NO_BILLS).amount,
    ).toBe(50_000);
  });
});

describe("balance spreads the hole over the months left", () => {
  const downPayment = (month: string): Target => ({
    behavior: "balance",
    cadence: { unit: "by", month },
    amountCents: 10_000_000,
  });

  it("asks half of a $100,000 goal that is due next month", () => {
    const e = envelope(downPayment("2026-09"));
    expect(targetDemand(e, "2026-08-01", "2026-08-01", NO_BILLS).amount).toBe(
      5_000_000,
    );
  });

  it("asks the whole remaining hole at once once the deadline has passed", () => {
    const e = envelope(downPayment("2026-06"), { carryInCents: 9_500_000 });
    expect(targetDemand(e, "2026-08-01", "2026-08-01", NO_BILLS).amount).toBe(500_000);
  });

  it("asks nothing but reports the hole when there is no deadline", () => {
    const floor: Target = {
      behavior: "balance",
      cadence: { unit: "none" },
      amountCents: 10_000_000,
    };
    const e = envelope(floor, { carryInCents: 9_500_000 });
    const demand = targetDemand(e, "2026-08-01", "2026-08-01", NO_BILLS);
    expect(demand.amount).toBe(0);
    expect(demand.eventuallyCents).toBe(500_000);
  });

  it("reports no eventual figure for a shape that has a deadline", () => {
    expect(
      targetDemand(
        envelope(downPayment("2026-09")),
        "2026-08-01",
        "2026-08-01",
        NO_BILLS,
      ).eventuallyCents,
    ).toBeNull();
  });
});

describe("a yearly upTo sinks toward its anchor month", () => {
  const propane: Target = {
    behavior: "upTo",
    cadence: { unit: "year", month: 10 },
    amountCents: 120_000,
  };

  it("divides the hole across the months up to and including the anchor", () => {
    // August → October is two months out, so three payments including this one.
    expect(
      targetDemand(envelope(propane), "2026-08-01", "2026-08-01", NO_BILLS).amount,
    ).toBe(40_000);
  });

  it("asks the whole remaining hole in the anchor month", () => {
    const e = envelope(propane, { carryInCents: 80_000 });
    expect(targetDemand(e, "2026-10-01", "2026-10-01", NO_BILLS).amount).toBe(40_000);
  });

  it("restarts over twelve months once the anchor has passed", () => {
    const e = envelope(propane, { carryInCents: 120_000, activityCents: -120_000 });
    expect(targetDemand(e, "2026-11-01", "2026-11-01", NO_BILLS).amount).toBe(10_000);
  });
});

describe("an envelope with no target", () => {
  it("asks nothing, and leaves overspend to `assignedToZeroBalance`", () => {
    const e = envelope(null, { activityCents: -12_345 });
    expect(targetDemand(e, "2026-08-01", "2026-08-01", NO_BILLS)).toEqual({
      amount: 0,
      eventuallyCents: null,
      errors: [],
    });
  });
});
