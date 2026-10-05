import { describe, expect, it } from "vitest";
import type { SpendingActuals } from "./actuals";
import { uncoveredEnvelopes } from "./uncovered";

const actuals: SpendingActuals = {
  months: 12,
  totalByEnvelope: new Map([
    ["groceries", 12 * 61000],
    ["fun", 12 * 9000],
    ["cats", 12 * 14000],
    ["chewy", 12 * 5000],
    ["savings", 12 * 20000],
    ["refunds", -12 * 100],
  ]),
};

const categories = [
  { id: "groceries", name: "Groceries", kind: "spending" as const, groupId: "food" },
  { id: "fun", name: "Fun", kind: "spending" as const, groupId: null },
  { id: "cats", name: "Cats", kind: "spending" as const, groupId: "pets" },
  { id: "chewy", name: "Chewy", kind: "bill" as const, groupId: null },
  { id: "savings", name: "Savings", kind: "savings" as const, groupId: null },
  { id: "refunds", name: "Refunds", kind: "spending" as const, groupId: null },
  { id: "quiet", name: "Quiet", kind: "spending" as const, groupId: null },
];
const groups = [
  { id: "food", parentGroupId: null },
  { id: "pets", parentGroupId: null },
];

const none = new Set<string>();

function names(rows: ReturnType<typeof uncoveredEnvelopes>) {
  return rows.map((row) => row.name);
}

describe("uncoveredEnvelopes", () => {
  it("names living spending nothing references, biggest first", () => {
    const rows = uncoveredEnvelopes({
      categories,
      groups,
      actuals,
      billEnvelopeIds: new Set(["chewy"]),
      linkedEnvelopeIds: none,
      linkedGroupIds: none,
    });
    expect(rows).toEqual([
      { envelopeId: "groceries", name: "Groceries", monthlyCents: 61000 },
      { envelopeId: "cats", name: "Cats", monthlyCents: 14000 },
      { envelopeId: "fun", name: "Fun", monthlyCents: 9000 },
    ]);
  });

  it("does not list savings, quiet envelopes or net refunds", () => {
    const rows = uncoveredEnvelopes({
      categories,
      groups,
      actuals,
      billEnvelopeIds: none,
      linkedEnvelopeIds: none,
      linkedGroupIds: none,
    });
    expect(names(rows)).not.toContain("Savings");
    expect(names(rows)).not.toContain("Quiet");
    expect(names(rows)).not.toContain("Refunds");
  });

  it("counts a bill as accounted for whether or not it is switched on", () => {
    const rows = uncoveredEnvelopes({
      categories: [{ id: "rent", name: "Rent", kind: "bill", groupId: null }],
      groups,
      actuals: { months: 12, totalByEnvelope: new Map([["rent", 12 * 210000]]) },
      billEnvelopeIds: new Set(["rent"]),
      linkedEnvelopeIds: none,
      linkedGroupIds: none,
    });
    expect(rows).toEqual([]);
  });

  it("stops listing an envelope once a line links it, or links its group", () => {
    const viaEnvelope = uncoveredEnvelopes({
      categories,
      groups,
      actuals,
      billEnvelopeIds: none,
      linkedEnvelopeIds: new Set(["groceries"]),
      linkedGroupIds: none,
    });
    expect(names(viaEnvelope)).not.toContain("Groceries");

    const viaGroup = uncoveredEnvelopes({
      categories,
      groups,
      actuals,
      billEnvelopeIds: none,
      linkedEnvelopeIds: none,
      linkedGroupIds: new Set(["pets"]),
    });
    expect(names(viaGroup)).not.toContain("Cats");
    expect(names(viaGroup)).toContain("Groceries");
  });

  it("names nothing when there is no history", () => {
    expect(
      uncoveredEnvelopes({
        categories,
        groups,
        actuals: { months: 0, totalByEnvelope: new Map() },
        billEnvelopeIds: none,
        linkedEnvelopeIds: none,
        linkedGroupIds: none,
      }),
    ).toEqual([]);
  });
});
