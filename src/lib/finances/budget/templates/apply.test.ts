import { describe, expect, it } from "vitest";

import { applyTemplates, templateCarryIn, type EnvelopeApplyInput } from "./apply";
import type { BillSnapshot } from "../targets/derive";
import type { Target } from "../targets/types";

const addMonthly: Target = {
  behavior: "add",
  cadence: { unit: "month", day: 31 },
  amountCents: 50_000,
};

function envelope(overrides: Partial<EnvelopeApplyInput> = {}): EnvelopeApplyInput {
  return {
    id: "bills",
    name: "Bills",
    isIncome: false,
    kind: "spending",
    target: addMonthly,
    assignedCents: 0,
    carryInCents: 0,
    activityCents: 0,
    ...overrides,
  };
}

describe("applyTemplates", () => {
  it("Apply leaves a non-zero Assigned cell untouched; Overwrite replaces it", () => {
    const filled = envelope({ assignedCents: 12_000 });
    const apply = applyTemplates({
      month: "2026-08-01",
      envelopes: [filled],
      bills: new Map(),
      readyToAssignCents: 100_000,
      force: false,
      todayKey: "2026-08-22",
    });
    expect(apply.allocations).toEqual([]);

    const overwrite = applyTemplates({
      month: "2026-08-01",
      envelopes: [filled],
      bills: new Map(),
      readyToAssignCents: 100_000,
      force: true,
      todayKey: "2026-08-22",
    });
    expect(overwrite.allocations).toEqual([
      { categoryId: "bills", amountCents: 50_000, goalCents: 50_000 },
    ]);
  });

  it("does not spread leftover Ready to Assign onto an envelope with no target", () => {
    const result = applyTemplates({
      month: "2026-08-01",
      envelopes: [
        envelope(),
        envelope({
          id: "savings",
          name: "Savings",
          target: null,
        }),
      ],
      bills: new Map(),
      readyToAssignCents: 88_812,
      force: false,
      todayKey: "2026-08-22",
    });
    const savings = result.allocations.find((row) => row.categoryId === "savings");
    const bills = result.allocations.find((row) => row.categoryId === "bills");
    expect(bills?.amountCents).toBe(50_000);
    expect(savings).toBeUndefined();
  });

  it("may drive Ready to Assign negative", () => {
    const result = applyTemplates({
      month: "2026-08-01",
      envelopes: [
        envelope({
          target: {
            behavior: "add",
            cadence: { unit: "month", day: 31 },
            amountCents: 200_000,
          },
        }),
      ],
      bills: new Map(),
      readyToAssignCents: 50_000,
      force: false,
      todayKey: "2026-08-22",
    });
    expect(
      result.allocations.find((row) => row.categoryId === "bills")?.amountCents,
    ).toBe(200_000);
  });

  it("skips income envelopes", () => {
    const result = applyTemplates({
      month: "2026-08-01",
      envelopes: [envelope({ isIncome: true })],
      bills: new Map(),
      readyToAssignCents: 50_000,
      force: true,
      todayKey: "2026-08-22",
    });
    expect(result.allocations).toEqual([]);
  });

  it("writes a month-note naming every envelope it touched", () => {
    const result = applyTemplates({
      month: "2026-08-01",
      envelopes: [envelope()],
      bills: new Map(),
      readyToAssignCents: 50_000,
      force: false,
      todayKey: "2026-08-22",
    });
    expect(result.note).toContain("Applied targets: Bills $500.00 on August 22");
  });
});

describe("templateCarryIn", () => {
  it("treats a negative balance without carryover as 0", () => {
    expect(templateCarryIn({ balanceCents: -4000, carryover: false })).toBe(0);
    expect(templateCarryIn({ balanceCents: -4000, carryover: true })).toBe(-4000);
    expect(templateCarryIn({ balanceCents: 8000, carryover: false })).toBe(8000);
    expect(templateCarryIn(null)).toBe(0);
  });
});

