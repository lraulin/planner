import { describe, expect, it } from "vitest";
import { customFilter, optionsFilter } from "@/lib/grid/customFilter";
import type { TransactionListRow } from "./types";
import {
  parseBlockOffset,
  parseRegisterQuery,
  prepareRegister,
  REGISTER_BLOCK_SIZE,
  registerQueryKey,
  sliceRegisterBlock,
  type RegisterQuery,
  type RegisterQueryContext,
} from "./registerQuery";

const EMPTY_CTX: RegisterQueryContext = {
  offBudgetAccountIds: new Set(),
  budgetStartMonth: "2026-01-01",
};

function tx(
  over: Partial<TransactionListRow> &
    Pick<TransactionListRow, "id" | "transactionDate">,
): TransactionListRow {
  return {
    accountId: "acct",
    accountName: "Checking",
    accountKind: "checking",
    postedDate: over.transactionDate,
    pending: false,
    description: over.description ?? over.id,
    amountCents: -1000,
    sourceCategory: "",
    externalSource: null,
    category: null,
    derivedCategory: null,
    derivedFlow: "spend",
    flowOverride: null,
    excludeFromBaseline: false,
    eventLabel: "",

    notes: "",
    tags: [],
    balanceAfterCents: null,
    budgetCategoryId: null,
    budgetCategoryName: null,
    payeeId: null,
    parentId: null,
    splitChildCount: 0,
    splitImbalanceCents: 0,
    payeeName: null,
    ...over,
  };
}

function query(over: Partial<RegisterQuery> = {}): RegisterQuery {
  return parseRegisterQuery({
    viewId: "all",
    search: "",
    filters: {},
    sorts: [{ columnId: "date", direction: "desc" }],
    groupBy: ["year", "month"],
    collapsedGroups: [],
    today: "2026-08-24",
    ...over,
  });
}

describe("parseRegisterQuery", () => {
  it("drops unknown columns, caps search, and ignores a hidden-column sort", () => {
    const parsed = parseRegisterQuery({
      viewId: "nope",
      search: "x".repeat(500),
      filters: {
        payee: optionsFilter(["value:Walmart"]),
        invented: optionsFilter(["x"]),
      },
      sorts: [
        { columnId: "payee", direction: "asc" },
        { columnId: "date", direction: "desc" },
      ],
      visibleColumnIds: ["date", "description"],
      groupBy: ["year", "account", "year", "priority"],
      today: "not-a-date",
    });
    expect(parsed.viewId).toBe("all");
    expect(parsed.search).toHaveLength(200);
    expect(parsed.filters).toEqual({ payee: optionsFilter(["value:Walmart"]) });
    expect(parsed.sorts).toEqual([{ columnId: "date", direction: "desc" }]);
    expect(parsed.groupBy).toEqual(["year", "account"]);
    expect(parsed.today).toBeNull();
  });

  it("keeps Amount > 0 when the operand arrives as a JSON number", () => {
    // jsonb / Flight may hand 0 as a number. Dropping non-strings to "" made the
    // register show `[Amount] > ''` and match nothing.
    const parsed = parseRegisterQuery({
      filters: {
        amount: { mode: "custom", join: "and", conditions: [{ op: "gt", value: 0 }] },
      },
    });
    expect(parsed.filters).toEqual({
      amount: customFilter("and", [{ op: "gt", value: "0" }]),
    });
  });
});

