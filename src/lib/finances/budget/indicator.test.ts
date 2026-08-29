import { describe, expect, it } from "vitest";

import { neededAssigned } from "./assign/plan";
import type { AssignEnvelope } from "./assign/types";
import { envelopeIndicator, indicatorsFromAssign } from "./indicator";
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
