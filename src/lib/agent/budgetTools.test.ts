import { describe, expect, it } from "vitest";
import { buildBudget, findMonth } from "@/lib/finances/budget/envelope";
import { BudgetOperationRefused } from "@/lib/finances/budget/mutations";
import type { BudgetCategoryRow, BudgetGroupRow } from "@/lib/finances/budget/queries";
import { budgetAgentError, budgetMonthResponse } from "./budgetTools";
import { AgentError } from "./errors";

function group(
  id: string,
  kind: BudgetGroupRow["kind"],
  sortKey: string,
  hidden = false,
  parentGroupId: string | null = null,
): BudgetGroupRow {
  return { id, parentGroupId, name: id, kind, sortKey, hidden };
}

function envelope(
  id: string,
  kind: BudgetCategoryRow["kind"],
  groupId: string | null,
  sortKey: string,
  hidden = false,
): BudgetCategoryRow {
  return {
    id,
    groupId,
    name: id,
    sortKey,
    hidden,
    notes: "",
    target: null,
    kind,
    incomeRole: "other",
    expectedMonthlyIncomeCents: null,
    isIncome: kind === "income",
    bill:
      kind === "bill"
        ? {
            status: "active",
            cancelledOn: null,
            url: "",
            cadenceMonths: 1,
            cadenceDays: null,
            dueDay: null,
            leadDays: 0,
            anchorDate: null,
            scheduled: true,
            expectedCents: null,
          }
        : null,
  };
}

const GROUPS = [
  group("Pay", "income", "a"),
  group("Home", "spending", "b"),
  group("Old stuff", "spending", "c", true),
  group("Funds", "savings", "d"),
];

const CATEGORIES = [
  envelope("Salary", "income", "Pay", "a"),
  envelope("Groceries", "spending", "Home", "b"),
  envelope("House", "spending", "Home", "a"),
  envelope("Retired", "spending", "Home", "c", true),
  envelope("Hobby", "spending", "Old stuff", "a"),
  envelope("Rent", "bill", null, "a"),
  envelope("Vet / Pet Medical", "savings", "Funds", "a"),
];

function fixture() {
  const months = buildBudget({
    categories: CATEGORIES.map((row) => ({
      id: row.id,
      groupId: row.groupId,
      incomeRole: "other",
      expectedMonthlyIncomeCents: null,
      isIncome: row.isIncome,
    })),
    allocations: [
      {
        month: "2026-10-01",
        categoryId: "House",
        amountCents: 100_000,
        carryover: false,
        snoozed: false,
      },
      {
        month: "2026-10-01",
        categoryId: "Rent",
        amountCents: 150_000,
        carryover: false,
        snoozed: false,
      },
      {
        month: "2026-10-01",
        categoryId: "Hobby",
        amountCents: 5_000,
        carryover: false,
        snoozed: false,
      },
    ],
    activity: [
      { month: "2026-10-01", categoryId: "Salary", amountCents: 400_000 },
      { month: "2026-10-01", categoryId: "House", amountCents: -12_345 },
    ],
    buffered: [],
    startMonth: "2026-10-01",
    endMonth: "2026-11-01",
    openingCents: 0,
  });
  const month = findMonth(months, "2026-10-01");
  if (!month) throw new Error("no October");
  return {
    groups: GROUPS,
    categories: CATEGORIES,
    months,
    month,
    goals: { "2026-10-01|House": 90_000 },
    uncategorizedCount: 2,
    uncategorizedCents: -4_200,
  };
}