describe("prepareRegister", () => {
  it("searches the hidden Payee column across all history", () => {
    const ledger = [
      tx({
        id: "a",
        transactionDate: "2024-03-01",
        description: "WM SUPERCENTER #1981",
        payeeName: "Walmart",
      }),
      tx({
        id: "b",
        transactionDate: "2026-08-01",
        description: "GEICO *AUTO",
        payeeName: "Geico",
      }),
    ];
    const prepared = prepareRegister(
      ledger,
      query({ search: "walmart", groupBy: [] }),
      EMPTY_CTX,
    );
    expect(prepared.index.nodeIds).toEqual(["a"]);
    expect(prepared.index.shown).toBe(1);
    expect(prepared.index.total).toBe(2);
  });

  it("filters Amount > 0 to deposits, including a blank operand", () => {
    const ledger = [
      tx({ id: "out", transactionDate: "2026-08-01", amountCents: -500 }),
      tx({ id: "in", transactionDate: "2026-08-02", amountCents: 1200 }),
      tx({ id: "zero", transactionDate: "2026-08-03", amountCents: 0 }),
    ];
    const greaterThanZero = customFilter("and", [{ op: "gt", value: "0" }]);
    const blankOperand = customFilter("and", [{ op: "gt", value: "" }]);

    expect(
      prepareRegister(
        ledger,
        query({ groupBy: [], filters: { amount: greaterThanZero } }),
        EMPTY_CTX,
      ).index.nodeIds,
    ).toEqual(["in"]);
    expect(
      prepareRegister(
        ledger,
        query({ groupBy: [], filters: { amount: blankOperand } }),
        EMPTY_CTX,
      ).index.nodeIds,
    ).toEqual(["in"]);
  });

  it("filters Amount (Positive) as a number band, not a text checklist", () => {
    // The funnel on a number column offers sign bands. If Amount stayed text, (Positive)
    // would be an unknown option id and pass every row.
    const ledger = [
      tx({ id: "out", transactionDate: "2026-08-01", amountCents: -500 }),
      tx({ id: "in", transactionDate: "2026-08-02", amountCents: 1200 }),
      tx({ id: "zero", transactionDate: "2026-08-03", amountCents: 0 }),
    ];
    expect(
      prepareRegister(
        ledger,
        query({
          groupBy: [],
          filters: { amount: optionsFilter(["positive"]) },
        }),
        EMPTY_CTX,
      ).index.nodeIds,
    ).toEqual(["in"]);
  });

  it("filters Balance as a number and treats a missing running balance as blank, not zero", () => {
    // Card rows have no running balance. Collapsing that null into $0.00 would hide
    // them from (Blanks) and dump them into (Zero).
    const ledger = [
      tx({
        id: "card",
        transactionDate: "2026-08-01",
        balanceAfterCents: null,
      }),
      tx({
        id: "over",
        transactionDate: "2026-08-02",
        balanceAfterCents: -2500,
      }),
      tx({
        id: "ok",
        transactionDate: "2026-08-03",
        balanceAfterCents: 5000,
      }),
      tx({
        id: "flat",
        transactionDate: "2026-08-04",
        balanceAfterCents: 0,
      }),
    ];
    const run = (band: string) =>
      prepareRegister(
        ledger,
        query({ groupBy: [], filters: { balance: optionsFilter([band]) } }),
        EMPTY_CTX,
      ).index.nodeIds;

    expect(run("positive")).toEqual(["ok"]);
    expect(run("negative")).toEqual(["over"]);
    expect(run("zero")).toEqual(["flat"]);
    expect(run("blanks")).toEqual(["card"]);
  });

  it("filters on the hidden Payee column", () => {
    const ledger = [
      tx({
        id: "a",
        transactionDate: "2026-08-01",
        description: "WM SUPERCENTER #1981",
        payeeName: "Walmart",
      }),
      tx({
        id: "b",
        transactionDate: "2026-08-02",
        description: "GEICO *AUTO",
        payeeName: "Geico",
      }),
    ];
    const prepared = prepareRegister(
      ledger,
      query({
        groupBy: [],
        filters: { payee: optionsFilter(["value:Walmart"]) },
      }),
      EMPTY_CTX,
    );
    expect(prepared.index.nodeIds).toEqual(["a"]);
    expect(prepared.index.facets.payee.sort()).toEqual(["Geico", "Walmart"]);
  });

  it("keeps equal date rows in input order under a secondary account sort", () => {
    const ledger = [
      tx({
        id: "a",
        transactionDate: "2026-08-01",
        accountName: "Zed",
        description: "first",
      }),
      tx({
        id: "b",
        transactionDate: "2026-08-01",
        accountName: "Zed",
        description: "second",
      }),
      tx({
        id: "c",
        transactionDate: "2026-08-01",
        accountName: "Alpha",
        description: "third",
      }),
    ];
    const prepared = prepareRegister(
      ledger,
      query({
        groupBy: [],
        sorts: [
          { columnId: "account", direction: "asc" },
          { columnId: "date", direction: "desc" },
        ],
      }),
      EMPTY_CTX,
    );
    expect(prepared.index.nodeIds).toEqual(["c", "a", "b"]);
  });

  it("omits collapsed descendants from the index but not from shown", () => {
    const ledger = [
      tx({ id: "old", transactionDate: "2025-06-15", description: "OLD" }),
      tx({ id: "now", transactionDate: "2026-08-02", description: "NOW" }),
    ];
    const expanded = prepareRegister(ledger, query({ collapsedGroups: [] }), EMPTY_CTX);
    const collapsed = prepareRegister(
      ledger,
      query({ collapsedGroups: ["group:year:2025"] }),
      EMPTY_CTX,
    );
    expect(expanded.index.nodeIds.sort()).toEqual(["now", "old"]);
    expect(collapsed.index.nodeIds).toEqual(["now"]);
    expect(collapsed.index.shown).toBe(2);
    expect(
      collapsed.index.entries.some((entry) => entry.id === "group:year:2025"),
    ).toBe(true);
    expect(collapsed.index.entries.some((entry) => entry.id === "old")).toBe(false);
  });

  it("treats a stale column filter as inert rather than emptying the grid", () => {
    const ledger = [tx({ id: "a", transactionDate: "2026-08-01" })];
    const prepared = prepareRegister(
      ledger,
      {
        ...query({ groupBy: [] }),
        filters: { gone: optionsFilter(["nope"]) },
      },
      EMPTY_CTX,
    );
    expect(prepared.index.nodeIds).toEqual(["a"]);
  });

  it("carries whole-ledger Category assignability into filters and lazy row blocks", () => {
    const ledger = [
      tx({
        id: "card-out",
        accountId: "checking",
        transactionDate: "2026-08-10",
        derivedFlow: "internal_transfer",
        transferGroupId: "inside",
      }),
      tx({
        id: "card-in",
        accountId: "card",
        transactionDate: "2026-08-10",
        amountCents: 1_000,
        derivedFlow: "internal_transfer",
        transferGroupId: "inside",
      }),
      tx({
        id: "saving-out",
        accountId: "checking",
        transactionDate: "2026-08-09",
        derivedFlow: "internal_transfer",
        transferGroupId: "outside",
      }),
      tx({
        id: "saving-in",
        accountId: "savings",
        transactionDate: "2026-08-09",
        amountCents: 1_000,
        derivedFlow: "internal_transfer",
        transferGroupId: "outside",
      }),
      tx({
        id: "unpaired",
        accountId: "checking",
        transactionDate: "2025-08-08",
        derivedFlow: "internal_transfer",
      }),
      tx({
        id: "historical-spend",
        accountId: "checking",
        transactionDate: "2025-08-07",
      }),
    ];
    const ctx = { ...EMPTY_CTX, offBudgetAccountIds: new Set(["savings"]) };
    const prepared = prepareRegister(
      ledger,
      query({ groupBy: [], collapsedGroups: [] }),
      ctx,
    );

    expect(prepared.index.notBudgetedIds.sort()).toEqual([
      "card-in",
      "card-out",
      "saving-in",
      "unpaired",
    ]);
    expect(
      Object.fromEntries(
        prepared.block.rows.map((row) => [row.id, row.categoryAssignable]),
      ),
    ).toMatchObject({
      "card-out": false,
      "card-in": false,
      "saving-out": true,
      "saving-in": false,
      unpaired: false,
      "historical-spend": true,
    });
    expect(prepared.index.facets.category.sort()).toEqual([
      "Not budgeted",
      "Uncategorized",
    ]);

    const notBudgeted = prepareRegister(
      ledger,
      query({
        groupBy: [],
        filters: { category: optionsFilter(["value:Not budgeted"]) },
      }),
      ctx,
    );
    expect(notBudgeted.index.nodeIds.sort()).toEqual([
      "card-in",
      "card-out",
      "saving-in",
      "unpaired",
    ]);
  });

  it("keeps non-budgeted metadata for a transfer hidden by group collapse", () => {
    const prepared = prepareRegister(
      [
        tx({
          id: "hidden-transfer",
          accountId: "checking",
          transactionDate: "2025-08-01",
          derivedFlow: "internal_transfer",
        }),
      ],
      query({ collapsedGroups: ["group:year:2025"] }),
      EMPTY_CTX,
    );

    expect(prepared.index.nodeIds).toEqual([]);
    expect(prepared.index.notBudgetedIds).toEqual(["hidden-transfer"]);
  });

  it("returns 100-row blocks without gaps or duplicates on a 7030-row ledger", () => {
    const ledger = Array.from({ length: 7030 }, (_, index) => {
      const year = 2021 + Math.floor(index / 1172);
      const day = (index % 28) + 1;
      const month = (Math.floor(index / 28) % 12) + 1;
      return tx({
        id: `tx-${index}`,
        transactionDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        description: `Merchant ${index % 17}`,
        amountCents: -((index % 90) + 1) * 100,
      });
    });
    const prepared = prepareRegister(
      ledger,
      query({ groupBy: [], collapsedGroups: [] }),
      EMPTY_CTX,
    );
    expect(prepared.index.nodeIds).toHaveLength(7030);
    expect(prepared.block.rows).toHaveLength(REGISTER_BLOCK_SIZE);
    expect(new Set(prepared.index.nodeIds).size).toBe(7030);

    const seen = new Set<string>();
    for (let offset = 0; offset < 7030; offset += REGISTER_BLOCK_SIZE) {
      const block = sliceRegisterBlock(ledger, prepared.index.nodeIds, offset);
      const expectCount = Math.min(REGISTER_BLOCK_SIZE, 7030 - offset);
      expect(block).toHaveLength(expectCount);
      for (const row of block) {
        expect(seen.has(row.id)).toBe(false);
        seen.add(row.id);
      }
    }
    expect(seen.size).toBe(7030);
    expect(prepared.block.rows.map((row) => row.id)).toEqual(
      prepared.index.nodeIds.slice(0, REGISTER_BLOCK_SIZE),
    );
  });

  it("can index every id when groups are expanded without returning every detail", () => {
    const ledger = Array.from({ length: 250 }, (_, index) =>
      tx({
        id: `tx-${index}`,
        transactionDate: `2026-08-${String((index % 28) + 1).padStart(2, "0")}`,
      }),
    );
    const prepared = prepareRegister(ledger, query({ collapsedGroups: [] }), EMPTY_CTX);
    expect(prepared.index.nodeIds).toHaveLength(250);
    expect(prepared.block.rows).toHaveLength(REGISTER_BLOCK_SIZE);
  });
});

