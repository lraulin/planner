import { describe, expect, it } from "vitest";
import { demandOf, hasDemandAsk, type DemandEnvelope } from "./demand";
import type { BillSnapshot } from "./schedule";
import type { RemainderTemplate, SimpleTemplate, WeeklyTemplate } from "./types";

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

/** Sunday groceries: five Sundays in August 2026, four in September. */
const sundayGroceries: WeeklyTemplate = {
  id: "w1",
  directive: "template",
  type: "weekly",
  priority: 0,
  amountCents: 18_000,
  weekday: 0,
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
    expect(hasDemandAsk(envelope({ templates: [sundayGroceries] }))).toBe(true);
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

  it("counts the weekday occurrences in the month, not a fixed four", () => {
    const august = demandOf(
      envelope({ templates: [sundayGroceries] }),
      "2026-08-01",
      new Map(),
    );
    const september = demandOf(
      envelope({ templates: [sundayGroceries] }),
      "2026-09-01",
      new Map(),
    );
    expect(august.amount).toBe(90_000);
    expect(september.amount).toBe(72_000);
  });

  it("does not let carry-in reduce a weekly ask (D3)", () => {
    // A quiet month leaves spare cash to move elsewhere; it is not evidence that next
    // month's groceries are cheaper. Reverting this would silently underfund the envelope.
    const result = demandOf(
      envelope({ templates: [sundayGroceries], carryInCents: 50_000 }),
      "2026-08-01",
      new Map(),
    );
    expect(result.amount).toBe(90_000);
  });

  it("sums a weekly line with a simple line on the same envelope", () => {
    const result = demandOf(
      envelope({ templates: [simple, sundayGroceries] }),
      "2026-09-01",
      new Map(),
    );
    expect(result.amount).toBe(5_000 + 72_000);
  });

  it("still clamps the summed ask with a sibling simple line's limit", () => {
    const result = demandOf(
      envelope({
        templates: [
          sundayGroceries,
          {
            id: "s2",
            directive: "template",
            type: "simple",
            priority: 0,
            limit: { amountCents: 80_000, hold: false },
          } satisfies SimpleTemplate,
        ],
        carryInCents: 0,
      }),
      "2026-08-01",
      new Map(),
    );
    expect(result.amount).toBe(80_000);
  });

  it("does not add remainder weight into the ask", () => {
    const result = demandOf(envelope({ templates: [remainder] }), MONTH, new Map());
    expect(result.amount).toBe(0);
    expect(result.errors).toEqual([]);
  });
});
