import { describe, expect, it } from "vitest";
import type { SupplyAmounts } from "./amount";
import { composeScenario, type ScenarioLineInput } from "./compose";
import {
  billGroupHeaderId,
  parseRowId,
  scenarioGridRows,
  sectionMonthlyCents,
  type ScenarioGridNode,
} from "./gridRows";

const NO_SUPPLY: SupplyAmounts = {
  itemMonthlyCents: new Map(),
  groupMonthlyCents: new Map(),
};

function line(
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

function build(over: Partial<Parameters<typeof composeScenario>[0]> = {}) {
  return composeScenario({
    bills: [],
    income: [],
    overrides: [],
    lines: [],
    supply: NO_SUPPLY,
    actuals: { byEnvelope: new Map(), byGroup: new Map() },
    billActuals: new Map(),
    ...over,
  });
}

function nodesOf(rows: ReturnType<typeof scenarioGridRows>): ScenarioGridNode[] {
  return rows.flatMap((row) => (row.kind === "node" ? [row.node] : []));
}

describe("scenarioGridRows", () => {
  it("lays out Income, Bills by group, then Lines, with a header even when a section is empty", () => {
    const rows = scenarioGridRows(build());
    expect(rows.map((row) => row.id)).toEqual([
      "section:income",
      "section:bills",
      "section:lines",
    ]);
  });

  it("groups bills under their bill group, Ungrouped last", () => {
    const rows = scenarioGridRows(
      build({
        bills: [
          {
            envelopeId: "a",
            name: "A",
            groupLabel: "Ungrouped",
            status: "active",
            monthlyCents: 1,
          },
          {
            envelopeId: "b",
            name: "B",
            groupLabel: "Housing",
            status: "active",
            monthlyCents: 2,
          },
          {
            envelopeId: "c",
            name: "C",
            groupLabel: "Housing",
            status: "active",
            monthlyCents: 3,
          },
        ],
      }),
    );
    expect(rows.map((row) => row.id)).toEqual([
      "section:income",
      "section:bills",
      billGroupHeaderId("Housing"),
      "bill:b",
      "bill:c",
      billGroupHeaderId("Ungrouped"),
      "bill:a",
      "section:lines",
    ]);
    const housing = rows.find((row) => row.id === billGroupHeaderId("Housing"));
    expect(housing).toMatchObject({ kind: "group", count: 2, depth: 1 });
  });

  it("indents sub-lines and flags the roll-up as a branch", () => {
    const rows = scenarioGridRows(
      build({
        lines: [
          line("food", 0, { source: { type: "none" } }),
          line("milk", 4000, { parentId: "food", sortKey: "a" }),
          line("beef", 6000, { parentId: "food", sortKey: "b" }),
        ],
      }),
    );
    const lines = rows.filter((row) => row.kind === "node");
    expect(lines.map((row) => [row.id, row.depth])).toEqual([
      ["line:food", 0],
      ["line:milk", 1],
      ["line:beef", 1],
    ]);
    expect(lines[0]).toMatchObject({ branch: { hasChildren: true, childCount: 2 } });
  });

  it("puts income lines in the Income section", () => {
    const rows = scenarioGridRows(
      build({ lines: [line("side", 5000, { kind: "income" })] }),
    );
    const ids = rows.map((row) => row.id);
    expect(ids.indexOf("line:side")).toBeGreaterThan(ids.indexOf("section:income"));
    expect(ids.indexOf("line:side")).toBeLessThan(ids.indexOf("section:bills"));
  });
});

describe("sectionMonthlyCents", () => {
  it("counts a roll-up once, not its sub-lines as well", () => {
    const composition = build({
      lines: [
        line("food", 0, { source: { type: "none" } }),
        line("milk", 4000, { parentId: "food" }),
        line("beef", 6000, { parentId: "food" }),
      ],
    });
    expect(sectionMonthlyCents(nodesOf(scenarioGridRows(composition)))).toBe(10000);
  });

  it("counts only what is switched on", () => {
    const composition = build({
      bills: [
        {
          envelopeId: "rent",
          name: "Rent",
          groupLabel: "Housing",
          status: "active",
          monthlyCents: 210000,
        },
        {
          envelopeId: "gym",
          name: "Gym",
          groupLabel: "Housing",
          status: "paused",
          monthlyCents: 3000,
        },
      ],
      overrides: [{ envelopeId: "rent", included: false, monthlyCents: null }],
    });
    expect(sectionMonthlyCents(nodesOf(scenarioGridRows(composition)))).toBe(0);
  });

  it("reads an income with no figure as nothing", () => {
    const composition = build({
      income: [{ envelopeId: "va", name: "VA", expectedMonthlyCents: null }],
    });
    expect(sectionMonthlyCents(nodesOf(scenarioGridRows(composition)))).toBe(0);
  });
});

describe("parseRowId", () => {
  it("round-trips a row id and rejects a header", () => {
    expect(parseRowId("line:abc")).toEqual({ kind: "line", id: "abc" });
    expect(parseRowId("bill:abc")).toEqual({ kind: "bill", id: "abc" });
    expect(parseRowId("section:lines")).toBeNull();
    expect(parseRowId("line:")).toBeNull();
  });
});