describe("parseBlockOffset", () => {
  it("snaps to 100-row boundaries", () => {
    expect(parseBlockOffset(0)).toBe(0);
    expect(parseBlockOffset(99)).toBe(0);
    expect(parseBlockOffset(100)).toBe(100);
    expect(parseBlockOffset(-4)).toBe(0);
    expect(parseBlockOffset("150")).toBe(100);
  });
});

describe("registerQueryKey", () => {
  it("is stable for the same collapsed set in any order", () => {
    const left = query({ collapsedGroups: ["group:year:2024", "group:year:2025"] });
    const right = query({ collapsedGroups: ["group:year:2025", "group:year:2024"] });
    expect(registerQueryKey(left)).toBe(registerQueryKey(right));
  });
});

describe("activity view", () => {
  it("degrades missing or garbage category/month to All Transactions", () => {
    expect(parseRegisterQuery({ viewId: "activity" }).viewId).toBe("all");
    expect(
      parseRegisterQuery({
        viewId: "activity",
        category: "groceries",
        month: "2026-13",
      }).viewId,
    ).toBe("all");
    expect(
      parseRegisterQuery({
        viewId: "activity",
        category: "groceries",
        month: "2026-08",
      }),
    ).toMatchObject({
      viewId: "activity",
      category: "groceries",
      month: "2026-08-01",
    });
  });

  it("shows the contributing set: child not parent, no on-budget transfer, month bounds", () => {
    const ledger = [
      tx({
        id: "parent",
        transactionDate: "2026-08-10",
        amountCents: -5000,
        splitChildCount: 2,
        budgetCategoryId: null,
      }),
      tx({
        id: "child",
        transactionDate: "2026-08-10",
        amountCents: -2000,
        parentId: "parent",
        budgetCategoryId: "groceries",
        budgetCategoryName: "Groceries",
      }),
      tx({
        id: "spend",
        transactionDate: "2026-08-31",
        amountCents: -1500,
        budgetCategoryId: "groceries",
        budgetCategoryName: "Groceries",
      }),
      tx({
        id: "refund",
        transactionDate: "2026-08-15",
        amountCents: 400,
        derivedFlow: "refund",
        budgetCategoryId: "groceries",
        budgetCategoryName: "Groceries",
      }),
      tx({
        id: "next-month",
        transactionDate: "2026-09-01",
        amountCents: -900,
        budgetCategoryId: "groceries",
        budgetCategoryName: "Groceries",
      }),
      tx({
        id: "other-envelope",
        transactionDate: "2026-08-12",
        amountCents: -700,
        budgetCategoryId: "rent",
        budgetCategoryName: "Rent",
      }),
      tx({
        id: "card-out",
        transactionDate: "2026-08-10",
        amountCents: -3000,
        derivedFlow: "internal_transfer",
        transferGroupId: "inside",
        budgetCategoryId: "groceries",
        budgetCategoryName: "Groceries",
      }),
      tx({
        id: "card-in",
        accountId: "card",
        transactionDate: "2026-08-10",
        amountCents: 3000,
        derivedFlow: "internal_transfer",
        transferGroupId: "inside",
        budgetCategoryId: "groceries",
        budgetCategoryName: "Groceries",
      }),
    ];
    const prepared = prepareRegister(
      ledger,
      query({
        viewId: "activity",
        category: "groceries",
        month: "2026-08",
        groupBy: [],
      }),
      EMPTY_CTX,
    );
    expect(prepared.index.nodeIds.sort()).toEqual(["child", "refund", "spend"]);
    const byId = new Map(ledger.map((row) => [row.id, row]));
    const sum = prepared.index.nodeIds.reduce(
      (total, id) => total + (byId.get(id)?.amountCents ?? 0),
      0,
    );
    expect(sum).toBe(-3100);
  });
});
