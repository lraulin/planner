import { describe, expect, it } from "vitest";

import { assignScanInputs } from "./assign/fromBudget";
import { neededAssigned } from "./assign/plan";
import type { AssignEnvelope } from "./assign/types";
import { buildBudget, findMonth } from "./envelope";
import { envelopeIndicator, indicatorsFromAssign } from "./indicator";
import type { BudgetCategoryRow, BudgetGroupRow } from "./queries";
import type { BillSnapshot } from "./targets/derive";
import type { Target } from "./targets/types";

const MONTH = "2026-08-01";

const addMonthly = (cents: number): Target => ({
  behavior: "add",
  cadence: { unit: "month", day: 31 },
  amountCents: cents,
});

const refill = (cents: number): Target => ({
  behavior: "upTo",
  cadence: { unit: "month", day: 31 },
  amountCents: cents,
});

const byDate = (cents: number, month: string): Target => ({
  behavior: "balance",
  cadence: { unit: "by", month },
  amountCents: cents,
});

const yearlyUpTo = (cents: number, month: number): Target => ({
  behavior: "upTo",
  cadence: { unit: "year", month },
  amountCents: cents,
});

const weeklyUpTo = (cents: number, weekday: number): Target => ({
  behavior: "upTo",
  cadence: { unit: "week", weekday },
  amountCents: cents,
});

function envelope(overrides: Partial<AssignEnvelope> = {}): AssignEnvelope {
  return {
    id: "food",
    name: "Groceries",
    kind: "spending",
    hidden: false,
    status: "active",
    target: addMonthly(50_000),
    assignedCents: 0,
    activityCents: 0,
    balanceCents: 0,
    carryInCents: 0,
    snoozed: false,
    nextDueKey: null,
    ...overrides,
  };
}

function billRow(overrides: Partial<AssignEnvelope> = {}): AssignEnvelope {
  return envelope({
    id: "rent",
    name: "Rent",
    kind: "bill",
    target: null,
    nextDueKey: "2026-08-01",
    ...overrides,
  });
}

function snapshot(
  id: string,
  expectedCents: number,
  nextDueKey: string,
  cadenceMonths = 1,
): BillSnapshot {
  return {
    id,
    name: id,
    cadenceMonths,
    cadenceDays: null,
    expectedCents,
    nextDueKey,
  };
}

function indicate(
  row: AssignEnvelope,
  bills: ReadonlyMap<string, BillSnapshot> = new Map(),
) {
  return envelopeIndicator(row, MONTH, bills);
}

