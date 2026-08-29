import { describe, expect, it } from "vitest";

import { buildBudget, findMonth, type BudgetMonth } from "./envelope";
import {
  assignFromReadyToAssign,
  copyPreviousMonth,
  coverOverspending,
  holdForNextMonth,
  isEmptyEdit,
  NO_EDIT,
  releaseHold,
  setAssignment,
  setToAverage,
  setZero,
  transferBetweenCategories,
  type BudgetEdit,
} from "./operations";

const FOOD = { id: "food", name: "Groceries" };
const FUN = { id: "fun", name: "Dining" };
const RENT = { id: "rent", name: "Rent" };
const TODAY = "2026-08-22";

const CATEGORIES = [
  { id: FOOD.id, groupId: "spending", isIncome: false },
  { id: FUN.id, groupId: "spending", isIncome: false },
  { id: RENT.id, groupId: "spending", isIncome: false },
  { id: "pay", groupId: "income", isIncome: true },
];

type Cell = {
  month: string;
  categoryId: string;
  amountCents: number;
  carryover?: boolean;
};

function ledger(options: {
  openingCents?: number;
  allocations?: Cell[];
  activity?: Cell[];
  buffered?: { month: string; bufferedCents: number }[];
  endMonth?: string;
}): BudgetMonth[] {
  return buildBudget({
    categories: CATEGORIES,
    allocations: (options.allocations ?? []).map((row) => ({
      month: row.month,
      categoryId: row.categoryId,
      amountCents: row.amountCents,
      carryover: row.carryover ?? false,
      snoozed: false,
    })),
    activity: options.activity ?? [],
    buffered: options.buffered ?? [],
    startMonth: "2026-06-01",
    endMonth: options.endMonth ?? "2026-09-01",
    openingCents: options.openingCents ?? 0,
  });
}

function month(months: BudgetMonth[], key = "2026-08-01"): BudgetMonth {
  const found = findMonth(months, key);
  if (!found) throw new Error(`no month ${key}`);
  return found;
}

/** Re-fold with an edit applied, so an operation is judged by the numbers it produces. */
function apply(
  months: BudgetMonth[],
  edit: BudgetEdit,
  base: Parameters<typeof ledger>[0],
) {
  const allocations = new Map<string, Cell>();
  for (const row of base.allocations ?? []) {
    allocations.set(`${row.month}|${row.categoryId}`, row);
  }
  for (const write of edit.allocations) {
    const at = `${write.month}|${write.categoryId}`;
    allocations.set(at, {
      ...write,
      carryover: allocations.get(at)?.carryover ?? false,
    });
  }
  const buffered = [...(base.buffered ?? [])].filter(
    (row) => row.month !== edit.buffered?.month,
  );
  if (edit.buffered) buffered.push(edit.buffered);

  return ledger({ ...base, allocations: [...allocations.values()], buffered });
}

describe("coverOverspending", () => {
  const base = {
    openingCents: 200_000,
    allocations: [
      { month: "2026-08-01", categoryId: FOOD.id, amountCents: 20_000 },
      { month: "2026-08-01", categoryId: FUN.id, amountCents: 50_000 },
    ],
    activity: [{ month: "2026-08-01", categoryId: FOOD.id, amountCents: -35_000 }],
  };

  it("moves exactly what is owed when the source can afford it", () => {
    const months = ledger(base);
    const edit = coverOverspending({
      month: month(months),
      from: FUN,
      to: FOOD,
      todayKey: TODAY,
    });

    expect(edit.allocations).toEqual([
      { month: "2026-08-01", categoryId: FUN.id, amountCents: 35_000 },
      { month: "2026-08-01", categoryId: FOOD.id, amountCents: 35_000 },
    ]);
    expect(edit.note).toBe("Covered $150.00 of Groceries from Dining on August 22");

    const after = month(apply(months, edit, base));
    expect(after.categories[FOOD.id]?.balanceCents).toBe(0);
    expect(after.categories[FUN.id]?.balanceCents).toBe(35_000);
    // A move between envelopes changes nothing outside them.
    expect(after.readyToAssignCents).toBe(month(months).readyToAssignCents);
  });

  it("takes only what the source holds when it cannot afford the whole hole", () => {
    const base2 = {
      ...base,
      allocations: [
        { month: "2026-08-01", categoryId: FOOD.id, amountCents: 20_000 },
        { month: "2026-08-01", categoryId: FUN.id, amountCents: 6_000 },
      ],
    };
    const months = ledger(base2);
    const edit = coverOverspending({
      month: month(months),
      from: FUN,
      to: FOOD,
      todayKey: TODAY,
    });

    const after = month(apply(months, edit, base2));
    expect(after.categories[FUN.id]?.balanceCents).toBe(0);
    // Still short, and visibly so, rather than the shortfall moving to the donor.
    expect(after.categories[FOOD.id]?.balanceCents).toBe(-9_000);
  });

  it("does nothing when the target is not overspent or the source is empty", () => {
    const months = ledger(base);
    expect(
      coverOverspending({ month: month(months), from: FOOD, to: FUN, todayKey: TODAY }),
    ).toEqual(NO_EDIT);
    expect(
      coverOverspending({
        month: month(months),
        from: RENT,
        to: FOOD,
        todayKey: TODAY,
      }),
    ).toEqual(NO_EDIT);
  });

  it("covers from Ready to Assign without debiting an envelope", () => {
    const months = ledger(base);
    const edit = coverOverspending({
      month: month(months),
      from: null,
      to: FOOD,
      todayKey: TODAY,
    });
    expect(edit.allocations).toEqual([
      { month: "2026-08-01", categoryId: FOOD.id, amountCents: 35_000 },
    ]);
    expect(edit.note).toContain("from Ready to Assign");
  });

  it("refuses to cover from a negative Ready to Assign", () => {
    // Being over-assigned is already the problem; it is not also a source of funds.
    const base2 = { ...base, openingCents: 0 };
    const months = ledger(base2);
    expect(month(months).readyToAssignCents).toBeLessThan(0);
    expect(
      coverOverspending({
        month: month(months),
        from: null,
        to: FOOD,
        todayKey: TODAY,
      }),
    ).toEqual(NO_EDIT);
  });
});

