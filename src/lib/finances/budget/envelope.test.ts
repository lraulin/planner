import { describe, expect, it } from "vitest";

import {
  buildBudget,
  categoryMonth,
  findMonth,
  isMonthKey,
  monthEndKey,
  monthKeyFromParam,
  monthKeyOf,
  monthKeyRange,
  monthLabel,
  monthParamOf,
  nextMonthKey,
  prevMonthKey,
  shiftMonthKey,
  type BudgetInput,
  type BudgetMonth,
} from "./envelope";

const FOOD = { id: "food", groupId: "spending", isIncome: false };
const RENT = { id: "rent", groupId: "spending", isIncome: false };
const PAY = { id: "pay", groupId: "income", isIncome: true };

function build(overrides: Partial<BudgetInput> = {}): BudgetMonth[] {
  return buildBudget({
    categories: [FOOD, RENT, PAY],
    allocations: [],
    activity: [],
    buffered: [],
    startMonth: "2026-08-01",
    endMonth: "2026-10-01",
    openingCents: 0,
    ...overrides,
  });
}

function at(months: BudgetMonth[], month: string, categoryId: string) {
  const found = findMonth(months, month);
  if (!found) throw new Error(`no month ${month}`);
  return categoryMonth(found, categoryId);
}

function ready(months: BudgetMonth[], month: string): number {
  const found = findMonth(months, month);
  if (!found) throw new Error(`no month ${month}`);
  return found.readyToAssignCents;
}