describe("envelopeIndicator", () => {
  it("matches Assign's remaining gap for moreNeeded", () => {
    const row = envelope({ assignedCents: 10_000, balanceCents: 10_000 });
    const bills = new Map<string, BillSnapshot>();
    const indicator = indicate(row, bills);
    expect(indicator.moreNeededCents).toBe(
      Math.max(0, neededAssigned(row, MONTH, bills).needed - row.assignedCents),
    );
    expect(indicator.moreNeededCents).toBe(40_000);
  });

  it("stays yellow when Available is positive but the ask is unmet", () => {
    const row = envelope({
      target: refill(2_668),
      carryInCents: 2_001,
      assignedCents: 0,
      balanceCents: 2_001,
    });
    const indicator = indicate(row);
    expect(indicator.state).toBe("underfunded");
    expect(indicator.pill).toBe("yellow");
    expect(indicator.icon).toBe("clock");
    expect(indicator.copy).toBe("$6.67 more needed this month");
    expect(indicator.moreNeededCents).toBe(667);
    expect(indicator.bar?.fill01).toBeGreaterThan(0);
    expect(indicator.bar?.fill01).toBeLessThan(1);
  });

  it("does not treat leftover as funding a simple monthly Assigned ask", () => {
    const row = envelope({
      target: addMonthly(50_000),
      carryInCents: 20_000,
      assignedCents: 0,
      balanceCents: 20_000,
    });
    const indicator = indicate(row);
    expect(indicator.state).toBe("underfunded");
    expect(indicator.moreNeededCents).toBe(50_000);
    expect(indicator.copy).toBe("$500.00 more needed this month");
  });

  it("gives a weekly envelope the this-month horizon, not a sinking one", () => {
    // Five Sundays in August 2026 at $180.
    const row = envelope({
      target: weeklyUpTo(18_000, 0),
      assignedCents: 0,
      balanceCents: 0,
    });
    const indicator = indicate(row);
    expect(indicator.state).toBe("underfunded");
    expect(indicator.copy).toBe("$900.00 more needed this month");
  });

  it("never puts On Track on a simple monthly template", () => {
    const row = envelope({
      assignedCents: 50_000,
      balanceCents: 50_000,
    });
    expect(indicate(row).state).toBe("funded");
    expect(indicate(row).copy).toBe("Funded");
    expect(indicate(row).icon).toBe("check");
  });

  it("shows Funded. Spent $X of $Y when funded leftover remains", () => {
    const row = envelope({
      assignedCents: 50_000,
      activityCents: -20_000,
      balanceCents: 30_000,
    });
    const indicator = indicate(row);
    expect(indicator.state).toBe("funded");
    expect(indicator.copy).toBe("Funded. Spent $200.00 of $500.00");
    expect(indicator.bar?.fill01).toBe(1);
    expect(indicator.bar?.spent01).toBe(0.4);
  });

  it("marks extra above this month's ask as overassigned", () => {
    const row = envelope({
      assignedCents: 70_000,
      balanceCents: 70_000,
    });
    const indicator = indicate(row);
    expect(indicator.state).toBe("overassigned");
    expect(indicator.pill).toBe("green");
    expect(indicator.icon).toBe("extra");
    expect(indicator.copy).toBe("$200.00 extra");
    expect(indicator.moreNeededCents).toBe(0);
    expect(indicator.bar?.fill01).toBe(1);
  });

  it("keeps an exact-ask leftover Funded even when Available is still the ask", () => {
    const row = envelope({
      assignedCents: 50_000,
      balanceCents: 50_000,
    });
    const indicator = indicate(row);
    expect(indicator.state).toBe("funded");
    expect(indicator.copy).toBe("Funded");
    expect(indicator.icon).toBe("check");
  });

  it("marks fully spent when Available is $0 after spending a met ask", () => {
    const row = envelope({
      assignedCents: 50_000,
      activityCents: -50_000,
      balanceCents: 0,
    });
    const indicator = indicate(row);
    expect(indicator.state).toBe("fully-spent");
    expect(indicator.copy).toBe("Fully Spent");
    expect(indicator.pill).toBe("gray");
    expect(indicator.icon).toBe("check");
    expect(indicator.bar?.striped).toBe(true);
  });

  it("does not call underfunded Fully Spent", () => {
    const row = envelope({
      assignedCents: 10_000,
      activityCents: -10_000,
      balanceCents: 0,
    });
    const indicator = indicate(row);
    expect(indicator.state).toBe("underfunded");
    expect(indicator.copy).toMatch(/more needed this month/);
  });

  it("lets overspent win over an unmet ask", () => {
    const row = envelope({
      assignedCents: 0,
      activityCents: -10_000,
      balanceCents: -10_000,
      carryInCents: 0,
    });
    const indicator = indicate(row);
    expect(indicator.state).toBe("overspent");
    expect(indicator.pill).toBe("red");
    expect(indicator.copy).toBeNull();
    expect(indicator.icon).toBeNull();
    expect(indicator.bar).toEqual({ fill01: 1, spent01: 0, striped: false });
  });

  it("idles a no-ask envelope at $0", () => {
    const row = envelope({ target: null, assignedCents: 0, balanceCents: 0 });
    const indicator = indicate(row);
    expect(indicator.state).toBe("idle");
    expect(indicator.pill).toBe("gray");
    expect(indicator.bar).toBeNull();
    expect(indicator.copy).toBeNull();
  });

  it("asks a raided deadline-free floor for it back this month", () => {
    // `$100,000 with $99,500 in it` asks $500 now, in the ordinary copy: a floor that says
    // "needed eventually" is a floor that never gets refilled (`target-refill-basis` D3).
    const row = envelope({
      target: {
        behavior: "balance",
        cadence: { unit: "none" },
        amountCents: 10_000_000,
      },
      assignedCents: 0,
      carryInCents: 9_950_000,
      balanceCents: 9_950_000,
    });
    const indicator = indicate(row);
    expect(indicator.state).toBe("underfunded");
    expect(indicator.moreNeededCents).toBe(50_000);
    expect(indicator.copy).toBe("$500.00 more needed this month");
    expect(indicator.pill).toBe("yellow");
    // The bar reads the pile, not the month's assignment.
    expect(indicator.bar?.fill01).toBeCloseTo(0.995, 3);
  });

  it("calls a full deadline-free floor Funded", () => {
    const row = envelope({
      target: {
        behavior: "balance",
        cadence: { unit: "none" },
        amountCents: 50_000,
      },
      assignedCents: 0,
      carryInCents: 50_000,
      balanceCents: 50_000,
    });
    expect(indicate(row).state).toBe("funded");
    expect(indicate(row).moreNeededCents).toBe(0);
  });

  it("lets fully spent win when extra assigned was spent to $0 Available", () => {
    const row = envelope({
      assignedCents: 70_000,
      activityCents: -70_000,
      balanceCents: 0,
    });
    const indicator = indicate(row);
    expect(indicator.state).toBe("fully-spent");
    expect(indicator.copy).toBe("Fully Spent");
    expect(indicator.moreNeededCents).toBe(0);
  });

  it("greens leftover with no ask", () => {
    const row = envelope({
      target: null,
      assignedCents: 0,
      carryInCents: 8_000,
      balanceCents: 8_000,
    });
    const indicator = indicate(row);
    expect(indicator.state).toBe("safe");
    expect(indicator.pill).toBe("green");
    expect(indicator.copy).toBeNull();
    expect(indicator.bar?.fill01).toBe(1);
  });

  it("calls sinking extra overassigned instead of On Track", () => {
    // $1,200 by December; August is 4 months away (5 installments).
    const installment = Math.round(120_000 / 5);
    const row = envelope({
      target: byDate(120_000, "2026-12"),
      assignedCents: installment + 5_000,
      balanceCents: installment + 5_000,
    });
    const indicator = indicate(row);
    expect(indicator.state).toBe("overassigned");
    expect(indicator.icon).toBe("extra");
    expect(indicator.copy).toBe("$50.00 extra");
    expect(indicator.moreNeededCents).toBe(0);
  });

  it("puts a by-date template On Track after this month's installment", () => {
    // $1,200 by December; August is 4 months away (5 installments).
    const installment = Math.round(120_000 / 5);
    const row = envelope({
      target: byDate(120_000, "2026-12"),
      assignedCents: installment,
      balanceCents: installment,
    });
    const indicator = indicate(row);
    expect(indicator.state).toBe("on-track");
    expect(indicator.copy).toBe("On Track");
    expect(indicator.icon).toBe("pie");
    expect(indicator.pill).toBe("green");
    expect(indicator.moreNeededCents).toBe(0);
    expect(indicator.bar?.fill01).toBeCloseTo(installment / 120_000);
  });

  it("labels a by-date installment as needed this month", () => {
    // $700.05 by December is $140.01/month from August; $16.31 is already assigned.
    const row = envelope({
      target: byDate(70_005, "2026-12"),
      assignedCents: 1_631,
      balanceCents: 1_631,
    });
    const indicator = indicate(row);
    expect(indicator.state).toBe("underfunded");
    expect(indicator.moreNeededCents).toBe(12_370);
    expect(indicator.copy).toBe("$123.70 more needed this month");
  });

  it("labels a yearly target installment as needed this month", () => {
    const row = envelope({
      target: yearlyUpTo(120_000, 12),
      assignedCents: 0,
      balanceCents: 0,
    });
    const indicator = indicate(row);
    expect(indicator.state).toBe("underfunded");
    expect(indicator.moreNeededCents).toBe(24_000);
    expect(indicator.copy).toBe("$240.00 more needed this month");
  });

  it("funds a by-date envelope that already holds the full target", () => {
    const row = envelope({
      target: byDate(120_000, "2026-12"),
      carryInCents: 120_000,
      assignedCents: 0,
      balanceCents: 120_000,
    });
    const indicator = indicate(row);
    expect(indicator.state).toBe("funded");
    expect(indicator.copy).toBe("Funded");
  });

  it("does not underfund a monthly bill due next month", () => {
    const row = billRow({ nextDueKey: "2026-09-01" });
    const bills = new Map([["rent", snapshot("rent", 210_000, "2026-09-01")]]);
    const indicator = indicate(row, bills);
    expect(neededAssigned(row, MONTH, bills).needed).toBe(0);
    expect(indicator.state).toBe("idle");
    expect(indicator.copy).toBeNull();
  });

  it("treats a monthly bill due this month as Funded vs more needed this month", () => {
    const bills = new Map([["rent", snapshot("rent", 210_000, "2026-08-01")]]);
    expect(indicate(billRow(), bills).state).toBe("underfunded");
    expect(indicate(billRow(), bills).copy).toBe("$2,100.00 more needed this month");
    const funded = indicate(
      billRow({ assignedCents: 210_000, balanceCents: 210_000 }),
      bills,
    );
    expect(funded.state).toBe("funded");
    expect(funded.icon).toBe("check");
    const extra = indicate(
      billRow({ assignedCents: 250_000, balanceCents: 250_000 }),
      bills,
    );
    expect(extra.state).toBe("overassigned");
    expect(extra.copy).toBe("$400.00 extra");
    expect(extra.icon).toBe("extra");
  });

  it("marks a fully assigned and spent bill Fully Spent when its payee anchor lags", () => {
    const bills = new Map([["rent", snapshot("rent", 210_000, "2026-08-01")]]);
    const paid = indicate(
      billRow({
        assignedCents: 210_000,
        activityCents: -210_000,
        balanceCents: 0,
      }),
      bills,
    );

    expect(paid.moreNeededCents).toBe(0);
    expect(paid.state).toBe("fully-spent");
    expect(paid.copy).toBe("Fully Spent");
  });

  it("puts a yearly sinking bill On Track after this month's installment", () => {
    const row = billRow({
      id: "geico",
      name: "Geico",
      nextDueKey: "2027-06-01",
    });
    const bills = new Map([["geico", snapshot("geico", 600_000, "2027-06-01", 12)]]);
    const needed = neededAssigned(row, MONTH, bills).needed;
    const funded = indicate(
      { ...row, assignedCents: needed, balanceCents: needed },
      bills,
    );
    expect(funded.state).toBe("on-track");
    expect(funded.copy).toBe("On Track");
    expect(funded.icon).toBe("pie");
    const extra = indicate(
      { ...row, assignedCents: needed + 10_000, balanceCents: needed + 10_000 },
      bills,
    );
    expect(extra.state).toBe("overassigned");
    expect(extra.copy).toBe("$100.00 extra");
  });

  it("labels a quarterly derived bill installment as needed this month", () => {
    const row = billRow({
      id: "geico",
      name: "Geico",
      nextDueKey: "2026-11-01",
    });
    const bills = new Map([["geico", snapshot("geico", 60_000, "2026-11-01", 3)]]);
    const indicator = indicate(row, bills);
    expect(indicator.state).toBe("underfunded");
    expect(indicator.moreNeededCents).toBe(15_000);
    expect(indicator.copy).toBe("$150.00 more needed this month");
  });

  it("does not ask a paused bill for more", () => {
    const row = billRow({ status: "paused" });
    const bills = new Map([["rent", snapshot("rent", 210_000, "2026-08-01")]]);
    expect(indicate(row, bills).state).toBe("idle");
  });

  it("does not ask a cancelled bill for more", () => {
    const row = billRow({
      status: "cancelled",
      assignedCents: 0,
      balanceCents: 5_000,
      carryInCents: 5_000,
    });
    const bills = new Map([["rent", snapshot("rent", 210_000, "2026-08-01")]]);
    expect(indicate(row, bills).state).toBe("safe");
    expect(indicate(row, bills).copy).toBeNull();
  });

  it("skips income envelopes when mapping a page", () => {
    const map = indicatorsFromAssign(
      MONTH,
      [envelope({ id: "pay", kind: "income", target: null }), envelope({ id: "food" })],
      new Map(),
    );
    expect(map.has("pay")).toBe(false);
    expect(map.get("food")?.state).toBe("underfunded");
  });
});

