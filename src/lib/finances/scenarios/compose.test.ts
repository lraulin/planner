import { describe, expect, it } from "vitest";
import { sourceColumns, lineSourceOf, type SupplyAmounts } from "./amount";
import {
  composeScenario,
  flattenLines,
  type ComposeInput,
  type ScenarioBillInput,
  type ScenarioLineInput,
} from "./compose";
import { splitLine } from "./split";

const NO_SUPPLY: SupplyAmounts = {
  itemMonthlyCents: new Map(),
  groupMonthlyCents: new Map(),
};

function bill(
  over: Partial<ScenarioBillInput> & { envelopeId: string },
): ScenarioBillInput {
  return {
    name: over.envelopeId,
    groupLabel: "Bills",
    status: "active",
    monthlyCents: 0,
    ...over,
  };
}

function manual(
  id: string,
  amountCents: number,
  over: Partial<ScenarioLineInput> = {},
): ScenarioLineInput {
  return {
    id,
    parentId: null,
    kind: "expense",
    sortKey: id,
    name: id,
    source: { type: "manual", amountCents, cadence: { unit: "month", n: 1 } },
    envelopeId: null,
    budgetGroupId: null,
    ...over,
  };
}

function input(over: Partial<ComposeInput> = {}): ComposeInput {
  return {
    bills: [],
    income: [],
    overrides: [],
    lines: [],
    supply: NO_SUPPLY,
    actuals: { byEnvelope: new Map(), byGroup: new Map() },
    billActuals: new Map(),
    ...over,
  };
}

const INCOME = [{ envelopeId: "pay", name: "Pay", expectedMonthlyCents: 480286 }];

describe("composeScenario — live rows", () => {
  it("starts as today: Regular income minus active bills, paused and cancelled left off", () => {
    const result = composeScenario(
      input({
        income: INCOME,
        bills: [
          bill({ envelopeId: "rent", monthlyCents: 210000 }),
          bill({ envelopeId: "phone", monthlyCents: 5500 }),
          bill({ envelopeId: "old", monthlyCents: 9999, status: "paused" }),
          bill({ envelopeId: "gone", monthlyCents: 1234, status: "cancelled" }),
        ],
      }),
    );
    expect(result.billsCents).toBe(215500);
    expect(result.incomeCents).toBe(480286);
    expect(result.remainderCents).toBe(480286 - 215500);
    expect(result.billRows.map((row) => [row.envelopeId, row.included])).toEqual([
      ["rent", true],
      ["phone", true],
      ["old", false],
      ["gone", false],
    ]);
  });

  it("reproduces the spreadsheet: Rent off, a mortgage line on", () => {
    const result = composeScenario(
      input({
        income: INCOME,
        bills: [
          bill({ envelopeId: "rent", monthlyCents: 210000 }),
          bill({ envelopeId: "everything-else", monthlyCents: 100171 }),
        ],
        overrides: [{ envelopeId: "rent", included: false, monthlyCents: null }],
        lines: [manual("mortgage", 242900, { name: "Mortgage" })],
      }),
    );
    expect(result.billsCents).toBe(100171);
    expect(result.linesCents).toBe(242900);
    expect(result.expenseCents).toBe(343071);
    expect(result.remainderCents).toBe(137215);
    expect(result.incomplete).toBe(false);
  });

  it("lets a paused bill be switched on for one scenario", () => {
    const result = composeScenario(
      input({
        bills: [bill({ envelopeId: "old", monthlyCents: 9999, status: "paused" })],
        overrides: [{ envelopeId: "old", included: true, monthlyCents: null }],
      }),
    );
    expect(result.billsCents).toBe(9999);
    expect(result.billRows[0]).toMatchObject({
      included: true,
      defaultIncluded: false,
      overridden: true,
    });
  });

  it("replaces a bill's amount only where overridden, and follows a repricing elsewhere", () => {
    const bills = (cents: number) => [
      bill({ envelopeId: "power", monthlyCents: cents }),
      bill({ envelopeId: "water", monthlyCents: 4000 }),
    ];
    const overrides = [{ envelopeId: "power", included: true, monthlyCents: 15000 }];

    const before = composeScenario(input({ bills: bills(12000), overrides }));
    const after = composeScenario(input({ bills: bills(13000), overrides }));
    const untouched = composeScenario(input({ bills: bills(13000) }));

    expect(before.billRows[0]).toMatchObject({
      monthlyCents: 15000,
      liveMonthlyCents: 12000,
    });
    // The overridden bill ignores the repricing; the scenario with no override follows it.
    expect(after.billRows[0].monthlyCents).toBe(15000);
    expect(untouched.billRows[0].monthlyCents).toBe(13000);
  });

  it("keeps an excluded bill's figure visible without counting it", () => {
    const result = composeScenario(
      input({
        bills: [bill({ envelopeId: "rent", monthlyCents: 210000 })],
        overrides: [{ envelopeId: "rent", included: false, monthlyCents: null }],
      }),
    );
    expect(result.billRows[0].monthlyCents).toBe(210000);
    expect(result.billsCents).toBe(0);
  });
});