describe("month keys", () => {
  it("shifts across year boundaries in both directions", () => {
    expect(shiftMonthKey("2026-01-01", -1)).toBe("2025-12-01");
    expect(shiftMonthKey("2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftMonthKey("2026-08-01", -20)).toBe("2024-12-01");
    expect(shiftMonthKey("2026-08-01", 29)).toBe("2029-01-01");
    expect(prevMonthKey("2026-03-01")).toBe("2026-02-01");
    expect(nextMonthKey("2026-02-01")).toBe("2026-03-01");
  });

  it("keys a day to its month and labels it without a Date", () => {
    // A Date round trip is how "Aug 1" becomes "Jul 31" at a negative offset. This never
    // parses, so the suite's pinned TZ cannot change the answer.
    expect(monthKeyOf("2026-08-01")).toBe("2026-08-01");
    expect(monthKeyOf("2026-08-31")).toBe("2026-08-01");
    expect(monthLabel("2026-08-01")).toBe("August 2026");
    expect(monthLabel("2026-12-01")).toBe("December 2026");
  });

  it("knows the last day of the month, leap years included", () => {
    expect(monthEndKey("2026-02-01")).toBe("2026-02-28");
    expect(monthEndKey("2024-02-01")).toBe("2024-02-29");
    expect(monthEndKey("2026-08-01")).toBe("2026-08-31");
    expect(monthEndKey("2026-09-01")).toBe("2026-09-30");
  });

  it("accepts a month from the URL and refuses anything else", () => {
    // A bad ?month= that coerced would fold from a month no allocation shares, and every
    // figure on the page would be a confident zero.
    expect(monthKeyFromParam("2026-08")).toBe("2026-08-01");
    expect(monthKeyFromParam("2026-08-01")).toBe("2026-08-01");
    expect(monthKeyFromParam("2026-08-15")).toBeNull();
    expect(monthKeyFromParam("2026-13")).toBeNull();
    expect(monthKeyFromParam("nonsense")).toBeNull();
    expect(monthKeyFromParam(null)).toBeNull();
    expect(monthParamOf("2026-08-01")).toBe("2026-08");
    expect(isMonthKey("2026-00-01")).toBe(false);
  });

  it("returns an empty range when the end precedes the start", () => {
    expect(monthKeyRange("2026-08-01", "2026-10-01")).toEqual([
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
    ]);
    expect(monthKeyRange("2026-10-01", "2026-08-01")).toEqual([]);
  });
});

describe("buildBudget — the balance recurrence", () => {
  it("seeds funds from last month with the opening position", () => {
    // The first month has no predecessor, so the opening position is the only thing that
    // stops a fresh budget offering nothing to assign.
    const months = build({ openingCents: 150_000 });
    expect(findMonth(months, "2026-08-01")?.fromLastMonthCents).toBe(150_000);
    expect(ready(months, "2026-08-01")).toBe(150_000);
  });

  it("keeps a negative opening position", () => {
    // Card balances are on-budget. Starting in the hole is the real situation, and clamping
    // it would be the app lying in the comfortable direction.
    const months = build({ openingCents: -42_000 });
    expect(ready(months, "2026-08-01")).toBe(-42_000);
  });

  it("balances assigned plus activity plus carry-in", () => {
    const months = build({
      openingCents: 100_000,
      allocations: [
        {
          month: "2026-08-01",
          categoryId: FOOD.id,
          amountCents: 40_000,
          carryover: false,
        },
      ],
      activity: [{ month: "2026-08-01", categoryId: FOOD.id, amountCents: -15_000 }],
    });
    expect(at(months, "2026-08-01", FOOD.id)).toMatchObject({
      assignedCents: 40_000,
      activityCents: -15_000,
      balanceCents: 25_000,
    });
    expect(ready(months, "2026-08-01")).toBe(60_000);
  });

  it("rolls a positive balance forward unconditionally", () => {
    // No flag is needed for the good case, in either budget: leftover money stays in the
    // envelope it was assigned to.
    const months = build({
      openingCents: 100_000,
      allocations: [
        {
          month: "2026-08-01",
          categoryId: FOOD.id,
          amountCents: 40_000,
          carryover: false,
        },
      ],
      activity: [{ month: "2026-08-01", categoryId: FOOD.id, amountCents: -15_000 }],
    });
    expect(at(months, "2026-09-01", FOOD.id).balanceCents).toBe(25_000);
    expect(at(months, "2026-10-01", FOOD.id).balanceCents).toBe(25_000);
  });

  it("charges an overspend to next month's Ready to Assign, not to the envelope", () => {
    // The default. The envelope restarts at zero and the hole shows up once, against the
    // money you have not yet assigned — which is what forces you to deal with it.
    const months = build({
      openingCents: 100_000,
      allocations: [
        {
          month: "2026-08-01",
          categoryId: FOOD.id,
          amountCents: 20_000,
          carryover: false,
        },
      ],
      activity: [{ month: "2026-08-01", categoryId: FOOD.id, amountCents: -35_000 }],
    });

    expect(at(months, "2026-08-01", FOOD.id).balanceCents).toBe(-15_000);
    expect(at(months, "2026-09-01", FOOD.id).balanceCents).toBe(0);

    const september = findMonth(months, "2026-09-01");
    expect(september?.lastMonthOverspentCents).toBe(-15_000);
    // 80_000 carried from August, less the 15_000 overspend.
    expect(september?.readyToAssignCents).toBe(65_000);
  });

  it("carries the overspend into the envelope when carryover is set, and only there", () => {
    // Trap 2: the same overspend counted in both places is the classic double-count. Ready
    // to Assign must be untouched by an overspend the envelope kept.
    const months = build({
      openingCents: 100_000,
      allocations: [
        {
          month: "2026-08-01",
          categoryId: FOOD.id,
          amountCents: 20_000,
          carryover: true,
        },
      ],
      activity: [{ month: "2026-08-01", categoryId: FOOD.id, amountCents: -35_000 }],
    });

    expect(at(months, "2026-09-01", FOOD.id).balanceCents).toBe(-15_000);

    const september = findMonth(months, "2026-09-01");
    expect(september?.lastMonthOverspentCents).toBe(0);
    expect(september?.readyToAssignCents).toBe(80_000);
  });

  it("reads the carryover flag off the previous month, not the current one", () => {
    // Trap 1. Setting the flag in September cannot retroactively rescue August's overspend
    // from September's Ready to Assign — August's flag is what governed that hand-off.
    const months = build({
      openingCents: 100_000,
      allocations: [
        {
          month: "2026-08-01",
          categoryId: FOOD.id,
          amountCents: 20_000,
          carryover: false,
        },
        { month: "2026-09-01", categoryId: FOOD.id, amountCents: 0, carryover: true },
      ],
      activity: [{ month: "2026-08-01", categoryId: FOOD.id, amountCents: -35_000 }],
    });

    expect(findMonth(months, "2026-09-01")?.lastMonthOverspentCents).toBe(-15_000);
    expect(at(months, "2026-09-01", FOOD.id).balanceCents).toBe(0);
  });

  it("chains three months of carry-in", () => {
    const months = build({
      openingCents: 90_000,
      allocations: [
        {
          month: "2026-08-01",
          categoryId: RENT.id,
          amountCents: 30_000,
          carryover: false,
        },
        {
          month: "2026-09-01",
          categoryId: RENT.id,
          amountCents: 30_000,
          carryover: false,
        },
        {
          month: "2026-10-01",
          categoryId: RENT.id,
          amountCents: 30_000,
          carryover: false,
        },
      ],
      activity: [{ month: "2026-10-01", categoryId: RENT.id, amountCents: -75_000 }],
    });

    expect(at(months, "2026-08-01", RENT.id).balanceCents).toBe(30_000);
    expect(at(months, "2026-09-01", RENT.id).balanceCents).toBe(60_000);
    // Three months of saving pays a bill larger than any single month's assignment.
    expect(at(months, "2026-10-01", RENT.id).balanceCents).toBe(15_000);
    expect(ready(months, "2026-10-01")).toBe(0);
  });
});

describe("buildBudget — income and Ready to Assign", () => {
  it("feeds income into available funds without assigning or balancing it", () => {
    // Trap 3. An income envelope that could be assigned would let the same dollar be
    // budgeted twice: once as income and once out of the pot it created.
    const months = build({
      openingCents: 0,
      activity: [{ month: "2026-08-01", categoryId: PAY.id, amountCents: 250_000 }],
      allocations: [
        {
          month: "2026-08-01",
          categoryId: PAY.id,
          amountCents: 999_999,
          carryover: false,
        },
      ],
    });

    const august = findMonth(months, "2026-08-01");
    expect(august?.totalIncomeCents).toBe(250_000);
    expect(august?.totalAssignedCents).toBe(0);
    expect(at(months, "2026-08-01", PAY.id)).toMatchObject({
      assignedCents: 0,
      balanceCents: 0,
      activityCents: 250_000,
    });
    expect(august?.readyToAssignCents).toBe(250_000);
  });

  it("defers held money and hands it back next month", () => {
    // A buffer is a deferral, not a sink. Getting the pairing wrong in one direction loses
    // money and in the other creates it.
    const months = build({
      openingCents: 200_000,
      buffered: [{ month: "2026-08-01", bufferedCents: 50_000 }],
    });

    expect(ready(months, "2026-08-01")).toBe(150_000);
    expect(findMonth(months, "2026-09-01")?.fromLastMonthCents).toBe(200_000);
    expect(ready(months, "2026-09-01")).toBe(200_000);
  });

  it("sums its terms to its headline", () => {
    const months = build({
      openingCents: 120_000,
      activity: [
        { month: "2026-08-01", categoryId: PAY.id, amountCents: 300_000 },
        { month: "2026-08-01", categoryId: FOOD.id, amountCents: -70_000 },
      ],
      allocations: [
        {
          month: "2026-08-01",
          categoryId: FOOD.id,
          amountCents: 50_000,
          carryover: false,
        },
      ],
      buffered: [{ month: "2026-08-01", bufferedCents: 25_000 }],
    });

    for (const month of months) {
      const total = month.terms.reduce((sum, term) => sum + term.cents, 0);
      expect(total).toBe(month.readyToAssignCents);
    }
  });
});

describe("buildBudget — the reconciliation invariant", () => {
  /**
   * Ready to Assign plus every envelope balance equals the on-budget position, whenever every
   * transaction from the start month forward carries an envelope. That identity is what makes
   * the budget self-auditing: the gap *is* the uncategorized backlog, so the page can name it
   * rather than drift.
   */
  function positionAfter(
    months: BudgetMonth[],
    openingCents: number,
    upTo: string,
  ): number {
    return months
      .filter((month) => month.month <= upTo)
      .reduce(
        (total, month) => total + month.totalIncomeCents + month.totalActivityCents,
        openingCents,
      );
  }

  it("holds across a ledger with income, spending, overspend and a buffer", () => {
    const openingCents = 87_350;
    const months = build({
      openingCents,
      activity: [
        { month: "2026-08-01", categoryId: PAY.id, amountCents: 240_000 },
        { month: "2026-08-01", categoryId: FOOD.id, amountCents: -63_412 },
        { month: "2026-08-01", categoryId: RENT.id, amountCents: -120_000 },
        { month: "2026-09-01", categoryId: PAY.id, amountCents: 240_000 },
        // Deliberately overspent, with no carryover flag, so the hand-off is exercised.
        { month: "2026-09-01", categoryId: FOOD.id, amountCents: -91_005 },
        { month: "2026-10-01", categoryId: FOOD.id, amountCents: -12_000 },
      ],
      allocations: [
        {
          month: "2026-08-01",
          categoryId: FOOD.id,
          amountCents: 70_000,
          carryover: false,
        },
        {
          month: "2026-08-01",
          categoryId: RENT.id,
          amountCents: 120_000,
          carryover: false,
        },
        {
          month: "2026-09-01",
          categoryId: FOOD.id,
          amountCents: 80_000,
          carryover: false,
        },
        {
          month: "2026-10-01",
          categoryId: FOOD.id,
          amountCents: 15_000,
          carryover: false,
        },
      ],
      buffered: [{ month: "2026-09-01", bufferedCents: 30_000 }],
    });

    for (const month of months) {
      expect(month.readyToAssignCents + month.totalBalanceCents).toBe(
        positionAfter(months, openingCents, month.month) - month.bufferedCents,
      );
    }
  });

  it("holds when every overspend is carried into its envelope instead", () => {
    const openingCents = -25_000;
    const months = build({
      openingCents,
      activity: [
        { month: "2026-08-01", categoryId: PAY.id, amountCents: 180_000 },
        { month: "2026-08-01", categoryId: FOOD.id, amountCents: -95_000 },
        { month: "2026-09-01", categoryId: FOOD.id, amountCents: -40_000 },
      ],
      allocations: [
        {
          month: "2026-08-01",
          categoryId: FOOD.id,
          amountCents: 60_000,
          carryover: true,
        },
        {
          month: "2026-09-01",
          categoryId: FOOD.id,
          amountCents: 20_000,
          carryover: true,
        },
      ],
    });

    for (const month of months) {
      expect(month.readyToAssignCents + month.totalBalanceCents).toBe(
        positionAfter(months, openingCents, month.month) - month.bufferedCents,
      );
    }
  });
});

describe("buildBudget — current-month pool reconciliation", () => {
  it("subtracts later-month assignments from current Ready to Assign", () => {
    // Assigning $200 into September leaves August's leftover $100, and both months
    // show that same leftover once September has no income of its own.
    const months = build({
      openingCents: 300_000,
      allocations: [
        {
          month: "2026-09-01",
          categoryId: RENT.id,
          amountCents: 200_000,
          carryover: false,
        },
      ],
      current: {
        month: "2026-08-01",
        accountPoolCents: 300_000,
        uncategorizedActivityCents: 0,
      },
    });

    const august = findMonth(months, "2026-08-01")!;
    const september = findMonth(months, "2026-09-01")!;
    expect(august.assignedInFutureMonthsCents).toBe(200_000);
    expect(august.readyToAssignCents).toBe(100_000);
    expect(september.readyToAssignCents).toBe(100_000);
    expect(august.readyToAssignCents).toBe(september.readyToAssignCents);
    expect(
      august.readyToAssignCents +
        august.totalBalanceCents +
        august.bufferedCents +
        august.assignedInFutureMonthsCents,
    ).toBe(300_000);
    expect(
      august.terms.some((term) => term.label === "Assigned in future months"),
    ).toBe(true);
    expect(august.terms.reduce((sum, term) => sum + term.cents, 0)).toBe(
      august.readyToAssignCents,
    );
  });

  it("does not rewrite a past month's Ready to Assign when a later month is assigned", () => {
    const months = build({
      openingCents: 300_000,
      allocations: [
        {
          month: "2026-09-01",
          categoryId: RENT.id,
          amountCents: 200_000,
          carryover: false,
        },
      ],
      current: {
        month: "2026-09-01",
        accountPoolCents: 300_000,
        uncategorizedActivityCents: 0,
      },
    });

    const august = findMonth(months, "2026-08-01")!;
    const september = findMonth(months, "2026-09-01")!;
    expect(august.assignedInFutureMonthsCents).toBe(0);
    expect(august.readyToAssignCents).toBe(300_000);
    expect(september.assignedInFutureMonthsCents).toBe(0);
    expect(september.readyToAssignCents).toBe(100_000);
  });

  it("makes Ready to Assign + envelopes + held equal the account pool", () => {
    const months = build({
      openingCents: 100_000,
      allocations: [
        {
          month: "2026-08-01",
          categoryId: FOOD.id,
          amountCents: 40_000,
          carryover: false,
        },
      ],
      activity: [{ month: "2026-08-01", categoryId: FOOD.id, amountCents: -10_000 }],
      buffered: [{ month: "2026-08-01", bufferedCents: 5_000 }],
      current: {
        month: "2026-08-01",
        accountPoolCents: 200_000,
        uncategorizedActivityCents: 0,
      },
    });

    const august = findMonth(months, "2026-08-01")!;
    expect(
      august.readyToAssignCents +
        august.totalBalanceCents +
        august.bufferedCents +
        august.assignedInFutureMonthsCents,
    ).toBe(200_000);
    expect(august.terms.reduce((sum, term) => sum + term.cents, 0)).toBe(
      august.readyToAssignCents,
    );
  });

  it("names uncategorized activity separately from account reconciliation", () => {
    const months = build({
      openingCents: 100_000,
      current: {
        month: "2026-08-01",
        accountPoolCents: 125_000,
        uncategorizedActivityCents: -15_000,
      },
    });

    const august = findMonth(months, "2026-08-01")!;
    expect(august.uncategorizedActivityCents).toBe(-15_000);
    // Pool 125_000 − (base 100_000 + envelopes 0 + held 0 + uncategorized −15_000) = 40_000.
    expect(august.accountReconciliationCents).toBe(40_000);
    expect(august.readyToAssignCents).toBe(125_000);
    expect(august.terms.map((term) => term.label)).toEqual([
      "Funds from last month",
      "Income this month",
      "Overspent last month",
      "Assigned",
      "Held for next month",
      "Uncategorized activity",
      "Account reconciliation",
    ]);
  });

  it("moves categorized activity into the envelope without breaking the identity", () => {
    const pool = 80_000;
    const uncategorized = build({
      openingCents: 80_000,
      current: {
        month: "2026-08-01",
        accountPoolCents: pool,
        uncategorizedActivityCents: -20_000,
      },
    });
    const categorized = build({
      openingCents: 80_000,
      activity: [{ month: "2026-08-01", categoryId: FOOD.id, amountCents: -20_000 }],
      current: {
        month: "2026-08-01",
        accountPoolCents: pool,
        uncategorizedActivityCents: 0,
      },
    });

    const before = findMonth(uncategorized, "2026-08-01")!;
    const after = findMonth(categorized, "2026-08-01")!;
    expect(before.uncategorizedActivityCents).toBe(-20_000);
    expect(after.uncategorizedActivityCents).toBe(0);
    expect(after.totalBalanceCents).toBe(-20_000);
    expect(before.readyToAssignCents + before.totalBalanceCents).toBe(pool);
    expect(after.readyToAssignCents + after.totalBalanceCents).toBe(pool);
  });

  it("leaves a past month's Ready to Assign historical and carries the reconciled amount forward", () => {
    const months = build({
      openingCents: 50_000,
      current: {
        month: "2026-09-01",
        accountPoolCents: 90_000,
        uncategorizedActivityCents: 0,
      },
    });

    const august = findMonth(months, "2026-08-01")!;
    const september = findMonth(months, "2026-09-01")!;
    const october = findMonth(months, "2026-10-01")!;
    expect(august.readyToAssignCents).toBe(50_000);
    expect(august.accountReconciliationCents).toBe(0);
    expect(august.terms).toHaveLength(5);
    expect(september.readyToAssignCents).toBe(90_000);
    expect(october.fromLastMonthCents).toBe(90_000);
    expect(october.readyToAssignCents).toBe(90_000);
  });

  it("keeps signed card debt in the pool rather than taking its absolute value", () => {
    const months = build({
      openingCents: 10_000,
      current: {
        month: "2026-08-01",
        accountPoolCents: -25_000,
        uncategorizedActivityCents: 0,
      },
    });
    const august = findMonth(months, "2026-08-01")!;
    expect(august.readyToAssignCents).toBe(-25_000);
    expect(august.readyToAssignCents + august.totalBalanceCents).toBe(-25_000);
  });
});

describe("buildBudget — sparse and defensive", () => {
  it("treats a missing allocation as zero and not as null", () => {
    // Trap 4. Nothing pre-creates rows, so most month/envelope pairs are absent, and reading
    // absence as anything but {0, false} breaks the ordinary case rather than an edge one.
    const months = build({ openingCents: 10_000 });
    expect(at(months, "2026-09-01", FOOD.id)).toEqual({
      categoryId: FOOD.id,
      assignedCents: 0,
      activityCents: 0,
      balanceCents: 0,
      carryover: false,
    });
  });

  it("starts an envelope created mid-stream at zero rather than inheriting anything", () => {
    const months = buildBudget({
      categories: [FOOD, RENT, PAY],
      allocations: [
        {
          month: "2026-09-01",
          categoryId: RENT.id,
          amountCents: 30_000,
          carryover: false,
        },
      ],
      activity: [],
      buffered: [],
      startMonth: "2026-08-01",
      endMonth: "2026-10-01",
      openingCents: 50_000,
    });
    expect(at(months, "2026-08-01", RENT.id).balanceCents).toBe(0);
    expect(at(months, "2026-09-01", RENT.id).balanceCents).toBe(30_000);
  });

  it("drops activity naming an envelope that no longer exists", () => {
    // The FK goes null on delete, so this is only ever stale input — and inventing a row for
    // it would put money in the budget that no envelope can spend.
    const months = build({
      openingCents: 0,
      activity: [{ month: "2026-08-01", categoryId: "deleted", amountCents: -5_000 }],
    });
    const august = findMonth(months, "2026-08-01");
    expect(august?.categories.deleted).toBeUndefined();
    expect(august?.totalActivityCents).toBe(0);
  });

  it("sums two activity rows for the same envelope and month", () => {
    const months = build({
      openingCents: 0,
      activity: [
        { month: "2026-08-01", categoryId: FOOD.id, amountCents: -3_000 },
        { month: "2026-08-01", categoryId: FOOD.id, amountCents: -4_500 },
      ],
    });
    expect(at(months, "2026-08-01", FOOD.id).activityCents).toBe(-7_500);
  });

  it("refuses fractional cents anywhere they could enter", () => {
    // Trap 5. Actual's safeNumber throws for the same reason: a fraction here is invisible
    // until it has been rounded differently in two places on the same screen.
    expect(() => build({ openingCents: 100.5 })).toThrow(/integer cents/);
    expect(() =>
      build({
        allocations: [
          {
            month: "2026-08-01",
            categoryId: FOOD.id,
            amountCents: 10.25,
            carryover: false,
          },
        ],
      }),
    ).toThrow(/integer cents/);
    expect(() =>
      build({
        activity: [{ month: "2026-08-01", categoryId: FOOD.id, amountCents: -0.5 }],
      }),
    ).toThrow(/integer cents/);
    expect(() =>
      build({ buffered: [{ month: "2026-08-01", bufferedCents: 1.5 }] }),
    ).toThrow(/integer cents/);
  });

  it("returns nothing when the horizon precedes the start", () => {
    expect(build({ startMonth: "2026-10-01", endMonth: "2026-08-01" })).toEqual([]);
    expect(findMonth([], "2026-08-01")).toBeNull();
  });
});
