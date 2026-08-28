import { describe, expect, it } from "vitest";

import type { BillSnapshot } from "../templates/schedule";
import type { Template } from "../templates/types";
import {
  planAssign,
  neededAssigned,
  needsAssignPreview,
  underfundedGapCents,
} from "./plan";
import type { AssignEnvelope, AssignHistoryMonth } from "./types";

const MONTH = "2026-08-01";
const TODAY = "2026-08-24";

const simple = (cents: number, id = "s1"): Template => ({
  id,
  directive: "template",
  type: "simple",
  priority: 0,
  monthlyCents: cents,
});

const by = (cents: number, month: string, id = "b1"): Template => ({
  id,
  directive: "template",
  type: "by",
  priority: 0,
  amountCents: cents,
  month,
});

const weekly = (cents: number, weekday: number, id = "w1"): Template => ({
  id,
  directive: "template",
  type: "weekly",
  priority: 0,
  amountCents: cents,
  weekday,
});

const remainder = (weight = 1, id = "r1"): Template => ({
  id,
  directive: "template",
  type: "remainder",
  priority: null,
  weight,
});

function envelope(overrides: Partial<AssignEnvelope> = {}): AssignEnvelope {
  return {
    id: "food",
    name: "Groceries",
    kind: "spending",
    hidden: false,
    status: "active",
    templates: [simple(50_000)],
    assignedCents: 0,
    activityCents: 0,
    balanceCents: 0,
    carryInCents: 0,
    nextDueKey: null,
    ...overrides,
  };
}

function bill(overrides: Partial<AssignEnvelope> = {}): AssignEnvelope {
  return envelope({
    id: "rent",
    name: "Rent",
    kind: "bill",
    templates: [],
    nextDueKey: "2026-08-01",
    ...overrides,
  });
}

function snapshot(id: string, expectedCents: number, nextDueKey: string): BillSnapshot {
  return {
    id,
    name: id,
    cadenceMonths: 1,
    cadenceDays: null,
    expectedCents,
    nextDueKey,
  };
}

function run(
  option: Parameters<typeof planAssign>[0]["option"],
  envelopes: AssignEnvelope[],
  extra: Partial<Parameters<typeof planAssign>[0]> = {},
) {
  const defaultBills = new Map(
    envelopes
      .filter((row) => row.kind === "bill" && row.nextDueKey)
      .map((row) => [row.id, snapshot(row.id, 210_000, row.nextDueKey!)]),
  );
  return planAssign({
    option,
    month: MONTH,
    todayKey: TODAY,
    readyToAssignCents: 1_000_000,
    envelopes,
    history: [],
    ...extra,
    bills: extra.bills ?? defaultBills,
  });
}