describe("composeScenario — income", () => {
  it("marks the remainder incomplete when an included income has no figure", () => {
    const result = composeScenario(
      input({
        income: [
          ...INCOME,
          { envelopeId: "va", name: "VA", expectedMonthlyCents: null },
        ],
      }),
    );
    expect(result.incomplete).toBe(true);
    expect(result.incompleteNames).toEqual(["VA"]);
    expect(result.incomeCents).toBe(480286);
  });

  it("is complete again once an override supplies the figure, or the income is switched off", () => {
    const income = [
      ...INCOME,
      { envelopeId: "va", name: "VA", expectedMonthlyCents: null },
    ];
    const supplied = composeScenario(
      input({
        income,
        overrides: [{ envelopeId: "va", included: true, monthlyCents: 18000 }],
      }),
    );
    expect(supplied.incomplete).toBe(false);
    expect(supplied.incomeCents).toBe(498286);

    const off = composeScenario(
      input({
        income,
        overrides: [{ envelopeId: "va", included: false, monthlyCents: null }],
      }),
    );
    expect(off.incomplete).toBe(false);
  });

  it("adds income lines to income and keeps them out of expenses", () => {
    const result = composeScenario(
      input({
        income: INCOME,
        lines: [manual("side", 50000, { kind: "income" }), manual("food", 60000)],
      }),
    );
    expect(result.incomeCents).toBe(530286);
    expect(result.expenseCents).toBe(60000);
    expect(result.incomeLines.map((line) => line.id)).toEqual(["side"]);
    expect(result.expenseLines.map((line) => line.id)).toEqual(["food"]);
  });
});