describe("transferBetweenCategories", () => {
  const base = {
    openingCents: 200_000,
    allocations: [
      { month: "2026-08-01", categoryId: FOOD.id, amountCents: 40_000 },
      { month: "2026-08-01", categoryId: FUN.id, amountCents: 10_000 },
    ],
  };

  it("moves money and leaves the rest of the budget alone", () => {
    const months = ledger(base);
    const before = month(months);
    const edit = transferBetweenCategories({
      month: before,
      from: FOOD,
      to: FUN,
      amountCents: 15_000,
      todayKey: TODAY,
    });
    expect(edit.note).toBe("Reassigned $150.00 from Groceries → Dining on August 22");

    const after = month(apply(months, edit, base));
    expect(after.categories[FOOD.id]?.balanceCents).toBe(25_000);
    expect(after.categories[FUN.id]?.balanceCents).toBe(25_000);
    expect(after.readyToAssignCents).toBe(before.readyToAssignCents);
    expect(after.totalAssignedCents).toBe(before.totalAssignedCents);
  });

  it("clamps at the source balance rather than digging a second hole", () => {
    const months = ledger(base);
    const edit = transferBetweenCategories({
      month: month(months),
      from: FUN,
      to: FOOD,
      amountCents: 999_999,
      todayKey: TODAY,
    });
    const after = month(apply(months, edit, base));
    expect(after.categories[FUN.id]?.balanceCents).toBe(0);
    expect(after.categories[FOOD.id]?.balanceCents).toBe(50_000);
  });

  it("does nothing for a non-positive amount, an empty source, or a self-transfer", () => {
    const months = ledger(base);
    const from = month(months);
    expect(
      transferBetweenCategories({
        month: from,
        from: FOOD,
        to: FUN,
        amountCents: 0,
        todayKey: TODAY,
      }),
    ).toEqual(NO_EDIT);
    expect(
      transferBetweenCategories({
        month: from,
        from: FOOD,
        to: FUN,
        amountCents: -5_000,
        todayKey: TODAY,
      }),
    ).toEqual(NO_EDIT);
    expect(
      transferBetweenCategories({
        month: from,
        from: RENT,
        to: FUN,
        amountCents: 5_000,
        todayKey: TODAY,
      }),
    ).toEqual(NO_EDIT);
    expect(
      transferBetweenCategories({
        month: from,
        from: FOOD,
        to: FOOD,
        amountCents: 5_000,
        todayKey: TODAY,
      }),
    ).toEqual(NO_EDIT);
  });
});

