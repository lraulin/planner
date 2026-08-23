import { describe, expect, it } from "vitest";

import { FINANCE_CATEGORIES } from "../classify/categories";
import { envelopeForRow, envelopeIndex, type MappableRow } from "./autoMap";
import {
  BUDGET_PRESETS,
  claimedCategories,
  PRESET_GROUPS,
  unclaimedCategories,
} from "./presets";

const TARGETS = [
  { id: "income", isIncome: true, sourceCategories: [], sortKey: "a" },
  {
    id: "bills",
    isIncome: false,
    sourceCategories: ["Utilities", "Insurance"],
    sortKey: "b",
  },
  {
    id: "fun",
    isIncome: false,
    sourceCategories: ["Dining", "Games", "Shopping"],
    sortKey: "c",
  },
];

const INDEX = envelopeIndex(TARGETS);

function row(overrides: Partial<MappableRow> = {}): MappableRow {
  return {
    description: "SOME MERCHANT",
    sourceCategory: "",
    category: null,
    derivedCategory: null,
    derivedFlow: null,
    flowOverride: null,
    amountCents: -1_000,
    transferGroupId: null,
    ...overrides,
  };
}

describe("envelopeIndex", () => {
  it("takes the first income envelope and resolves a duplicate claim by sort key", () => {
    // A duplicate costs one row in the wrong envelope, which is visible and fixable.
    // Refusing to build the index would strand every row in the backlog instead.
    const index = envelopeIndex([
      { id: "late", isIncome: false, sourceCategories: ["Dining"], sortKey: "z" },
      { id: "early", isIncome: false, sourceCategories: ["Dining"], sortKey: "a" },
      { id: "pay2", isIncome: true, sourceCategories: [], sortKey: "n" },
      { id: "pay1", isIncome: true, sourceCategories: [], sortKey: "b" },
    ]);
    expect(index.byCategory.get("Dining")).toBe("early");
    expect(index.incomeId).toBe("pay1");
  });

  it("has no income envelope when none is flagged", () => {
    expect(envelopeIndex([TARGETS[1] as never]).incomeId).toBeNull();
  });
});

describe("envelopeForRow", () => {
  it("routes income by flow, never by a spending category", () => {
    // No value in FINANCE_CATEGORIES describes a paycheck, and the classifier already knows
    // one when it sees it.
    expect(
      envelopeForRow(
        row({ derivedFlow: "income", amountCents: 250_000 }),
        INDEX,
        new Set(),
      ),
    ).toBe("income");
    // Even when a category was set by hand, flow still decides.
    expect(
      envelopeForRow(
        row({ derivedFlow: "income", category: "Dining", amountCents: 250_000 }),
        INDEX,
        new Set(),
      ),
    ).toBe("income");
  });

  it("honours a flow override over the classifier", () => {
    expect(
      envelopeForRow(
        row({ derivedFlow: "spend", flowOverride: "income", amountCents: 500 }),
        INDEX,
        new Set(),
      ),
    ).toBe("income");
  });

  it("leaves both legs of an on-budget transfer alone", () => {
    // A card payment moves money inside the budget and spends none of it. Enveloping one leg
    // would record a purchase that never happened.
    const internal = new Set(["pair-1"]);
    expect(
      envelopeForRow(
        row({ transferGroupId: "pair-1", category: "Dining" }),
        INDEX,
        internal,
      ),
    ).toBeNull();
  });

  it("treats a transfer out of the budget as real spending", () => {
    // Money moved to savings has left the budget, which is exactly what spending from a
    // "Savings" envelope means. Its group is not in the internal set.
    expect(
      envelopeForRow(
        row({ transferGroupId: "pair-2", category: "Dining" }),
        INDEX,
        new Set(["pair-1"]),
      ),
    ).toBe("fun");
  });

  it("places a row by the envelope that claims its category", () => {
    expect(envelopeForRow(row({ category: "Utilities" }), INDEX, new Set())).toBe(
      "bills",
    );
    expect(envelopeForRow(row({ derivedCategory: "Games" }), INDEX, new Set())).toBe(
      "fun",
    );
  });

  it("prefers the user's category over the classifier's", () => {
    expect(
      envelopeForRow(
        row({ category: "Utilities", derivedCategory: "Dining" }),
        INDEX,
        new Set(),
      ),
    ).toBe("bills");
  });

  it("leaves an unclassifiable row in the backlog rather than guessing", () => {
    // Nothing claims Uncategorized. A guess here would be invisible; the backlog is not.
    expect(envelopeForRow(row(), INDEX, new Set())).toBeNull();
    expect(envelopeForRow(row({ category: "Travel" }), INDEX, new Set())).toBeNull();
  });
});

describe("presets", () => {
  it.each(BUDGET_PRESETS)(
    "%s claims every spending category exactly once",
    (preset) => {
      // A category no envelope claims is a transaction that sits in the backlog forever with
      // nobody told why — the one failure mode of mapping without a rules engine.
      expect(unclaimedCategories(preset)).toEqual([]);
      const claimed = claimedCategories(preset);
      expect(new Set(claimed).size).toBe(claimed.length);
      expect(claimed).toHaveLength(FINANCE_CATEGORIES.length);
    },
  );

  it.each(BUDGET_PRESETS)("%s has exactly one income envelope", (preset) => {
    // Income routes by flow to a single envelope. Two would make which one wins depend on
    // sort order, and zero would silently drop every paycheck out of Ready to Assign.
    const income = PRESET_GROUPS[preset].filter((group) => group.isIncome);
    expect(income).toHaveLength(1);
    expect(income[0]?.categories).toHaveLength(1);
    expect(income[0]?.categories[0]?.sourceCategories).toEqual([]);
  });

  it("keeps minimal small and detailed one-for-one", () => {
    // The recommendation is only meaningful if the two presets actually differ in the way
    // the recommendation claims: few envelopes versus one per category.
    const envelopes = (preset: (typeof BUDGET_PRESETS)[number]) =>
      PRESET_GROUPS[preset].flatMap((group) => group.categories).length;

    expect(envelopes("minimal")).toBe(5);
    expect(envelopes("detailed")).toBe(FINANCE_CATEGORIES.length + 1);
  });
});