describe("budgetMonthResponse", () => {
  it("lists expense envelopes in Budget page order with the month's numbers", () => {
    const response = budgetMonthResponse(fixture(), { includeHidden: false });
    // Ids here are readable names; the schema check, with real uuids, is in defaultResponseBudget.test.ts.
    expect(response.month).toBe("2026-10");
    expect(response.firstMonth).toBe("2026-10");
    expect(response.lastMonth).toBe("2026-11");
    expect(response.envelopes.map((row) => row.name)).toEqual([
      // Bills, then Envelopes, then Savings; within a group by name, as the page sorts.
      "Rent",
      "Groceries",
      "House",
      "Vet / Pet Medical",
    ]);
    expect(response.envelopes[2]).toEqual({
      id: "House",
      name: "House",
      kind: "spending",
      groupId: "Home",
      assignedCents: 100_000,
      activityCents: -12_345,
      availableCents: 87_655,
      goalCents: 90_000,
    });
    expect(response.income).toEqual([
      { id: "Salary", name: "Salary", groupId: "Pay", receivedCents: 400_000 },
    ]);
    expect(response.uncategorized).toEqual({ count: 2, cents: -4_200 });
  });

  it("leaves hidden envelopes and hidden groups out of the lists but not the totals", () => {
    const response = budgetMonthResponse(fixture(), { includeHidden: false });
    expect(response.hiddenEnvelopeCount).toBe(2);
    expect(response.groups.map((row) => row.id)).toEqual(["Pay", "Home", "Funds"]);
    // Hobby's $50 sits in a hidden group and still counts.
    expect(response.summary.assignedCents).toBe(255_000);
    expect(response.summary.incomeCents).toBe(400_000);
    expect(response.summary.readyToAssignCents).toBe(400_000 - 255_000);
  });

  it("shows them, flagged, when includeHidden is set", () => {
    const response = budgetMonthResponse(fixture(), { includeHidden: true });
    expect(response.hiddenEnvelopeCount).toBe(0);
    expect(response.envelopes.find((row) => row.id === "Retired")?.hidden).toBe(true);
    expect(response.envelopes.find((row) => row.id === "Hobby")).toBeDefined();
    expect(
      response.envelopes.find((row) => row.id === "House")?.hidden,
    ).toBeUndefined();
    expect(response.groups.map((row) => row.id)).toContain("Old stuff");
  });

  it("pages the expense envelopes and leaves income and summary on every page", () => {
    const first = budgetMonthResponse(fixture(), { includeHidden: false, limit: 3 });
    expect(first.envelopes).toHaveLength(3);
    expect(first.pageInfo).toMatchObject({ total: 4, hasMore: true, nextOffset: 3 });
    const second = budgetMonthResponse(fixture(), {
      includeHidden: false,
      offset: first.pageInfo.nextOffset ?? 0,
      limit: 3,
    });
    expect(second.envelopes.map((row) => row.name)).toEqual(["Vet / Pet Medical"]);
    expect(second.income).toHaveLength(1);
    expect(second.summary).toEqual(first.summary);
  });
});

describe("budgetAgentError", () => {
  it("turns the mutations' plain sentences into validation or not_found", () => {
    const refused = budgetAgentError(
      new Error("Groceries holds spending envelopes, not savings."),
    );
    expect(refused).toBeInstanceOf(AgentError);
    expect((refused as AgentError).code).toBe("validation");
    expect((refused as AgentError).message).toBe(
      "Groceries holds spending envelopes, not savings.",
    );
    expect(
      (budgetAgentError(new Error("That envelope does not exist.")) as AgentError).code,
    ).toBe("not_found");
    expect(
      (budgetAgentError(new Error("Transaction not found.")) as AgentError).code,
    ).toBe("not_found");
  });

  it("treats an exact-move refusal as validation", () => {
    const error = budgetAgentError(
      new BudgetOperationRefused("House has $1.00 available."),
    );
    expect((error as AgentError).code).toBe("validation");
  });

  it("maps a unique violation, even wrapped, to conflict", () => {
    const wrapped = new Error("insert into …", { cause: { code: "23505" } });
    expect((budgetAgentError(wrapped) as AgentError).code).toBe("conflict");
  });

  it("leaves driver and wrapped errors alone, so they stay internal", () => {
    const wrapped = new Error("select …", { cause: new Error("connection reset") });
    expect(budgetAgentError(wrapped)).toBe(wrapped);
    class DriverError extends Error {}
    const driver = new DriverError("boom");
    expect(budgetAgentError(driver)).toBe(driver);
  });
});