describe("assignFromReadyToAssign", () => {
  const base = { openingCents: 100_000 };

  it("clamps to what is actually available", () => {
    // The one rule zero-based budgeting has, so the one rule the code refuses to bend.
    const months = ledger(base);
    const edit = assignFromReadyToAssign({
      month: month(months),
      to: FOOD,
      amountCents: 250_000,
      todayKey: TODAY,
    });
    expect(edit.allocations).toEqual([
      { month: "2026-08-01", categoryId: FOOD.id, amountCents: 100_000 },
    ]);
    expect(month(apply(months, edit, base)).readyToAssignCents).toBe(0);
  });

  it("assigns everything left when no amount is given", () => {
    const months = ledger(base);
    const edit = assignFromReadyToAssign({
      month: month(months),
      to: FOOD,
      amountCents: null,
      todayKey: TODAY,
    });
    expect(edit.allocations[0]?.amountCents).toBe(100_000);
    expect(edit.note).toBe("Assigned $1,000.00 to Groceries on August 22");
  });

  it("adds to what the envelope already has", () => {
    const base2 = {
      openingCents: 100_000,
      allocations: [{ month: "2026-08-01", categoryId: FOOD.id, amountCents: 30_000 }],
    };
    const months = ledger(base2);
    const edit = assignFromReadyToAssign({
      month: month(months),
      to: FOOD,
      amountCents: 20_000,
      todayKey: TODAY,
    });
    expect(edit.allocations[0]?.amountCents).toBe(50_000);
  });

  it("does nothing when there is nothing to assign", () => {
    const months = ledger({ openingCents: -5_000 });
    expect(
      assignFromReadyToAssign({
        month: month(months),
        to: FOOD,
        amountCents: null,
        todayKey: TODAY,
      }),
    ).toEqual(NO_EDIT);
  });
});

describe("setAssignment", () => {
  it("names the direction it moved", () => {
    const base = {
      openingCents: 100_000,
      allocations: [{ month: "2026-08-01", categoryId: FOOD.id, amountCents: 30_000 }],
    };
    const months = ledger(base);
    expect(
      setAssignment({
        month: month(months),
        category: FOOD,
        amountCents: 45_000,
        todayKey: TODAY,
      }).note,
    ).toBe("Assigned $150.00 to Groceries on August 22");
    expect(
      setAssignment({
        month: month(months),
        category: FOOD,
        amountCents: 10_000,
        todayKey: TODAY,
      }).note,
    ).toBe("Removed $200.00 from Groceries on August 22");
  });

  it("is a no-op when the number has not changed", () => {
    const base = {
      openingCents: 100_000,
      allocations: [{ month: "2026-08-01", categoryId: FOOD.id, amountCents: 30_000 }],
    };
    const months = ledger(base);
    expect(
      setAssignment({
        month: month(months),
        category: FOOD,
        amountCents: 30_000,
        todayKey: TODAY,
      }),
    ).toEqual(NO_EDIT);
  });

  it("allows assigning more than is available, unlike every other operation", () => {
    // Typing a number into the grid is a statement of intent, and the honest response is a
    // negative Ready to Assign in red — not silently entering a different number.
    const base = { openingCents: 10_000 };
    const months = ledger(base);
    const edit = setAssignment({
      month: month(months),
      category: FOOD,
      amountCents: 50_000,
      todayKey: TODAY,
    });
    expect(month(apply(months, edit, base)).readyToAssignCents).toBe(-40_000);
  });
});

describe("holdForNextMonth", () => {
  const base = { openingCents: 100_000 };

  it("holds up to what is left and hands it back next month", () => {
    const months = ledger(base);
    const edit = holdForNextMonth({
      month: month(months),
      amountCents: 40_000,
      todayKey: TODAY,
    });
    expect(edit.buffered).toEqual({ month: "2026-08-01", bufferedCents: 40_000 });
    expect(edit.note).toBe("Held $400.00 for next month on August 22");

    const after = apply(months, edit, base);
    expect(month(after).readyToAssignCents).toBe(60_000);
    expect(month(after, "2026-09-01").fromLastMonthCents).toBe(100_000);
  });

  it("clamps a hold to what Ready to Assign offers", () => {
    const months = ledger(base);
    const edit = holdForNextMonth({
      month: month(months),
      amountCents: 500_000,
      todayKey: TODAY,
    });
    expect(edit.buffered?.bufferedCents).toBe(100_000);
    expect(month(apply(months, edit, base)).readyToAssignCents).toBe(0);
  });

  it("releases no more than is held", () => {
    const base2 = {
      openingCents: 100_000,
      buffered: [{ month: "2026-08-01", bufferedCents: 30_000 }],
    };
    const months = ledger(base2);
    const edit = holdForNextMonth({
      month: month(months),
      amountCents: -90_000,
      todayKey: TODAY,
    });
    expect(edit.buffered).toEqual({ month: "2026-08-01", bufferedCents: 0 });
    expect(edit.note).toBe("Released $300.00 back to Ready to Assign on August 22");
    expect(
      releaseHold({ month: month(months), todayKey: TODAY }).buffered?.bufferedCents,
    ).toBe(0);
  });

  it("cannot hold anything when nothing is left", () => {
    const months = ledger({ openingCents: -1_000 });
    expect(
      holdForNextMonth({ month: month(months), amountCents: 5_000, todayKey: TODAY }),
    ).toEqual(NO_EDIT);
  });
});