describe("Underfunded", () => {
  it("never drives Ready to Assign negative; last funded envelope may be partial", () => {
    const rent = bill({ assignedCents: 0, balanceCents: 0 });
    const food = envelope({ assignedCents: 0 });
    const result = run("underfunded", [rent, food], {
      readyToAssignCents: 30_000,
      bills: new Map([["rent", snapshot("rent", 210_000, "2026-08-01")]]),
    });
    expect(result.remainingRtaCents).toBe(0);
    expect(result.shortfall).toBe(true);
    const rentLine = result.lines.find((line) => line.categoryId === "rent");
    expect(rentLine?.status).toBe("partial");
    expect(rentLine?.deltaCents).toBe(30_000);
    const foodLine = result.lines.find((line) => line.categoryId === "food");
    expect(foodLine?.status).toBe("skipped");
    expect(foodLine?.deltaCents).toBe(0);
    expect(foodLine?.fromAssignedCents).toBe(0);
  });

  it("leaves unfunded envelopes at their previous Assigned, not zero", () => {
    const food = envelope({ assignedCents: 12_000 });
    const result = run("underfunded", [bill(), food], {
      readyToAssignCents: 5_000,
      bills: new Map([["rent", snapshot("rent", 210_000, "2026-08-01")]]),
    });
    const foodLine = result.lines.find((line) => line.categoryId === "food");
    expect(foodLine?.toAssignedCents).toBe(12_000);
    expect(
      result.allocations.some(
        (row) => row.categoryId === "food" && row.amountCents !== 12_000,
      ),
    ).toBe(false);
  });

  it("covers overspend before a due-date bill", () => {
    const overspent = envelope({
      id: "fun",
      name: "Fun",
      templates: [],
      assignedCents: 0,
      activityCents: -10_000,
      balanceCents: -10_000,
    });
    const rent = bill();
    const result = run("underfunded", [rent, overspent], {
      readyToAssignCents: 10_000,
      bills: new Map([["rent", snapshot("rent", 210_000, "2026-08-01")]]),
    });
    expect(result.lines[0]?.categoryId).toBe("fun");
    expect(result.lines[0]?.deltaCents).toBe(10_000);
    expect(result.lines[0]?.status).toBe("full");
    expect(result.lines.find((line) => line.categoryId === "rent")?.status).toBe(
      "skipped",
    );
  });

  it("counts a remaining underfunded ask without planning an assign", () => {
    const rent = bill({ nextDueKey: "2026-08-01" });
    const bills = new Map([["rent", snapshot("rent", 210_000, "2026-08-01")]]);
    expect(underfundedGapCents(MONTH, [rent], bills)).toBe(210_000);
    expect(
      underfundedGapCents(
        MONTH,
        [bill({ nextDueKey: "2026-09-01" })],
        new Map([["rent", snapshot("rent", 210_000, "2026-09-01")]]),
      ),
    ).toBe(0);
  });

  it("does not underfund this month with half of next month's monthly bill", () => {
    const rent = bill({ nextDueKey: "2026-09-01" });
    const result = run("underfunded", [rent], {
      bills: new Map([["rent", snapshot("rent", 210_000, "2026-09-01")]]),
    });
    expect(result.lines).toEqual([]);
  });

  it("funds a monthly bill in full when assigning the month it is due", () => {
    const rent = bill({ nextDueKey: "2026-09-01" });
    const result = run("underfunded", [rent], {
      month: "2026-09-01",
      bills: new Map([["rent", snapshot("rent", 210_000, "2026-09-01")]]),
    });
    expect(result.lines).toEqual([
      expect.objectContaining({
        categoryId: "rent",
        deltaCents: 210_000,
        status: "full",
      }),
    ]);
  });

  it("funds a bill with empty templates from its cadence", () => {
    const result = run("underfunded", [bill()], {
      readyToAssignCents: 210_000,
      bills: new Map([["rent", snapshot("rent", 210_000, "2026-08-01")]]),
    });
    expect(result.lines).toEqual([
      expect.objectContaining({
        categoryId: "rent",
        deltaCents: 210_000,
        status: "full",
      }),
    ]);
  });

  it("skips paused and cancelled bills, income, and hidden envelopes on an all-run", () => {
    const result = run("underfunded", [
      bill({ id: "paused", name: "Paused", status: "paused" }),
      bill({ id: "gone", name: "Gone", status: "cancelled" }),
      envelope({ id: "pay", name: "Pay", kind: "income", templates: [] }),
      envelope({ id: "old", name: "Old", hidden: true }),
      envelope(),
    ]);
    expect(result.lines.map((line) => line.categoryId)).toEqual(["food"]);
  });

  it("includes a hidden envelope when it is selected", () => {
    const hidden = envelope({ id: "old", name: "Old", hidden: true });
    const result = run("underfunded", [hidden], { categoryIds: ["old"] });
    expect(result.lines[0]?.categoryId).toBe("old");
  });

  it("orders bills by due date, then by-templates by target month, then simple monthly", () => {
    const laterBill = bill({
      id: "geico",
      name: "Geico",
      nextDueKey: "2026-09-15",
    });
    const soonerBill = bill({
      id: "rent",
      name: "Rent",
      nextDueKey: "2026-08-01",
    });
    const saveBy = envelope({
      id: "house",
      name: "House",
      templates: [by(1_200_000, "2026-12")],
    });
    const groceries = envelope();
    const result = run("underfunded", [groceries, saveBy, laterBill, soonerBill], {
      readyToAssignCents: 1,
      bills: new Map([
        ["geico", { ...snapshot("geico", 100_000, "2026-09-15"), cadenceMonths: 6 }],
        ["rent", snapshot("rent", 210_000, "2026-08-01")],
      ]),
    });
    expect(result.lines.map((line) => line.categoryId)).toEqual([
      "rent",
      "geico",
      "house",
      "food",
    ]);
    expect(result.lines[0]?.status).toBe("partial");
    expect(result.lines.slice(1).every((line) => line.status === "skipped")).toBe(true);
  });

  it("remainder only gets leftover Ready to Assign and never goes negative", () => {
    const save = envelope({
      id: "save",
      name: "Savings",
      kind: "savings",
      templates: [remainder()],
    });
    const result = run("underfunded", [envelope(), save], {
      readyToAssignCents: 80_000,
    });
    expect(result.lines.find((line) => line.categoryId === "food")?.deltaCents).toBe(
      50_000,
    );
    expect(result.lines.find((line) => line.categoryId === "save")?.deltaCents).toBe(
      30_000,
    );
    expect(result.remainingRtaCents).toBe(0);

    const short = run("underfunded", [envelope(), save], {
      readyToAssignCents: 40_000,
    });
    expect(short.lines.find((line) => line.categoryId === "save")).toBeUndefined();
    expect(short.remainingRtaCents).toBe(0);
  });

  it("writes goalCents as the full unclamped ask on a partial Underfunded", () => {
    const result = run("underfunded", [envelope()], { readyToAssignCents: 10_000 });
    expect(result.allocations[0]).toEqual({
      categoryId: "food",
      amountCents: 10_000,
      goalCents: 50_000,
    });
  });

  it("does not write allocations for skipped envelopes", () => {
    const result = run(
      "underfunded",
      [envelope(), envelope({ id: "fun", name: "Fun" })],
      {
        readyToAssignCents: 10_000,
      },
    );
    expect(result.allocations.map((row) => row.categoryId)).toEqual(["food"]);
    expect(result.lines.find((line) => line.categoryId === "fun")?.status).toBe(
      "skipped",
    );
  });
});

