import { describe, expect, it } from "vitest";
import {
  autoCategorySummary,
  categoryForNewTransaction,
  inferredDefault,
  isConvertiblePayeeCategoryRule,
  nextLearnedDefault,
  type PayeeAutoCategory,
} from "./autoCategory";

const LEARNING: PayeeAutoCategory = {
  claimedBudgetCategoryId: null,
  defaultBudgetCategoryId: null,
  autoCategoryMode: "learn",
};

function choice(id: string, categoryId: string | null) {
  return { id, categoryId };
}

describe("categoryForNewTransaction", () => {
  it("uses the claim ahead of a default", () => {
    expect(
      categoryForNewTransaction({
        claimedBudgetCategoryId: "bill",
        defaultBudgetCategoryId: "food",
        autoCategoryMode: "learn",
      }),
    ).toBe("bill");
  });

  it("uses the learned or fixed default when unclaimed", () => {
    expect(
      categoryForNewTransaction({
        ...LEARNING,
        defaultBudgetCategoryId: "food",
      }),
    ).toBe("food");
    expect(
      categoryForNewTransaction({
        claimedBudgetCategoryId: null,
        defaultBudgetCategoryId: "food",
        autoCategoryMode: "fixed",
      }),
    ).toBe("food");
  });

  it("leaves the row uncategorised in off mode even when a default is stored", () => {
    expect(
      categoryForNewTransaction({
        claimedBudgetCategoryId: null,
        defaultBudgetCategoryId: "food",
        autoCategoryMode: "off",
      }),
    ).toBeNull();
  });
});

describe("nextLearnedDefault", () => {
  it("learns immediately from the first manual assignment", () => {
    expect(
      nextLearnedDefault(LEARNING, "a", [
        choice("a", "food"),
        choice("b", null),
        choice("c", null),
      ]),
    ).toBe("food");
  });

  it("changes the default when two of the latest three use a different category", () => {
    expect(
      nextLearnedDefault({ ...LEARNING, defaultBudgetCategoryId: "food" }, "a", [
        choice("a", "pets"),
        choice("b", "pets"),
        choice("c", "food"),
      ]),
    ).toBe("pets");
  });

  it("does not change on a single correction among the latest three", () => {
    expect(
      nextLearnedDefault({ ...LEARNING, defaultBudgetCategoryId: "food" }, "a", [
        choice("a", "pets"),
        choice("b", "food"),
        choice("c", "food"),
      ]),
    ).toBe("food");
  });

  it("ignores edits outside the latest-three window", () => {
    expect(
      nextLearnedDefault({ ...LEARNING, defaultBudgetCategoryId: "food" }, "old", [
        choice("a", "pets"),
        choice("b", "pets"),
        choice("c", "pets"),
        choice("old", "pets"),
      ]),
    ).toBe("food");
  });

  it("counts uncategorised rows as positions but not as votes", () => {
    expect(
      nextLearnedDefault({ ...LEARNING, defaultBudgetCategoryId: "food" }, "a", [
        choice("a", "pets"),
        choice("b", null),
        choice("c", "pets"),
      ]),
    ).toBe("pets");
    expect(
      nextLearnedDefault({ ...LEARNING, defaultBudgetCategoryId: "food" }, "a", [
        choice("a", "pets"),
        choice("b", null),
        choice("c", "food"),
      ]),
    ).toBe("food");
  });

  it("does not learn while claimed, in fixed mode, or in off mode", () => {
    const latest = [choice("a", "pets"), choice("b", "pets"), choice("c", "food")];
    expect(
      nextLearnedDefault(
        {
          claimedBudgetCategoryId: "bill",
          defaultBudgetCategoryId: "food",
          autoCategoryMode: "learn",
        },
        "a",
        latest,
      ),
    ).toBe("food");
    expect(
      nextLearnedDefault(
        {
          claimedBudgetCategoryId: null,
          defaultBudgetCategoryId: "food",
          autoCategoryMode: "fixed",
        },
        "a",
        latest,
      ),
    ).toBe("food");
    expect(
      nextLearnedDefault(
        {
          claimedBudgetCategoryId: null,
          defaultBudgetCategoryId: "food",
          autoCategoryMode: "off",
        },
        "a",
        latest,
      ),
    ).toBe("food");
  });
});

describe("inferredDefault", () => {
  it("uses two of the latest three", () => {
    expect(
      inferredDefault([choice("a", "food"), choice("b", "food"), choice("c", "pets")]),
    ).toBe("food");
  });

  it("uses the sole categorised transaction", () => {
    expect(inferredDefault([choice("a", "food"), choice("b", null)])).toBe("food");
  });

  it("leaves mixed histories unset", () => {
    expect(
      inferredDefault([choice("a", "food"), choice("b", "pets"), choice("c", "gas")]),
    ).toBeNull();
  });
});

describe("isConvertiblePayeeCategoryRule", () => {
  const exact = {
    seededId: null,
    conditions: [{ field: "payee", op: "is", value: "payee-1" }],
    actions: [{ op: "set", field: "category", value: "cat-1" }],
  };

  it("accepts an unseeded exact-payee category-only rule", () => {
    expect(isConvertiblePayeeCategoryRule(exact)).toBe(true);
  });

  it("rejects seeded rules, extra conditions, and non-category actions", () => {
    expect(isConvertiblePayeeCategoryRule({ ...exact, seededId: "cvs" })).toBe(false);
    expect(
      isConvertiblePayeeCategoryRule({
        ...exact,
        conditions: [
          { field: "payee", op: "is", value: "payee-1" },
          { field: "amount", op: "gt", value: "10" },
        ],
      }),
    ).toBe(false);
    expect(
      isConvertiblePayeeCategoryRule({
        ...exact,
        actions: [
          { op: "set", field: "category", value: "cat-1" },
          { op: "add-tag", value: "legacy" },
        ],
      }),
    ).toBe(false);
  });
});

describe("autoCategorySummary", () => {
  it("names a claim, a learned default, a fixed default, and off", () => {
    expect(
      autoCategorySummary({
        claim: { name: "Rent" },
        autoCategoryMode: "learn",
        defaultCategoryName: "Groceries",
      }),
    ).toBe("Claimed · Rent");
    expect(
      autoCategorySummary({
        claim: null,
        autoCategoryMode: "learn",
        defaultCategoryName: "Groceries",
      }),
    ).toBe("Learn · Groceries");
    expect(
      autoCategorySummary({
        claim: null,
        autoCategoryMode: "fixed",
        defaultCategoryName: "Dining",
      }),
    ).toBe("Fixed · Dining");
    expect(
      autoCategorySummary({
        claim: null,
        autoCategoryMode: "off",
        defaultCategoryName: "Dining",
      }),
    ).toBe("Do not auto-categorize");
  });
});