describe("copyPreviousMonth", () => {
  it("copies only the envelopes whose number would change", () => {
    const base = {
      openingCents: 500_000,
      allocations: [
        { month: "2026-07-01", categoryId: FOOD.id, amountCents: 40_000 },
        { month: "2026-07-01", categoryId: RENT.id, amountCents: 120_000 },
        { month: "2026-08-01", categoryId: RENT.id, amountCents: 120_000 },
      ],
    };
    const months = ledger(base);
    const edit = copyPreviousMonth({
      month: month(months),
      previous: month(months, "2026-07-01"),
      categories: [FOOD, FUN, RENT],
      todayKey: TODAY,
    });

    expect(edit.allocations).toEqual([
      { month: "2026-08-01", categoryId: FOOD.id, amountCents: 40_000 },
    ]);
    expect(edit.note).toBe("Copied July 2026 assignments on August 22");
  });

  it("does nothing without a previous month", () => {
    const months = ledger({ openingCents: 100_000 });
    expect(
      copyPreviousMonth({
        month: month(months),
        previous: null,
        categories: [FOOD],
        todayKey: TODAY,
      }),
    ).toEqual(NO_EDIT);
  });
});

describe("setToAverage", () => {
  it("averages only from the envelope's first month with activity", () => {
    // Averaging a two-month-old envelope over four months tells you to budget half what it
    // costs, which is the failure mode that makes an average button untrustworthy.
    const base = {
      openingCents: 500_000,
      activity: [
        { month: "2026-07-01", categoryId: FOOD.id, amountCents: -40_000 },
        { month: "2026-08-01", categoryId: FOOD.id, amountCents: -60_000 },
      ],
      endMonth: "2026-09-01",
    };
    const months = ledger(base);
    const edit = setToAverage({
      months,
      month: "2026-09-01",
      lookback: 3,
      categories: [FOOD, FUN],
      todayKey: TODAY,
    });

    // June had no activity, so the window is July and August: (40_000 + 60_000) / 2.
    expect(edit.allocations).toEqual([
      { month: "2026-09-01", categoryId: FOOD.id, amountCents: 50_000 },
    ]);
    expect(edit.note).toBe("Set assignments to the 3-month average on August 22");
  });

  it("skips an envelope with no history rather than budgeting zero for it", () => {
    const months = ledger({ openingCents: 100_000 });
    expect(
      setToAverage({
        months,
        month: "2026-09-01",
        lookback: 3,
        categories: [FUN],
        todayKey: TODAY,
      }),
    ).toEqual(NO_EDIT);
  });

  it("never proposes a negative assignment from net refunds", () => {
    // A month of net refunds averages to a negative spend. Storing that is coherent — it is
    // how you pull money back out — but it is not what an "average" button can mean, so the
    // clamp writes zero rather than the negative it computed.
    const months = ledger({
      openingCents: 100_000,
      allocations: [{ month: "2026-08-01", categoryId: FOOD.id, amountCents: 30_000 }],
      activity: [{ month: "2026-07-01", categoryId: FOOD.id, amountCents: 25_000 }],
    });
    const edit = setToAverage({
      months,
      month: "2026-08-01",
      lookback: 3,
      categories: [FOOD],
      todayKey: TODAY,
    });
    expect(edit.allocations).toEqual([
      { month: "2026-08-01", categoryId: FOOD.id, amountCents: 0 },
    ]);
  });

  it("does nothing at the first month or with a zero lookback", () => {
    const months = ledger({ openingCents: 100_000 });
    expect(
      setToAverage({
        months,
        month: "2026-06-01",
        lookback: 3,
        categories: [FOOD],
        todayKey: TODAY,
      }),
    ).toEqual(NO_EDIT);
    expect(
      setToAverage({
        months,
        month: "2026-08-01",
        lookback: 0,
        categories: [FOOD],
        todayKey: TODAY,
      }),
    ).toEqual(NO_EDIT);
  });
});

describe("setZero", () => {
  it("clears only what is set", () => {
    const base = {
      openingCents: 200_000,
      allocations: [
        { month: "2026-08-01", categoryId: FOOD.id, amountCents: 40_000 },
        { month: "2026-08-01", categoryId: RENT.id, amountCents: 0 },
      ],
    };
    const months = ledger(base);
    const edit = setZero({
      month: month(months),
      categories: [FOOD, FUN, RENT],
      todayKey: TODAY,
    });

    expect(edit.allocations).toEqual([
      { month: "2026-08-01", categoryId: FOOD.id, amountCents: 0 },
    ]);
    expect(month(apply(months, edit, base)).readyToAssignCents).toBe(200_000);
  });

  it("does nothing on an already-empty month", () => {
    const months = ledger({ openingCents: 200_000 });
    const edit = setZero({
      month: month(months),
      categories: [FOOD, FUN],
      todayKey: TODAY,
    });
    expect(edit).toEqual(NO_EDIT);
    expect(isEmptyEdit(edit)).toBe(true);
  });
});
