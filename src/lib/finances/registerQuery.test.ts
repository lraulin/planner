import { sliceBlock } from "@/lib/grid/serverQuery";
import { describe, expect, it } from "vitest";
import { customFilter, optionsFilter } from "@/lib/grid/customFilter";
import { effectiveFlow } from "./analytics";
import { activityViewFilters } from "./registerActivity";
import { THIS_MONTH_DATE_FILTER } from "./registerFields";
import type { TransactionListRow } from "./types";
import {
  parseRegisterQuery,
  notBudgetedIdsOf,
  prepareRegister,
  REGISTER_BLOCK_SIZE,
  registerDateBound,
  registerFacets,
  registerQueryKey,
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
    derivedCategory: null,
    derivedFlow: "spend",
    flowOverride: null,

    notes: "",
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

  it("accepts All Transactions' This Month options-filter", () => {
    const parsed = parseRegisterQuery({
      filters: { date: THIS_MONTH_DATE_FILTER },
      today: "2026-08-24",
    });
    expect(parsed.filters.date).toEqual(THIS_MONTH_DATE_FILTER);
    expect(parsed.today).toBe("2026-08-24");
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
    // The filter keeps one row; the list for the column still offers both, so ticking a value
    // does not shrink the list it was ticked from.
    expect(
      registerFacets(
        ledger,
        query({ groupBy: [], filters: { payee: optionsFilter(["value:Walmart"]) } }),
        EMPTY_CTX,
      ).payee.sort(),
    ).toEqual(["Geico", "Walmart"]);
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
    expect(registerFacets(ledger, query({ groupBy: [] }), ctx).category.sort()).toEqual(
      ["Not budgeted", "Uncategorized"],
    );

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
      const block = sliceBlock(ledger, prepared.index.nodeIds, offset);
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

describe("registerQueryKey", () => {
  it("is stable for the same collapsed set in any order", () => {
    const left = query({ collapsedGroups: ["group:year:2024", "group:year:2025"] });
    const right = query({ collapsedGroups: ["group:year:2025", "group:year:2024"] });
    expect(registerQueryKey(left)).toBe(registerQueryKey(right));
  });
});

describe("Date calendar bands", () => {
  const ledger = [
    tx({ id: "july", transactionDate: "2026-07-31" }),
    tx({ id: "aug-1", transactionDate: "2026-08-01" }),
    tx({ id: "aug-24", transactionDate: "2026-08-24" }),
    tx({ id: "sep", transactionDate: "2026-09-01" }),
  ];

  it("scopes All Transactions This Month to the current calendar month", () => {
    const prepared = prepareRegister(
      ledger,
      query({ groupBy: [], filters: { date: THIS_MONTH_DATE_FILTER } }),
      EMPTY_CTX,
    );
    expect(prepared.index.nodeIds.sort()).toEqual(["aug-1", "aug-24"]);
    expect(prepared.index.shown).toBe(2);
    expect(prepared.index.total).toBe(4);
  });

  it("still applies custom gte/lte month bounds, including a non-current month", () => {
    // Activity chips are this shape. Calendar kind must not treat them as relative bands.
    const july = activityViewFilters("Groceries", "2026-07-01").date;
    const prepared = prepareRegister(
      ledger,
      query({ groupBy: [], filters: { date: july } }),
      EMPTY_CTX,
    );
    expect(prepared.index.nodeIds).toEqual(["july"]);
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

describe("registerDateBound", () => {
  const bound = (over: Partial<RegisterQuery>) => registerDateBound(query(over));
  const band = (...ids: string[]) => ({ date: optionsFilter(ids) });
  const custom = (join: "and" | "or", ...conditions: [string, string][]) => ({
    date: {
      mode: "custom" as const,
      join,
      conditions: conditions.map(([op, value]) => ({
        op: op as "gte",
        value,
      })),
    },
  });

  it("bounds each calendar band by the days the filter itself matches", () => {
    // today is 2026-08-24
    expect(bound({ filters: band("this-month") })).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(bound({ filters: band("last-month") })).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(bound({ filters: band("this-year") })).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
    // Both lookbacks include today.
    expect(bound({ filters: band("last-7-days") })).toEqual({
      from: "2026-08-18",
      to: "2026-08-24",
    });
    expect(bound({ filters: band("last-30-days") })).toEqual({
      from: "2026-07-26",
      to: "2026-08-24",
    });
  });

  it("covers every band of an OR of bands, and gives up on an id that is not one", () => {
    expect(bound({ filters: band("this-month", "last-month") })).toEqual({
      from: "2026-07-01",
      to: "2026-08-31",
    });
    // `nonblanks` matches every dated row; an unknown id matches everything too.
    expect(bound({ filters: band("this-month", "nonblanks") })).toBeNull();
    expect(bound({ filters: band("some-achieve-id") })).toBeNull();
  });

  it("bounds a custom comparison with a day, on one side or both", () => {
    expect(
      bound({ filters: custom("and", ["gte", "2026-03-01"], ["lte", "2026-04-30"]) }),
    ).toEqual({ from: "2026-03-01", to: "2026-04-30" });
    expect(bound({ filters: custom("and", ["gt", "2026-03-01"]) })).toEqual({
      from: "2026-03-01",
      to: null,
    });
    expect(bound({ filters: custom("and", ["lt", "2026-03-01"]) })).toEqual({
      from: null,
      to: "2026-03-01",
    });
    expect(bound({ filters: custom("and", ["eq", "2026-03-05"]) })).toEqual({
      from: "2026-03-05",
      to: "2026-03-05",
    });
    // AND narrows, so the tightest of two lower bounds wins.
    expect(
      bound({ filters: custom("and", ["gte", "2026-01-01"], ["gte", "2026-06-01"]) }),
    ).toEqual({ from: "2026-06-01", to: null });
  });

  it("keeps a side open for an OR when any branch leaves it open", () => {
    expect(
      bound({ filters: custom("or", ["gte", "2026-06-01"], ["lte", "2026-02-01"]) }),
    ).toBeNull();
    expect(
      bound({ filters: custom("or", ["gte", "2026-06-01"], ["gte", "2026-03-01"]) }),
    ).toEqual({ from: "2026-03-01", to: null });
  });

  it("gives no bound when a day it cannot read, or a condition that is not a comparison", () => {
    expect(bound({ filters: custom("and", ["gte", "last tuesday"]) })).toBeNull();
    expect(bound({ filters: custom("and", ["neq", "2026-03-05"]) })).toBeNull();
    expect(bound({ filters: custom("and", ["contains", "2026"]) })).toBeNull();
  });

  it("gives no bound for an unknown today", () => {
    // Every band matches everything while today is unknown, so the read cannot be narrowed.
    expect(bound({ today: null, filters: band("this-month") })).toBeNull();
  });

  it("gives no bound for a view whose base set comes from the whole ledger", () => {
    expect(bound({ viewId: "uncategorized", filters: band("this-month") })).toBeNull();
    expect(
      bound({
        viewId: "activity",
        category: "groceries",
        month: "2026-08",
        filters: band("this-month"),
      }),
    ).toBeNull();
  });

  it("gives no bound when the date condition lives only in the advanced filter, or is absent", () => {
    expect(bound({ filters: {} })).toBeNull();
    expect(
      bound({
        filters: {},
        advancedFilter: {
          join: "and",
          conditions: [{ columnId: "date", op: "gte", value: "2026-08-01" }],
        },
      }),
    ).toBeNull();
  });
});

describe("a windowed prepare", () => {
  // A transfer straddles the window edge, one leg on an off-budget account, an
  // internal transfer and ordinary spend on both sides of it.
  const ledger = [
    tx({ id: "new-spend", transactionDate: "2026-08-20" }),
    tx({
      id: "in-window-leg",
      accountId: "checking",
      transactionDate: "2026-08-02",
      derivedFlow: "internal_transfer",
      transferGroupId: "pair",
    }),
    tx({ id: "old-spend", transactionDate: "2026-06-10" }),
    tx({
      id: "outside-leg",
      accountId: "card",
      transactionDate: "2026-07-30",
      derivedFlow: "internal_transfer",
      transferGroupId: "pair",
    }),
    tx({
      id: "to-savings",
      accountId: "checking",
      transactionDate: "2026-08-05",
      derivedFlow: "internal_transfer",
      transferGroupId: "out",
    }),
    tx({
      id: "from-checking",
      accountId: "savings",
      transactionDate: "2026-08-05",
      derivedFlow: "internal_transfer",
      transferGroupId: "out",
    }),
    tx({
      id: "unpaired-internal",
      transactionDate: "2026-08-07",
      derivedFlow: "internal_transfer",
    }),
    tx({ id: "savings-interest", accountId: "savings", transactionDate: "2026-08-09" }),
  ];
  const ctx: RegisterQueryContext = {
    ...EMPTY_CTX,
    offBudgetAccountIds: new Set(["savings"]),
  };

  /** What the SQL subset read selects, from the ledger: the three reasons a row can be refused. */
  const subset = ledger
    .filter(
      (row) =>
        ctx.offBudgetAccountIds.has(row.accountId) ||
        row.transferGroupId !== null ||
        row.derivedFlow === "internal_transfer",
    )
    .map((row) => ({
      id: row.id,
      accountId: row.accountId,
      transactionDate: row.transactionDate,
      transferGroupId: row.transferGroupId ?? null,
      effectiveFlow: effectiveFlow(row),
    }));

  it("answers a This Month query exactly as the whole ledger does", () => {
    const thisMonth = query({ filters: { date: THIS_MONTH_DATE_FILTER }, groupBy: [] });
    const bound = registerDateBound(thisMonth);
    if (!bound) throw new Error("expected a bound");
    const window = ledger.filter(
      (row) =>
        (bound.from === null || row.transactionDate >= bound.from) &&
        (bound.to === null || row.transactionDate <= bound.to),
    );

    const whole = prepareRegister(ledger, thisMonth, ctx);
    const windowed = prepareRegister(window, thisMonth, ctx, {
      total: ledger.length,
      notBudgetedIds: notBudgetedIdsOf(subset, ctx.offBudgetAccountIds),
    });

    expect(windowed).toEqual(whole);
    // The leg outside the window is still refused its Category, because its partner is.
    expect(windowed.index.notBudgetedIds).toContain("in-window-leg");
    expect(windowed.index.total).toBe(ledger.length);
    expect(windowed.index.shown).toBeLessThan(windowed.index.total);
  });

  it("judges a leg whose partner is outside the window by the partner, not by the window", () => {
    // Annotating the window alone would see one leg of `pair` and call it assignable.
    const alone = prepareRegister(
      ledger.filter((row) => row.id === "in-window-leg"),
      query({ groupBy: [] }),
      ctx,
    );
    expect(alone.block.rows[0].categoryAssignable).toBe(true);

    const withSubset = prepareRegister(
      ledger.filter((row) => row.id === "in-window-leg"),
      query({ groupBy: [] }),
      ctx,
      {
        total: ledger.length,
        notBudgetedIds: notBudgetedIdsOf(subset, ctx.offBudgetAccountIds),
      },
    );
    expect(withSubset.block.rows[0].categoryAssignable).toBe(false);
  });

  it("refuses to prepare a derived view from a window", () => {
    expect(() =>
      prepareRegister([], query({ viewId: "uncategorized" }), ctx, {
        total: 0,
        notBudgetedIds: [],
      }),
    ).toThrow();
  });
});
