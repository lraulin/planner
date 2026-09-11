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
    contributedBeforeCents: 0,
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

  it("asks nothing of a pile holding more than it needs, never a negative", () => {
    // The target editor previews this figure directly; an over-full pile must not read as
    // an offer to take money back.
    const floor = (cadence: Target["cadence"]): Target => ({
      behavior: "balance",
      cadence,
      amountCents: 100_000,
    });
    const over = { carryInCents: 150_000 };
    for (const cadence of [
      { unit: "none" },
      { unit: "by", month: "2026-12" },
    ] as const) {
      expect(
        targetDemand(envelope(floor(cadence), over), "2026-08-01", NO_BILLS).amount,
      ).toBe(0);
    }
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

  it("asks nothing more the month the pile is emptied", () => {
    // Reverses `target-refill-basis`'s $100 here. Spending the pile on the thing it was saving
    // for is the pile working, not a raid: the year's propane went out, so November's ask is
    // met (`pile-spent-is-not-a-raid` D1).
    const e = envelope(propane, { carryInCents: 120_000, activityCents: -120_000 });
    expect(targetDemand(e, "2026-11-01", NO_BILLS).amount).toBe(0);
  });

  it("restarts the installments the next month, at $109.09 over the eleven left", () => {
    // Lee's rule: "start saving up again... starting next month." December through the
    // following October is eleven payments toward $1,200.
    const e = envelope(propane, { carryInCents: 0 });
    expect(targetDemand(e, "2026-12-01", NO_BILLS).amount).toBe(10_909);
  });

  it("asks a raid back through next month's carry-in, not the same day", () => {
    // D2's accepted cost, stated. $400 saved and $200 of it spent on something else in August:
    // August still asks its ordinary third of the remaining $800, blind to the raid.
    const raidedInAugust = envelope(propane, {
      carryInCents: 40_000,
      activityCents: -20_000,
    });
    expect(targetDemand(raidedInAugust, "2026-08-01", NO_BILLS).amount).toBe(26_667);

    // September carries in the $200 that is actually there, so the hole surfaces one month
    // late — deferred, not lost.
    const september = envelope(propane, { carryInCents: 20_000 });
    expect(targetDemand(september, "2026-09-01", NO_BILLS).amount).toBe(50_000);
  });

  it("asks the charge month nothing once the bill it saved for is paid", () => {
    // The reported class of bug, in the pile family's own shape: October with the $1,200 saved
    // and the charge posted asked $1,200 again.
    const paid = envelope(propane, { carryInCents: 120_000, activityCents: -120_000 });
    expect(targetDemand(paid, "2026-10-01", NO_BILLS).amount).toBe(0);
  });
});

describe("a raided floor still asks this month", () => {
  it("keeps the Available basis for `balance`, deadline or not", () => {
    // The guard on D1's blast radius: `balance` is a floor, so what is sitting in it is the
    // point and a raid nags now (`target-refill-basis` D3).
    const floor: Target = {
      behavior: "balance",
      cadence: { unit: "none" },
      amountCents: 10_000_000,
    };
    const raided = envelope(floor, {
      carryInCents: 10_000_000,
      activityCents: -503_000,
    });
    expect(targetDemand(raided, "2026-08-01", NO_BILLS).amount).toBe(503_000);

    const byDeadline: Target = {
      behavior: "balance",
      cadence: { unit: "by", month: "2026-06" },
      amountCents: 10_000_000,
    };
    const spentAfterDeadline = envelope(byDeadline, {
      carryInCents: 10_000_000,
      activityCents: -503_000,
    });
    expect(targetDemand(spentAfterDeadline, "2026-08-01", NO_BILLS).amount).toBe(
      503_000,
    );
  });
});

