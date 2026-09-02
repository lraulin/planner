import { describe, expect, it } from "vitest";
import type { AnalyticsRow } from "./analytics";
import {
  cashFlowSankey,
  SANKEY_FROM_SAVINGS,
  SANKEY_KEPT,
  SANKEY_SPENT,
  sankeyNodeDrill,
} from "./sankeyFlow";

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
    excludeFromBaseline: false,
    eventLabel: "",

    payeeId: null,
    payeeName: null,
    ...overrides,
  };
}

describe("cashFlowSankey", () => {
  it("balances income into Spent and Kept when money is left over", () => {
    const model = cashFlowSankey([
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
    ]);

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
    const model = cashFlowSankey([
      row({
        derivedFlow: "income",
        description: "PAYROLL",
        amountCents: 20000,
        derivedCategory: null,
      }),
      row({ derivedCategory: "Rent & Housing", amountCents: -50000 }),
    ]);

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
    const model = cashFlowSankey([
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
    ]);

    expect(model.spendCents).toBe(3000);
    expect(model.nodes.some((node) => node.label === "Uncategorized")).toBe(true);
  });

  it("splits categories into merchants when asked", () => {
    const model = cashFlowSankey(
      [
        row({
          derivedFlow: "income",
          description: "PAYROLL",
          amountCents: 10000,
          derivedCategory: null,
        }),
        row({
          derivedCategory: "Groceries",
          description: "WALMART",
          amountCents: -4000,
        }),
        row({ derivedCategory: "Groceries", description: "ALDI", amountCents: -2000 }),
      ],
      "category-merchant",
    );

    const grocerySinks = model.nodes.filter(
      (node) => node.stage === "sink" && node.id.startsWith("merchant:"),
    );
    expect(grocerySinks).toHaveLength(2);
  });
});

describe("sankeyNodeDrill", () => {
  it("maps node ids back to a drill key", () => {
    expect(sankeyNodeDrill(SANKEY_SPENT)).toEqual({
      kind: "sankey",
      id: "spent",
      role: "spent",
    });
    expect(sankeyNodeDrill("sink:Groceries")).toEqual({
      kind: "sankey",
      id: "Groceries",
      role: "category",
    });
    expect(sankeyNodeDrill("source:PAYROLL")).toEqual({
      kind: "sankey",
      id: "PAYROLL",
      role: "source",
    });
  });
});
