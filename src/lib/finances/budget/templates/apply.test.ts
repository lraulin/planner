import { describe, expect, it } from "vitest";

import { applyTemplates, templateCarryIn, type EnvelopeApplyInput } from "./apply";
import type { ScheduleSnapshot } from "./schedule";
import type { Template } from "./types";

const billsSimple: Template = {
  id: "b1",
  directive: "template",
  type: "simple",
  priority: 0,
  monthlyCents: 50_000,
};

const remainder: Template = {
  id: "r1",
  directive: "template",
  type: "remainder",
  priority: null,
  weight: 1,
};

function envelope(overrides: Partial<EnvelopeApplyInput> = {}): EnvelopeApplyInput {
  return {
    id: "bills",
    name: "Bills",
    isIncome: false,
    templates: [billsSimple],
    assignedCents: 0,
    carryInCents: 0,
    ...overrides,
  };
}

describe("applyTemplates", () => {
  it("Apply leaves a non-zero Assigned cell untouched; Overwrite replaces it", () => {
    const filled = envelope({ assignedCents: 12_000 });
    const apply = applyTemplates({
      month: "2026-08-01",
      envelopes: [filled],
      schedules: new Map(),
      readyToAssignCents: 100_000,
      force: false,
      todayKey: "2026-08-22",
    });
    expect(apply.allocations).toEqual([]);

    const overwrite = applyTemplates({
      month: "2026-08-01",
      envelopes: [filled],
      schedules: new Map(),
      readyToAssignCents: 100_000,
      force: true,
      todayKey: "2026-08-22",
    });
    expect(overwrite.allocations).toEqual([
      { categoryId: "bills", amountCents: 50_000, goalCents: 50_000 },
    ]);
  });

  it("remainder takes leftover Ready to Assign and nothing more", () => {
    const result = applyTemplates({
      month: "2026-08-01",
      envelopes: [
        envelope(),
        envelope({
          id: "savings",
          name: "Savings",
          templates: [remainder],
        }),
      ],
      schedules: new Map(),
      readyToAssignCents: 88_812,
      force: false,
      todayKey: "2026-08-22",
    });
    const savings = result.allocations.find((row) => row.categoryId === "savings");
    const bills = result.allocations.find((row) => row.categoryId === "bills");
    expect(bills?.amountCents).toBe(50_000);
    expect(savings?.amountCents).toBe(38_812);
  });

  it("may drive Ready to Assign negative; remainder then gets 0", () => {
    const result = applyTemplates({
      month: "2026-08-01",
      envelopes: [
        envelope({ templates: [{ ...billsSimple, monthlyCents: 200_000 }] }),
        envelope({ id: "savings", name: "Savings", templates: [remainder] }),
      ],
      schedules: new Map(),
      readyToAssignCents: 50_000,
      force: false,
      todayKey: "2026-08-22",
    });
    expect(
      result.allocations.find((row) => row.categoryId === "bills")?.amountCents,
    ).toBe(200_000);
    expect(
      result.allocations.find((row) => row.categoryId === "savings")?.amountCents,
    ).toBe(0);
  });

  it("skips income envelopes", () => {
    const result = applyTemplates({
      month: "2026-08-01",
      envelopes: [envelope({ isIncome: true })],
      schedules: new Map(),
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
      schedules: new Map(),
      readyToAssignCents: 50_000,
      force: false,
      todayKey: "2026-08-22",
    });
    expect(result.note).toContain("Applied templates: Bills $500.00 on August 22");
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

describe("schedule apply", () => {
  it("fills from a monthly schedule snapshot", () => {
    const snapshot: ScheduleSnapshot = {
      id: "rent",
      name: "Rent",
      completed: false,
      amountCents: -185_000,
      nextDate: "2026-08-01",
      config: { frequency: "monthly", interval: 1, start: "2026-01-01" },
    };
    const result = applyTemplates({
      month: "2026-08-01",
      envelopes: [
        envelope({
          templates: [
            {
              id: "s1",
              directive: "template",
              type: "schedule",
              priority: 0,
              scheduleId: "rent",
            },
          ],
        }),
      ],
      schedules: new Map([["rent", snapshot]]),
      readyToAssignCents: 200_000,
      force: false,
      todayKey: "2026-08-22",
    });
    expect(result.allocations[0]?.amountCents).toBe(185_000);
  });
});
