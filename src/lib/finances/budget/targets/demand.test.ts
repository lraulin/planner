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

describe("a period refill is an assignment question", () => {
  it("does not let the last pizza of the month create a new ask", () => {
    // The reported bug. `upTo` Friday $33.05, August 2026 (four Fridays), $134.76 assigned
    // against $132.20 of pizza already bought: YNAB says "You've met your target".
    const pizza: Target = {
      behavior: "upTo",
      cadence: { unit: "week", weekday: 5 },
      amountCents: 3305,
    };
    const august = envelope(pizza, { name: "Pizza", activityCents: -13_220 });
    const { amount } = targetDemand(august, "2026-08-01", NO_BILLS);
    expect(amount).toBe(13_220);
    // Needed assigned less what is assigned: no gap.
    expect(Math.max(0, amount - 13_476)).toBe(0);
  });

  it("asks Groceries $211.21 more, not $152.90 — five Sundays, spending aside", () => {
    // 2026-08-28: assigned $843.59, activity −$785.53, carry-in $0.
    // This is the number `ynab-target-engine` was written to eliminate, and it is the right
    // one: four weeks' worth was assigned against a five-Sunday month.
    const groceries = envelope(sundayRefill, { activityCents: -78_553 });
    const { amount } = targetDemand(groceries, "2026-08-01", NO_BILLS);
    expect(amount).toBe(21_096 * 5);
    expect(amount - 84_359).toBe(21_121);
  });

  it("lets carry-in reduce a refill, and never asks a negative", () => {
    const september = envelope(sundayRefill, { carryInCents: 5806 });
    expect(targetDemand(september, "2026-09-01", NO_BILLS).amount).toBe(
      21_096 * 4 - 5806,
    );
    const flush = envelope(sundayRefill, { carryInCents: 500_000 });
    expect(targetDemand(flush, "2026-09-01", NO_BILLS).amount).toBe(0);
  });

  it("is not a floor: keeping $500 with $400 carried in and $200 spent asks $100", () => {
    // `ynab-target-engine` asserted $300 here, which is the floor rule applied to a refill —
    // the pizza bug in a different envelope.
    const keep500: Target = {
      behavior: "upTo",
      cadence: { unit: "month", day: 31 },
      amountCents: 50_000,
    };
    const e = envelope(keep500, { carryInCents: 40_000, activityCents: -20_000 });
    expect(availableBefore(e)).toBe(20_000);
    expect(targetDemand(e, "2026-08-01", NO_BILLS).amount).toBe(10_000);
  });

  it("asks nothing for a month before the target started", () => {
    const july = envelope({ ...sundayRefill, since: "2026-08-01" });
    expect(targetDemand(july, "2026-07-01", NO_BILLS).amount).toBe(0);
  });

  it("asks the start month's whole cap, not the Sundays after the start day", () => {
    // The envelope this shipped wrong on: `since` was the day the budget was created, so
    // August asked for one Sunday ($210.96) and $943.59 assigned read as Funded — with
    // $158.06 available against a $210.96 shop still to come. August costs five Sundays.
    const groceries = envelope(
      { ...sundayRefill, since: "2026-08-24" },
      { activityCents: -78_553 },
    );
    const { amount } = targetDemand(groceries, "2026-08-01", NO_BILLS);
    expect(amount).toBe(105_480);
    expect(amount - 94_359).toBe(11_121);
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
    expect(targetDemand(rich, "2026-08-01", NO_BILLS).amount).toBe(25_000);
    expect(targetDemand(spent, "2026-08-01", NO_BILLS).amount).toBe(25_000);
  });

  it("counts the whole month of weekly contributions even late in the month", () => {
    const weekly: Target = {
      behavior: "add",
      cadence: { unit: "week", weekday: 0 },
      amountCents: 10_000,
    };
    expect(targetDemand(envelope(weekly), "2026-08-01", NO_BILLS).amount).toBe(50_000);
  });
});

describe("a pile measures what is actually in it", () => {
  const downPayment = (month: string): Target => ({
    behavior: "balance",
    cadence: { unit: "by", month },
    amountCents: 10_000_000,
  });

  it("asks half of a $100,000 goal that is due next month", () => {
    const e = envelope(downPayment("2026-09"));
    expect(targetDemand(e, "2026-08-01", NO_BILLS).amount).toBe(5_000_000);
  });

  it("asks the whole remaining hole at once once the deadline has passed", () => {
    const e = envelope(downPayment("2026-06"), { carryInCents: 9_500_000 });
    expect(targetDemand(e, "2026-08-01", NO_BILLS).amount).toBe(500_000);
  });

  it("makes a deadline-free floor ask this month, not eventually", () => {
    // Raiding the down-payment fund has to nag now; a $0 ask and a soothing sentence is the
    // one thing a floor must not say (`target-refill-basis` D3).
    const floor: Target = {
      behavior: "balance",
      cadence: { unit: "none" },
      amountCents: 10_000_000,
    };
    const e = envelope(floor, { carryInCents: 9_950_000 });
    expect(targetDemand(e, "2026-08-01", NO_BILLS).amount).toBe(50_000);
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
    expect(targetDemand(envelope(propane), "2026-08-01", NO_BILLS).amount).toBe(40_000);
  });

  it("asks the whole remaining hole in the anchor month", () => {
    const e = envelope(propane, { carryInCents: 80_000 });
    expect(targetDemand(e, "2026-10-01", NO_BILLS).amount).toBe(40_000);
  });

  it("asks a raided pile for it back: $100/month once the year's propane is spent", () => {
    const e = envelope(propane, { carryInCents: 120_000, activityCents: -120_000 });
    expect(targetDemand(e, "2026-11-01", NO_BILLS).amount).toBe(10_000);
  });
});

describe("an envelope with no target", () => {
  it("asks nothing, and leaves overspend to `assignedToZeroBalance`", () => {
    const e = envelope(null, { activityCents: -12_345 });
    expect(targetDemand(e, "2026-08-01", NO_BILLS)).toEqual({
      amount: 0,
      errors: [],
    });
  });
});
