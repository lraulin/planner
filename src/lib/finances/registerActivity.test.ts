import { describe, expect, it } from "vitest";
import { customFilter, optionsFilter } from "@/lib/grid/customFilter";
import {
  activityContributionIds,
  activityEmptyCopy,
  activityRegisterHref,
  activityViewFilters,
  parseActivityRegisterParams,
} from "./registerActivity";
import type { TransactionListRow } from "./types";

function tx(
  over: Partial<TransactionListRow> &
    Pick<TransactionListRow, "id" | "transactionDate">,
): TransactionListRow {
  return {
    accountId: "checking",
    accountName: "Checking",
    accountKind: "checking",
    postedDate: over.transactionDate,
    pending: false,
    description: over.description ?? over.id,
    amountCents: -1000,
    sourceCategory: "",
    externalSource: null,
    derivedCategory: null,
    derivedFlow: "spend",
    flowOverride: null,

    notes: "",
    balanceAfterCents: null,
    budgetCategoryId: "groceries",
    budgetCategoryName: "Groceries",
    payeeId: null,
    parentId: null,
    splitChildCount: 0,
    splitImbalanceCents: 0,
    payeeName: null,
    ...over,
  };
}

describe("activityRegisterHref / parseActivityRegisterParams", () => {
  it("round-trips a MonthKey through YYYY-MM in the URL", () => {
    expect(activityRegisterHref("cat-1", "2026-08-01")).toBe(
      "/finances/register?view=activity&category=cat-1&month=2026-08",
    );
    expect(
      parseActivityRegisterParams({ category: "cat-1", month: "2026-08" }),
    ).toEqual({ categoryId: "cat-1", month: "2026-08-01" });
  });

  it("rejects garbage or missing category and month rather than coercing", () => {
    expect(
      parseActivityRegisterParams({ category: "cat-1", month: "2026-13" }),
    ).toBeNull();
    expect(
      parseActivityRegisterParams({ category: "cat-1", month: "2026-08-15" }),
    ).toBeNull();
    expect(parseActivityRegisterParams({ category: "", month: "2026-08" })).toBeNull();
    expect(parseActivityRegisterParams({ category: "cat-1", month: null })).toBeNull();
    expect(
      parseActivityRegisterParams({ category: null, month: "2026-08" }),
    ).toBeNull();
  });
});

describe("activityEmptyCopy / activityViewFilters", () => {
  it("names the envelope and month", () => {
    expect(activityEmptyCopy("Groceries", "2026-08-01")).toBe(
      "No transactions in Groceries for August 2026.",
    );
  });

  it("defaults chips to the envelope name and the inclusive month range", () => {
    expect(activityViewFilters("Groceries", "2026-08-01")).toEqual({
      category: optionsFilter(["value:Groceries"]),
      date: customFilter("and", [
        { op: "gte", value: "2026-08-01" },
        { op: "lte", value: "2026-08-31" },
      ]),
    });
  });
});

describe("activityContributionIds", () => {
  const offBudget = new Set(["savings"]);

  it("keeps the split child and drops the parent so the list cannot double-count", () => {
    const parent = tx({
      id: "parent",
      transactionDate: "2026-08-10",
      amountCents: -5000,
      splitChildCount: 2,
      budgetCategoryId: null,
      budgetCategoryName: null,
    });
    const child = tx({
      id: "child",
      transactionDate: "2026-08-10",
      amountCents: -2000,
      parentId: "parent",
      budgetCategoryId: "groceries",
    });
    expect([
      ...activityContributionIds([parent, child], offBudget, "groceries", "2026-08-01"),
    ]).toEqual(["child"]);
  });

  it("excludes an on-budget-to-on-budget transfer even when an envelope is set", () => {
    const out = tx({
      id: "card-out",
      transactionDate: "2026-08-10",
      derivedFlow: "internal_transfer",
      transferGroupId: "inside",
    });
    const inn = tx({
      id: "card-in",
      accountId: "card",
      transactionDate: "2026-08-10",
      amountCents: 1000,
      derivedFlow: "internal_transfer",
      transferGroupId: "inside",
    });
    expect([
      ...activityContributionIds([out, inn], offBudget, "groceries", "2026-08-01"),
    ]).toEqual([]);
  });

  it("keeps the on-budget leg of a transfer to an off-budget account", () => {
    const out = tx({
      id: "saving-out",
      transactionDate: "2026-08-09",
      derivedFlow: "internal_transfer",
      transferGroupId: "outside",
    });
    const inn = tx({
      id: "saving-in",
      accountId: "savings",
      transactionDate: "2026-08-09",
      amountCents: 1000,
      derivedFlow: "internal_transfer",
      transferGroupId: "outside",
    });
    expect([
      ...activityContributionIds([out, inn], offBudget, "groceries", "2026-08-01"),
    ]).toEqual(["saving-out"]);
  });

  it("includes the last day of the month and excludes the first of the next", () => {
    const last = tx({ id: "last", transactionDate: "2026-08-31" });
    const next = tx({ id: "next", transactionDate: "2026-09-01" });
    expect([
      ...activityContributionIds([last, next], offBudget, "groceries", "2026-08-01"),
    ]).toEqual(["last"]);
  });

  it("drops another envelope and a superseded pending row", () => {
    const mine = tx({ id: "mine", transactionDate: "2026-08-12" });
    const other = tx({
      id: "other",
      transactionDate: "2026-08-12",
      budgetCategoryId: "rent",
      budgetCategoryName: "Rent",
    });
    const stale = tx({
      id: "stale",
      transactionDate: "2026-08-12",
      pending: true,
    });
    expect([
      ...activityContributionIds(
        [mine, other, stale],
        offBudget,
        "groceries",
        "2026-08-01",
        new Set(["stale"]),
      ),
    ]).toEqual(["mine"]);
  });

  it("keeps a refund so inflows in the envelope still sum into Activity", () => {
    const refund = tx({
      id: "refund",
      transactionDate: "2026-08-20",
      amountCents: 400,
      derivedFlow: "refund",
    });
    expect([
      ...activityContributionIds([refund], offBudget, "groceries", "2026-08-01"),
    ]).toEqual(["refund"]);
  });
});
