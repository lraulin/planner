import { describe, expect, it } from "vitest";
import {
  hasUserState,
  planFeedHandover,
  type ReplacementRow,
  type RetiringRow,
} from "./feedHandover";

function retiring(over: Partial<RetiringRow> = {}): RetiringRow {
  return {
    id: "browser",
    transactionDate: "2026-08-22",
    postedDate: "2026-08-22",
    amountCents: -2284,
    description: "CVS",
    isParent: false,
    budgetCategoryId: null,
    notes: "",
    flowOverride: null,

    ...over,
  };
}

function replacement(over: Partial<ReplacementRow> = {}): ReplacementRow {
  return {
    id: "feed",
    transactionDate: "2026-08-24",
    postedDate: "2026-08-24",
    amountCents: -2284,
    description: "CVS",
    isParent: false,
    budgetCategoryId: null,
    notes: "",
    flowOverride: null,

    ...over,
  };
}

describe("planFeedHandover", () => {
  it("carries the envelope and notes onto the feed's copy of the same charge", () => {
    const plan = planFeedHandover(
      [retiring({ budgetCategoryId: "groceries", notes: "split with Ana" })],
      [replacement()],
    );
    expect(plan.steps).toEqual([
      {
        retiredId: "browser",
        replacementId: "feed",
        carry: { budgetCategoryId: "groceries", notes: "split with Ana" },
        moveSplitTo: null,
      },
    ]);
    expect(plan.warnings).toEqual([]);
  });

  it("pairs even though the two feeds spell the merchant differently, via the brand stem", () => {
    // `Pizza Hut` on the page against `PIZZA HUT 036874` from SimpleFIN. No fold-equality
    // or containment bridges those; the brand-stem rule in `feedPairing.ts` does.
    const plan = planFeedHandover(
      [retiring({ description: "Pizza Hut", amountCents: -3252 })],
      [replacement({ description: "PIZZA HUT 036874", amountCents: -3252 })],
    );
    expect(plan.steps[0].replacementId).toBe("feed");
  });

  it("does not pair, and does not retire, when the descriptions name different things", () => {
    // Production case: a scraped ChatGPT row must not carry its envelope onto SimpleFIN's
    // Claude row just because the amount matches and the dates are close.
    const plan = planFeedHandover(
      [retiring({ description: "ChatGPT", budgetCategoryId: "subscriptions" })],
      [replacement({ description: "Claude", transactionDate: "2026-08-23" })],
    );
    expect(plan.steps).toEqual([]);
    expect(plan.warnings).toEqual([]);
  });

  it("never overwrites a value the user has already put on the feed row", () => {
    const plan = planFeedHandover(
      [retiring({ budgetCategoryId: "groceries", notes: "old" })],
      [replacement({ budgetCategoryId: "dining", notes: "newer" })],
    );
    expect(plan.steps[0].carry).toEqual({});
  });

  it("pairs one feed row with one browser row and no more", () => {
    const plan = planFeedHandover(
      [
        retiring({ id: "one", budgetCategoryId: "coffee" }),
        retiring({ id: "two", budgetCategoryId: "coffee" }),
      ],
      [replacement({ id: "only" })],
    );
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].replacementId).toBe("only");
  });

  it("prefers the nearer date when several feed rows are in range", () => {
    const plan = planFeedHandover(
      [retiring({ transactionDate: "2026-08-22", postedDate: "2026-08-22" })],
      [
        replacement({
          id: "far",
          transactionDate: "2026-08-24",
          postedDate: "2026-08-24",
        }),
        replacement({
          id: "near",
          transactionDate: "2026-08-23",
          postedDate: "2026-08-23",
        }),
      ],
    );
    expect(plan.steps[0].replacementId).toBe("near");
  });

  it("does not retire a row with no matching feed row — it stays, envelope intact", () => {
    const plan = planFeedHandover(
      [retiring({ budgetCategoryId: "groceries" })],
      [replacement({ amountCents: -999 })],
    );
    expect(plan.steps).toEqual([]);
    expect(plan.warnings).toEqual([]);
  });

  it("moves a split onto the replacing row, whose amount is equal by construction", () => {
    const plan = planFeedHandover([retiring({ isParent: true })], [replacement()]);
    expect(plan.steps[0].moveSplitTo).toBe("feed");
  });

  it("refuses to merge two splits and says so", () => {
    const plan = planFeedHandover(
      [retiring({ isParent: true })],
      [replacement({ isParent: true })],
    );
    expect(plan.steps[0].moveSplitTo).toBeNull();
    expect(plan.warnings[0]).toContain("already split");
  });
});

describe("hasUserState", () => {
  it("is false for a row nobody has touched", () => {
    expect(
      hasUserState({
        budgetCategoryId: null,
        notes: "  ",
        flowOverride: null,
      }),
    ).toBe(false);
  });

  it("counts every field the handover promises to carry", () => {
    const empty = {
      budgetCategoryId: null,
      notes: "",
      flowOverride: null,
    };
    expect(hasUserState({ ...empty, budgetCategoryId: "x" })).toBe(true);
    expect(hasUserState({ ...empty, notes: "n" })).toBe(true);
    expect(hasUserState({ ...empty, flowOverride: "refund" })).toBe(true);
    expect(hasUserState({ ...empty, notes: "Trip" })).toBe(true);
  });
});