describe("neededAssigned", () => {
  it("covers overspend even when the template ask is smaller", () => {
    const overspent = envelope({
      templates: [simple(10_000)],
      assignedCents: 0,
      activityCents: -40_000,
      balanceCents: -40_000,
    });
    expect(neededAssigned(overspent, MONTH, new Map()).needed).toBe(40_000);
  });
});

describe("weekly templates through Underfunded", () => {
  /** Sunday groceries at $180: August 2026 has five Sundays, September four. */
  const groceries = (over: Partial<AssignEnvelope> = {}) =>
    envelope({ templates: [weekly(18_000, 0)], ...over });

  it("asks the calendar's occurrence count, not a fixed four", () => {
    expect(neededAssigned(groceries(), "2026-08-01", new Map()).needed).toBe(90_000);
    expect(neededAssigned(groceries(), "2026-09-01", new Map()).needed).toBe(72_000);
  });

  it("tops up mid-month to the whole month's total", () => {
    const result = run("underfunded", [groceries({ assignedCents: 36_000 })]);
    expect(result.lines[0]?.deltaCents).toBe(54_000);
    expect(result.lines[0]?.toAssignedCents).toBe(90_000);
  });

  it("does not let carry-in reduce the ask (D3)", () => {
    const withCarry = groceries({ carryInCents: 50_000, balanceCents: 50_000 });
    expect(neededAssigned(withCarry, "2026-08-01", new Map()).needed).toBe(90_000);
    const result = run("underfunded", [withCarry]);
    expect(result.lines[0]?.deltaCents).toBe(90_000);
  });

  it("ranks alongside a simple line, ahead of an envelope with no ask", () => {
    const spare = envelope({ id: "fun", name: "Fun", templates: [remainder()] });
    const result = run("underfunded", [spare, groceries()], {
      readyToAssignCents: 90_000,
    });
    expect(result.lines[0]?.categoryId).toBe("food");
  });
});

