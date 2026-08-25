import { describe, expect, it } from "vitest";
import { demandOf, hasDemandAsk, type DemandEnvelope } from "./demand";
import type { BillSnapshot } from "./schedule";
import type { RemainderTemplate, SimpleTemplate } from "./types";

const MONTH = "2026-08-01";

function envelope(over: Partial<DemandEnvelope> = {}): DemandEnvelope {
  return {
    id: "food",
    name: "Food",
    kind: "spending",
    templates: [],
    carryInCents: 0,
    ...over,
  };
}

const remainder: RemainderTemplate = {
  id: "r1",
  directive: "template",
  type: "remainder",
  priority: null,
  weight: 1,
};

const simple: SimpleTemplate = {
  id: "s1",
  directive: "template",
  type: "simple",
  priority: 1,
  monthlyCents: 5_000,
};

const rent: BillSnapshot = {
  id: "rent",
  name: "Rent",
  cadenceMonths: 1,
  cadenceDays: null,
  expectedCents: 185_000,
  nextDueKey: "2026-08-01",
};

describe("hasDemandAsk", () => {
  it("does not treat remainder as an ask", () => {
    expect(hasDemandAsk(envelope({ templates: [remainder] }))).toBe(false);
    expect(hasDemandAsk(envelope({ templates: [simple] }))).toBe(true);
    expect(hasDemandAsk(envelope({ kind: "bill" }))).toBe(true);
  });
});

describe("demandOf", () => {
  it("names a bill with no next-due instead of asking zero silently", () => {
    const result = demandOf(envelope({ id: "rent", kind: "bill" }), MONTH, new Map());
    expect(result.amount).toBe(0);
    expect(result.errors).toEqual(["Bill has no next-due date yet"]);
  });

  it("asks a monthly bill for this month's amount from cadence, not templates", () => {
    const result = demandOf(
      envelope({ id: "rent", kind: "bill" }),
      MONTH,
      new Map([["rent", rent]]),
    );
    expect(result.amount).toBe(185_000);
    expect(result.errors).toEqual([]);
  });

  it("does not add remainder weight into the ask", () => {
    const result = demandOf(envelope({ templates: [remainder] }), MONTH, new Map());
    expect(result.amount).toBe(0);
    expect(result.errors).toEqual([]);
  });
});
