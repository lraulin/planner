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
    excludeFromBaseline: false,
    eventLabel: "",
    ...over,
  };
}

function replacement(over: Partial<ReplacementRow> = {}): ReplacementRow {
  return {
    id: "feed",
    transactionDate: "2026-08-24",
    postedDate: "2026-08-24",
    amountCents: -2284,
    isParent: false,
    budgetCategoryId: null,
    notes: "",
    flowOverride: null,
    excludeFromBaseline: false,
    eventLabel: "",
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

  it("matches on amount alone — the two feeds spell the merchant differently", () => {
    // `Pizza Hut` on the page against `PIZZA HUT 036874` from SimpleFIN. No description
    // rule bridges those, which is why this one never looks at the description.
    const plan = planFeedHandover(
      [retiring({ description: "Pizza Hut", amountCents: -3252 })],
      [replacement({ amountCents: -3252 })],
    );
    expect(plan.steps[0].replacementId).toBe("feed");
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
    expect(plan.steps.map((step) => step.replacementId)).toEqual(["only", null]);
  });

  it("prefers the nearest date among equal amounts", () => {
    const plan = planFeedHandover(
      [
        retiring({
          id: "aug",
          transactionDate: "2026-08-01",
          postedDate: "2026-08-01",
          budgetCategoryId: "rent",
        }),
      ],
      [
        replacement({
          id: "july",
          transactionDate: "2026-07-01",
          postedDate: "2026-07-01",
        }),
        replacement({
          id: "august",
          transactionDate: "2026-08-02",
          postedDate: "2026-08-02",
        }),
      ],
    );
    expect(plan.steps[0].replacementId).toBe("august");
  });

  it("warns rather than silently losing a Category when nothing matches", () => {
    const plan = planFeedHandover(
      [retiring({ budgetCategoryId: "groceries" })],
      [replacement({ amountCents: -999 })],
    );
    expect(plan.steps[0]).toMatchObject({ replacementId: null, carry: {} });
    expect(plan.warnings[0]).toContain("CVS");
  });

  it("stays quiet about a row that held nothing of the user's", () => {
    const plan = planFeedHandover([retiring()], [replacement({ amountCents: -1 })]);
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
        excludeFromBaseline: false,
        eventLabel: "",
      }),
    ).toBe(false);
  });

  it("counts every field the handover promises to carry", () => {
    const empty = {
      budgetCategoryId: null,
      notes: "",
      flowOverride: null,
      excludeFromBaseline: false,
      eventLabel: "",
    };
    expect(hasUserState({ ...empty, budgetCategoryId: "x" })).toBe(true);
    expect(hasUserState({ ...empty, notes: "n" })).toBe(true);
    expect(hasUserState({ ...empty, flowOverride: "refund" })).toBe(true);
    expect(hasUserState({ ...empty, excludeFromBaseline: true })).toBe(true);
    expect(hasUserState({ ...empty, eventLabel: "Trip" })).toBe(true);
  });
});