describe("SET options", () => {
  const july: AssignHistoryMonth = {
    month: "2026-07-01",
    assigned: { food: 40_000, rent: 210_000 },
    activity: { food: -35_000, rent: -210_000 },
  };
  const august: AssignHistoryMonth = {
    month: MONTH,
    assigned: { food: 10_000, rent: 0 },
    activity: { food: 0, rent: 0 },
  };

  it("Assigned Last Month SETs Assigned, reduces first, then clamps increases", () => {
    const food = envelope({ assignedCents: 80_000 });
    const rent = bill({ assignedCents: 0 });
    const result = run("assigned-last-month", [food, rent], {
      readyToAssignCents: 50_000,
      history: [july, august],
      bills: new Map([["rent", snapshot("rent", 210_000, "2026-08-01")]]),
    });
    const foodLine = result.lines.find((line) => line.categoryId === "food");
    expect(foodLine).toEqual(
      expect.objectContaining({
        fromAssignedCents: 80_000,
        toAssignedCents: 40_000,
        status: "reduced",
      }),
    );
    const rentLine = result.lines.find((line) => line.categoryId === "rent");
    expect(rentLine?.toAssignedCents).toBe(90_000);
    expect(rentLine?.status).toBe("partial");
    expect(result.remainingRtaCents).toBe(0);
  });

  it("Spent Last Month uses max(0, −activity)", () => {
    const food = envelope({ assignedCents: 0 });
    const result = run("spent-last-month", [food], {
      history: [july, august],
    });
    expect(result.lines[0]?.toAssignedCents).toBe(35_000);
  });

  it("averages up to 12 prior months and starts at first non-zero, no leading zeroes", () => {
    const history: AssignHistoryMonth[] = [];
    for (let month = 1; month <= 8; month += 1) {
      const key = `2026-${String(month).padStart(2, "0")}-01`;
      history.push({
        month: key,
        assigned: month >= 6 ? { food: 30_000 } : { food: 0 },
        activity: month >= 6 ? { food: -12_000 } : { food: 0 },
      });
    }
    const food = envelope({ assignedCents: 0 });
    const assigned = run("average-assigned", [food], { history });
    expect(assigned.lines[0]?.toAssignedCents).toBe(30_000);

    const spent = run("average-spent", [food], { history });
    expect(spent.lines[0]?.toAssignedCents).toBe(12_000);
  });
});

describe("return-money options", () => {
  it("Reduce Overfunding returns only demand-envelope excess", () => {
    const over = envelope({ assignedCents: 80_000, templates: [simple(50_000)] });
    const pile = envelope({
      id: "save",
      name: "Savings",
      kind: "savings",
      templates: [],
      assignedCents: 500_000,
    });
    const result = run("reduce-overfunding", [over, pile]);
    expect(result.lines.map((line) => line.categoryId)).toEqual(["food"]);
    expect(result.lines[0]?.toAssignedCents).toBe(50_000);
    expect(result.remainingRtaCents).toBe(1_000_000 + 30_000);
  });

  it("Reset Available may write a negative Assigned so Available is $0", () => {
    const food = envelope({
      assignedCents: 20_000,
      activityCents: -5_000,
      carryInCents: 10_000,
      balanceCents: 25_000,
    });
    const result = run("reset-available", [food]);
    // assigned + activity + carryIn = 0 → assigned = 5_000 - 10_000 = -5_000
    expect(result.lines[0]?.toAssignedCents).toBe(-5_000);
  });

  it("Reset Assigned zeroes Assigned", () => {
    const food = envelope({ assignedCents: 12_000 });
    const result = run("reset-assigned", [food]);
    expect(result.lines[0]?.toAssignedCents).toBe(0);
    expect(result.remainingRtaCents).toBe(1_000_000 + 12_000);
  });
});

describe("needsAssignPreview", () => {
  it("skips confirmation when one envelope is fully funded", () => {
    const result = run("underfunded", [envelope()], { readyToAssignCents: 50_000 });
    expect(result.lines).toEqual([
      expect.objectContaining({
        categoryId: "food",
        status: "full",
        deltaCents: 50_000,
      }),
    ]);
    expect(needsAssignPreview(result)).toBe(false);
  });

  it("keeps confirmation when Ready to Assign cannot cover the ask", () => {
    const result = run("underfunded", [envelope()], { readyToAssignCents: 10_000 });
    expect(result.shortfall).toBe(true);
    expect(result.lines[0]?.status).toBe("partial");
    expect(needsAssignPreview(result)).toBe(true);
  });

  it("keeps confirmation when more than one envelope would change", () => {
    const result = run("underfunded", [bill(), envelope()], {
      readyToAssignCents: 1_000_000,
      bills: new Map([["rent", snapshot("rent", 210_000, "2026-08-01")]]),
    });
    expect(result.lines.length).toBeGreaterThan(1);
    expect(result.shortfall).toBe(false);
    expect(needsAssignPreview(result)).toBe(true);
  });

  it("keeps confirmation when the option returns money", () => {
    const result = run("reduce-overfunding", [
      envelope({ assignedCents: 80_000, templates: [simple(50_000)] }),
    ]);
    expect(result.lines[0]?.status).toBe("reduced");
    expect(needsAssignPreview(result)).toBe(true);
  });

  it("keeps confirmation when there is nothing to write", () => {
    const result = run("underfunded", [envelope({ assignedCents: 50_000 })]);
    expect(result.allocations).toEqual([]);
    expect(needsAssignPreview(result)).toBe(true);
  });
});