describe("picker-month fold", () => {
  // Fix This must scan the picker month's assigned, not the viewed month's.
  it("reads overassigned from that month's fold", () => {
    const groups: BudgetGroupRow[] = [
      {
        id: "spend",
        parentGroupId: null,
        name: "Spending",
        kind: "spending",
        sortKey: "spend",
        hidden: false,
      },
    ];
    const categories: BudgetCategoryRow[] = [
      {
        id: "food",
        groupId: "spend",
        name: "Groceries",
        sortKey: "food",
        hidden: false,
        notes: "",
        target: addMonthly(50_000),
        kind: "spending",
        isIncome: false,
        bill: null,
      },
    ];
    const months = buildBudget({
      categories: [{ id: "food", groupId: "spend", isIncome: false }],
      allocations: [
        {
          month: "2026-08-01",
          categoryId: "food",
          amountCents: 50_000,
          carryover: false,
          snoozed: false,
        },
        {
          month: "2026-09-01",
          categoryId: "food",
          amountCents: 70_000,
          carryover: false,
          snoozed: false,
        },
      ],
      activity: [],
      buffered: [],
      startMonth: "2026-08-01",
      endMonth: "2026-09-01",
      openingCents: 200_000,
    });
    const august = findMonth(months, "2026-08-01");
    const september = findMonth(months, "2026-09-01");
    if (!august || !september) throw new Error("missing months");

    const augustScan = assignScanInputs({
      month: august,
      previous: null,
      groups,
      categories,
    });
    expect(
      indicatorsFromAssign("2026-08-01", augustScan.envelopes, augustScan.bills).get(
        "food",
      )?.state,
    ).toBe("funded");

    const septemberScan = assignScanInputs({
      month: september,
      previous: august,
      groups,
      categories,
    });
    const septemberIndicator = indicatorsFromAssign(
      "2026-09-01",
      septemberScan.envelopes,
      septemberScan.bills,
    ).get("food");
    expect(septemberIndicator?.state).toBe("overassigned");
    expect(septemberIndicator?.copy).toBe("$200.00 extra");
  });
});