describe("composeScenario — lines", () => {
  it("rolls a parent up to the sum of its sub-lines", () => {
    const result = composeScenario(
      input({
        lines: [
          manual("food", 0, { source: { type: "none" } }),
          manual("milk", 4000, { parentId: "food" }),
          manual("beef", 6000, { parentId: "food" }),
        ],
      }),
    );
    const [food] = result.expenseLines;
    expect(food.isRollup).toBe(true);
    expect(food.monthlyCents).toBe(10000);
    expect(food.children.map((child) => child.depth)).toEqual([1, 1]);
    expect(result.linesCents).toBe(10000);
  });

  it("keeps the total when the first sub-line is added to a $250 line", () => {
    const before = composeScenario(input({ lines: [manual("gas", 25000)] }));

    const plan = splitLine(before.expenseLines[0].source);
    const after = composeScenario(
      input({
        lines: [
          manual("gas", 0, { source: lineSourceOf(plan.parent) }),
          manual("fuel", 0, { parentId: "gas", source: lineSourceOf(plan.child) }),
        ],
      }),
    );
    expect(before.linesCents).toBe(25000);
    expect(after.linesCents).toBe(25000);
    expect(after.expenseLines[0].isRollup).toBe(true);
  });

  it("orders siblings by sort key and nests to any depth", () => {
    const result = composeScenario(
      input({
        lines: [
          manual("b", 1, { sortKey: "b" }),
          manual("a", 1, { sortKey: "a" }),
          manual("a2", 2, { parentId: "a", sortKey: "n" }),
          manual("a1", 3, { parentId: "a", sortKey: "g" }),
          manual("a1x", 4, { parentId: "a1" }),
        ],
      }),
    );
    expect(result.expenseLines.map((line) => line.id)).toEqual(["a", "b"]);
    expect(flattenLines(result.expenseLines).map((line) => line.id)).toEqual([
      "a",
      "a1",
      "a1x",
      "a2",
      "b",
    ]);
    expect(result.linesCents).toBe(4 + 2 + 1);
  });

  it("prices a line from live supply figures and picks up a later change", () => {
    const line = manual("pets", 0, {
      source: { type: "supplyGroup", supplyGroupId: "g" },
    });
    const at = (cents: number) =>
      composeScenario(
        input({
          lines: [line],
          supply: {
            itemMonthlyCents: new Map(),
            groupMonthlyCents: new Map([["g", cents]]),
          },
        }),
      ).linesCents;
    expect(at(9100)).toBe(9100);
    expect(at(12300)).toBe(12300);
  });

  it("shows plan minus actual for a linked line, and nothing without history", () => {
    const result = composeScenario(
      input({
        lines: [
          manual("food", 40000, { envelopeId: "groceries" }),
          manual("fun", 5000, { budgetGroupId: "play" }),
          manual("cats", 7000, { envelopeId: "cats" }),
          manual("loose", 100),
        ],
        actuals: {
          byEnvelope: new Map([
            ["groceries", 61000],
            ["cats", null],
          ]),
          byGroup: new Map([["play", 3000]]),
        },
      }),
    );
    const byId = new Map(result.expenseLines.map((line) => [line.id, line]));
    expect(byId.get("food")).toMatchObject({
      actualMonthlyCents: 61000,
      differenceCents: -21000,
    });
    expect(byId.get("fun")).toMatchObject({
      actualMonthlyCents: 3000,
      differenceCents: 2000,
    });
    expect(byId.get("cats")).toMatchObject({
      actualMonthlyCents: null,
      differenceCents: null,
    });
    expect(byId.get("loose")?.actualMonthlyCents).toBeNull();
  });

  it("does not count the link toward the amount", () => {
    const linked = composeScenario(
      input({
        lines: [manual("food", 40000, { envelopeId: "groceries" })],
        actuals: { byEnvelope: new Map([["groceries", 99999]]), byGroup: new Map() },
      }),
    );
    expect(linked.linesCents).toBe(40000);
  });

  it("carries bill actuals onto bill rows", () => {
    const result = composeScenario(
      input({
        bills: [bill({ envelopeId: "power", monthlyCents: 12000 })],
        billActuals: new Map([["power", 13400]]),
      }),
    );
    expect(result.billRows[0].actualMonthlyCents).toBe(13400);
  });
});

describe("composeScenario — periods", () => {
  it("derives the pay period and year from the monthly figures", () => {
    const result = composeScenario(
      input({
        income: [{ envelopeId: "pay", name: "Pay", expectedMonthlyCents: 260000 }],
        lines: [manual("rent", 100000)],
      }),
    );
    expect(result.periods.income.payPeriodCents).toBe(120000);
    expect(result.periods.remainder.yearlyCents).toBe(160000 * 12);
  });
});

describe("a source round trip through the row columns", () => {
  it("keeps what composeScenario reads", () => {
    const source = { type: "supplyItem", supplyItemId: "i" } as const;
    expect(lineSourceOf(sourceColumns(source))).toEqual(source);
  });
});