describe("a goal you finish measures what has gone in", () => {
  // Lee's House down payment: $100,000 saved for the earnest money and closing, and spending it
  // is the goal completing rather than a raid to make good (`one-time-savings-goal` D2).
  const house = (cadence: Target["cadence"]): Target => ({
    behavior: "save",
    cadence,
    amountCents: 10_000_000,
  });
  const NO_DEADLINE = { unit: "none" } as const;

  it("a goal spent on its own purpose is finished, not raided", () => {
    // The reported case. As a `balance` floor this asked $5,030 back; as a goal it asks $0,
    // because the $5,000 wire is what the $100,000 was saved for.
    const wired = envelope(house(NO_DEADLINE), {
      name: "House",
      carryInCents: 10_000_000,
      activityCents: -500_000,
      contributedBeforeCents: 10_000_000,
    });
    expect(targetDemand(wired, "2026-09-01", NO_BILLS).amount).toBe(0);

    // And the month after, carrying in the $95,000 that is actually there. This is the case a
    // carry-in basis gets wrong forever: it would ask $5,000 every month from here.
    const october = envelope(house(NO_DEADLINE), {
      name: "House",
      carryInCents: 9_500_000,
      contributedBeforeCents: 10_000_000,
    });
    expect(targetDemand(october, "2026-10-01", NO_BILLS).amount).toBe(0);
  });

  it("asks nothing at all when there is no deadline to be short against", () => {
    // The reported bug: Handgun, $450 with a no-deadline goal and nothing saved, said "$450.00
    // more needed this month". A monthly ask needs a denominator, and a goal with no cycle and
    // no horizon has none (`deadline-free-goal-never-asks` D1).
    const handgun = (contributedBeforeCents: number) =>
      envelope(
        { behavior: "save", cadence: NO_DEADLINE, amountCents: 45_000 },
        {
          name: "Handgun",
          contributedBeforeCents,
          carryInCents: contributedBeforeCents,
        },
      );
    expect(targetDemand(handgun(0), "2026-09-01", NO_BILLS).amount).toBe(0);
    expect(targetDemand(handgun(5_000), "2026-09-01", NO_BILLS).amount).toBe(0);
  });

  it("does not ask a withdrawal back when the goal has no deadline", () => {
    // Supersedes `one-time-savings-goal` D2's other half. $2,000 moved out leaves $98,000
    // contributed and the goal no longer reads met — that is the reminder. It is not an ask,
    // because there is still no month to be short in (`deadline-free-goal-never-asks` D2).
    const raided = envelope(house(NO_DEADLINE), {
      name: "House",
      carryInCents: 9_800_000,
      contributedBeforeCents: 9_800_000,
    });
    expect(targetDemand(raided, "2026-10-01", NO_BILLS).amount).toBe(0);
  });

  it("keeps asking a raided `balance` floor, which is the shape that must nag", () => {
    // The guard on D1's blast radius, stated in the goal's own suite: `target-refill-basis` D3
    // is untouched, and only `save` changed.
    const floor = envelope(
      { behavior: "balance", cadence: NO_DEADLINE, amountCents: 45_000 },
      { name: "Car repairs", carryInCents: 0 },
    );
    expect(targetDemand(floor, "2026-09-01", NO_BILLS).amount).toBe(45_000);
  });

  it("a goal with a deadline spreads what is left over the months it has", () => {
    // September 2026 through March 2027 is seven months inclusive.
    const byMarch = envelope(house({ unit: "by", month: "2027-03" }), {
      name: "House",
    });
    expect(targetDemand(byMarch, "2026-09-01", NO_BILLS).amount).toBe(1_428_571);

    const halfSaved = envelope(house({ unit: "by", month: "2027-03" }), {
      name: "House",
      contributedBeforeCents: 5_000_000,
    });
    expect(targetDemand(halfSaved, "2026-09-01", NO_BILLS).amount).toBe(714_286);
  });

  it("a goal past its deadline asks the whole gap", () => {
    // No new rule: `balance` + `by` already does this, and a deadline that has passed leaves
    // zero months to spread over.
    const overdue = envelope(house({ unit: "by", month: "2026-06" }), {
      name: "House",
      contributedBeforeCents: 9_500_000,
    });
    expect(targetDemand(overdue, "2026-09-01", NO_BILLS).amount).toBe(500_000);
  });

  it("counts contribution and never activity, so a met goal stays met while it drains", () => {
    // Every dollar spent, none put back: the envelope is empty and still asks nothing. Fully
    // Spent is what the grid says here (`one-time-savings-goal` D4), not a $100,000 ask.
    const closed = envelope(house(NO_DEADLINE), {
      name: "House",
      carryInCents: 10_000_000,
      activityCents: -10_000_000,
      contributedBeforeCents: 10_000_000,
    });
    expect(targetDemand(closed, "2027-03-01", NO_BILLS).amount).toBe(0);
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