describe("snoozed", () => {
  // $25/week `add` on Pizza: the month's cap is $100, $75 was assigned and spent, and the
  // leftover $25 was moved elsewhere. Without snooze this is yellow for money deliberately gone.
  const pizza = (overrides: Partial<AssignEnvelope> = {}): AssignEnvelope =>
    envelope({
      id: "pizza",
      name: "Pizza",
      target: {
        behavior: "add",
        cadence: { unit: "week", weekday: 1 },
        amountCents: 2_500,
      },
      assignedCents: 7_500,
      activityCents: -7_500,
      balanceCents: 0,
      ...overrides,
    });

  it("is underfunded when it is not snoozed", () => {
    expect(indicate(pizza()).state).toBe("underfunded");
  });

  it("goes gray with the Zz at $0 available", () => {
    const scan = indicate(pizza({ snoozed: true }));
    expect(scan.state).toBe("snoozed");
    expect(scan.pill).toBe("gray");
    expect(scan.icon).toBe("snooze");
    expect(scan.copy).toBe("Snoozed for August");
  });

  it("goes green with the Zz when money is still in it", () => {
    const scan = indicate(pizza({ snoozed: true, balanceCents: 2_500 }));
    expect(scan.state).toBe("snoozed");
    expect(scan.pill).toBe("green");
    expect(scan.icon).toBe("snooze");
    expect(scan.copy).toBe("Snoozed for August");
  });

  // The seam sits above both target families, and nothing else here proves it.
  it("silences a pile-family floor too", () => {
    const goal = envelope({
      id: "camera",
      name: "Camera fund",
      target: { behavior: "balance", cadence: { unit: "none" }, amountCents: 60_000 },
      assignedCents: 0,
      activityCents: 0,
      balanceCents: 10_000,
      carryInCents: 10_000,
    });
    expect(indicate(goal).state).toBe("underfunded");
    expect(indicate({ ...goal, snoozed: true }).state).toBe("snoozed");
  });

  it("stays red when a snoozed envelope is overspent", () => {
    const scan = indicate(pizza({ snoozed: true, balanceCents: -1_000 }));
    expect(scan.state).toBe("overspent");
    expect(scan.pill).toBe("red");
  });

  it("still reports the overspend floor as the remaining ask", () => {
    // Snooze zeroes the target term, never money already gone: $40 was spent against $0
    // assigned, so the ask is still $40 even though the target is asleep.
    const scan = indicate(
      pizza({
        snoozed: true,
        assignedCents: 0,
        activityCents: -4_000,
        balanceCents: 0,
      }),
    );
    expect(scan.moreNeededCents).toBe(4_000);
  });
});