describe("bill envelope apply", () => {
  it("fills from a monthly bill snapshot with no template lines at all", () => {
    const snapshot: BillSnapshot = {
      id: "rent",
      name: "Rent",
      cadenceMonths: 1,
      cadenceDays: null,
      expectedCents: 185_000,
      nextDueKey: "2026-08-01",
    };
    const result = applyTemplates({
      month: "2026-08-01",
      envelopes: [envelope({ id: "rent", name: "Rent", kind: "bill", target: null })],
      bills: new Map([["rent", snapshot]]),
      readyToAssignCents: 200_000,
      force: false,
      todayKey: "2026-08-22",
    });
    expect(result.allocations[0]?.amountCents).toBe(185_000);
  });

  it("assigns nothing and reports an error when there is no snapshot for it", () => {
    const result = applyTemplates({
      month: "2026-08-01",
      envelopes: [envelope({ id: "rent", name: "Rent", kind: "bill", target: null })],
      bills: new Map(),
      readyToAssignCents: 200_000,
      force: false,
      todayKey: "2026-08-22",
    });
    expect(result.allocations).toEqual([
      { categoryId: "rent", amountCents: 0, goalCents: 0 },
    ]);
    expect(result.errors[0]?.message).toMatch(/no next-due date/);
  });
});

/**
 * A bill envelope funds itself from its own cadence with no template rows at all
 * (`agent-os/specs/2026-08-23-2313-one-budget/` D4). Untested when the spec first shipped,
 * which is exactly how the acceptance criterion came to be ticked without evidence.
 */
describe("applyTemplates — bill envelopes", () => {
  const geico: BillSnapshot = {
    id: "geico",
    name: "Geico",
    cadenceMonths: 6,
    cadenceDays: null,
    expectedCents: 59_498,
    nextDueKey: "2026-12-26",
  };

  function bill(overrides: Partial<EnvelopeApplyInput> = {}): EnvelopeApplyInput {
    return envelope({
      id: "geico",
      name: "Geico",
      kind: "bill",
      target: null,
      ...overrides,
    });
  }

  function run(envelopes: EnvelopeApplyInput[], bills: BillSnapshot[]) {
    return applyTemplates({
      month: "2026-08-01",
      envelopes,
      bills: new Map(bills.map((snapshot) => [snapshot.id, snapshot])),
      readyToAssignCents: 500_000,
      force: false,
      todayKey: "2026-08-24",
    });
  }

  it("sinks a semi-annual bill over the months until it is due", () => {
    // $594.98 due in December, five months out from August inclusive → $119.00 a month.
    const result = run([bill()], [geico]);
    expect(result.allocations).toEqual([
      { categoryId: "geico", amountCents: 11_900, goalCents: 11_900 },
    ]);
  });

  it("funds a bill due this month in full", () => {
    const rent: BillSnapshot = {
      id: "rent",
      name: "Rent",
      cadenceMonths: 1,
      cadenceDays: null,
      expectedCents: 210_000,
      nextDueKey: "2026-08-31",
    };
    const result = run([bill({ id: "rent", name: "Rent" })], [rent]);
    expect(result.allocations).toEqual([
      { categoryId: "rent", amountCents: 210_000, goalCents: 210_000 },
    ]);
  });

  it("asks for less when the envelope already carries part of the target", () => {
    // Carry-in is money already put by, so the sink re-divides only what is still missing:
    // $594.98 − $94.98 = $500.00 left, over the same five months → $100.00 a month. It does
    // *not* keep asking for the original $119.00, which is the tempting way to write it.
    const result = run([bill({ carryInCents: 9_498 })], [geico]);
    expect(result.allocations).toEqual([
      { categoryId: "geico", amountCents: 10_000, goalCents: 10_000 },
    ]);
  });

  it("reports a bill with no next-due date instead of silently skipping it", () => {
    const result = run([bill()], []);
    expect(result.allocations).toEqual([
      { categoryId: "geico", amountCents: 0, goalCents: 0 },
    ]);
    expect(result.errors).toEqual([
      {
        categoryId: "geico",
        categoryName: "Geico",
        message: "Bill has no next-due date yet",
      },
    ]);
  });

  it("never funds an ordinary envelope that has no templates", () => {
    // The `kind` check is what lets a bill through with an empty `templates` array; if it
    // were dropped, every envelope would become a participant asking for nothing.
    const result = run([envelope({ id: "plain", target: null })], []);
    expect(result.allocations).toEqual([]);
  });
});
