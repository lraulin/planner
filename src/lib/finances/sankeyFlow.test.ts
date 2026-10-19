import { describe, expect, it } from "vitest";
import { effectiveCategory, effectiveMerchant, type AnalyticsRow } from "./analytics";
import {
  budgetGroupSankey,
  cashFlowSankey,
  SANKEY_FROM_SAVINGS,
  SANKEY_KEPT,
  SANKEY_SPENT,
  type BudgetGroupSankeyRow,
} from "./sankeyFlow";

const byCategory = {
  source: (row: AnalyticsRow) => effectiveMerchant(row),
  sink: effectiveCategory,
};

function row(overrides: Partial<AnalyticsRow> = {}): AnalyticsRow {
  return {
    id: crypto.randomUUID(),
    accountId: "checking",
    accountName: "360 Checking",
    accountKind: "checking",
    transactionDate: "2026-03-14",
    description: "WM SUPERCENTER #1981",
    amountCents: -8412,
    sourceCategory: "",
    derivedCategory: "Groceries",
    derivedFlow: "spend",
    flowOverride: null,
    transferGroupId: null,

    payeeId: null,
    payeeName: null,
    ...overrides,
  };
}

describe("cashFlowSankey", () => {
  it("balances income into Spent and Kept when money is left over", () => {
    const model = cashFlowSankey(
      [
        row({
          derivedFlow: "income",
          description: "PAYROLL",
          amountCents: 100000,
          derivedCategory: null,
        }),
        row({ derivedCategory: "Groceries", amountCents: -40000 }),
        row({ derivedCategory: "Dining", amountCents: -10000 }),
        row({
          derivedFlow: "internal_transfer",
          amountCents: -20000,
          derivedCategory: null,
        }),
      ],
      byCategory,
    );

    expect(model.incomeCents).toBe(100000);
    expect(model.spendCents).toBe(50000);
    expect(model.netCents).toBe(50000);
    expect(
      model.nodes.some((node) => node.id === SANKEY_KEPT && node.cents === 50000),
    ).toBe(true);
    expect(
      model.nodes.some((node) => node.id === SANKEY_SPENT && node.cents === 50000),
    ).toBe(true);
    const outOfSpent = model.links
      .filter((link) => link.source === SANKEY_SPENT)
      .reduce((total, link) => total + link.cents, 0);
    expect(outOfSpent).toBe(50000);
    expect(model.nodes.some((node) => node.label === "Uncategorized")).toBe(false);
  });

  it("adds a From savings source when spending exceeds income", () => {
    const model = cashFlowSankey(
      [
        row({
          derivedFlow: "income",
          description: "PAYROLL",
          amountCents: 20000,
          derivedCategory: null,
        }),
        row({ derivedCategory: "Rent & Housing", amountCents: -50000 }),
      ],
      byCategory,
    );

    expect(model.netCents).toBe(-30000);
    const fromSavings = model.nodes.find((node) => node.id === SANKEY_FROM_SAVINGS);
    expect(fromSavings?.cents).toBe(30000);
    expect(
      model.links.some(
        (link) => link.source === SANKEY_FROM_SAVINGS && link.cents === 30000,
      ),
    ).toBe(true);
  });

  it("keeps Uncategorized as a sink and drops transfers from spend", () => {
    const model = cashFlowSankey(
      [
        row({
          derivedFlow: "income",
          description: "PAYROLL",
          amountCents: 10000,
          derivedCategory: null,
        }),
        row({ derivedCategory: null, sourceCategory: "", amountCents: -3000 }),
        row({
          derivedFlow: "internal_transfer",
          amountCents: -8000,
          derivedCategory: null,
        }),
      ],
      byCategory,
    );

    expect(model.spendCents).toBe(3000);
    expect(model.nodes.some((node) => node.label === "Uncategorized")).toBe(true);
  });
});

describe("budgetGroupSankey", () => {
  const groups = [
    { id: "housing", name: "Housing", parentGroupId: null },
    { id: "utilities", name: "Utilities", parentGroupId: "housing" },
    { id: "fun", name: "Discretionary", parentGroupId: null },
  ];

  function envelopeRow(
    overrides: Partial<BudgetGroupSankeyRow> = {},
  ): BudgetGroupSankeyRow {
    return {
      ...row({ derivedCategory: null }),
      budgetCategoryName: "Groceries",
      budgetCategoryId: "groceries",
      groupId: null,
      envelopeKind: "spending",
      ...overrides,
    };
  }

  function sinks(model: ReturnType<typeof budgetGroupSankey>) {
    return Object.fromEntries(
      model.nodes
        .filter((node) => node.stage === "sink")
        .map((node) => [node.label, node.cents]),
    );
  }

  it("rolls envelopes up to their top-level group", () => {
    const model = budgetGroupSankey(
      [
        envelopeRow({
          budgetCategoryName: "Rent",
          budgetCategoryId: "rent",
          groupId: "housing",
          amountCents: -150000,
        }),
        envelopeRow({
          budgetCategoryName: "Electricity",
          budgetCategoryId: "power",
          groupId: "utilities",
          amountCents: -9000,
        }),
        envelopeRow({
          budgetCategoryName: "Eating Out",
          budgetCategoryId: "eating",
          groupId: "fun",
          amountCents: -4000,
        }),
        envelopeRow({
          budgetCategoryName: "Clothes",
          budgetCategoryId: "clothes",
          groupId: "fun",
          amountCents: -2500,
        }),
      ],
      groups,
    );

    // Utilities nests under Housing, so it is not a node of its own.
    expect(sinks(model)).toEqual({ Housing: 159000, Discretionary: 6500 });
  });

  it("lets an ungrouped envelope stand as its own node on either side", () => {
    const model = budgetGroupSankey(
      [
        envelopeRow({
          derivedFlow: "income",
          description: "ACME PAYROLL",
          amountCents: 300000,
          budgetCategoryName: "Payroll",
          budgetCategoryId: "payroll",
          envelopeKind: "income",
        }),
        envelopeRow({
          derivedFlow: "income",
          description: "VA TREAS 310",
          amountCents: 18000,
          budgetCategoryName: "VA",
          budgetCategoryId: "va",
          envelopeKind: "income",
        }),
        envelopeRow({ amountCents: -6000 }),
      ],
      groups,
    );

    const sources = model.nodes
      .filter((node) => node.stage === "source")
      .map((node) => node.label);
    expect(sources).toEqual(["Payroll", "VA"]);
    expect(sinks(model)).toEqual({ Groceries: 6000 });
  });

  it("counts uncategorized money crossing the boundary under its own node", () => {
    const model = budgetGroupSankey(
      [
        envelopeRow({
          derivedFlow: "external_transfer",
          description: "COINBASE SELL",
          amountCents: 50000,
          budgetCategoryName: null,
          budgetCategoryId: null,
        }),
        envelopeRow({
          derivedFlow: "external_transfer",
          description: "TRANSFER TO CREDIT UNION",
          amountCents: -20000,
          budgetCategoryName: null,
          budgetCategoryId: null,
        }),
        envelopeRow({
          amountCents: -1000,
          budgetCategoryName: null,
          budgetCategoryId: null,
        }),
      ],
      groups,
    );

    expect(model.incomeCents).toBe(50000);
    expect(model.nodes.find((node) => node.stage === "source")?.label).toBe(
      "Transfers in",
    );
    expect(sinks(model)).toEqual({ "Transfers out": 20000, Uncategorized: 1000 });
  });
});
