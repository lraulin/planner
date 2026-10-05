import type { GridRow } from "@/lib/tree/slice";
import type {
  ScenarioBillRow,
  ScenarioComposition,
  ScenarioIncomeRow,
  ScenarioLineNode,
} from "./compose";

/**
 * A scenario as the flat row list `DataGrid` renders: three sections, bills grouped under
 * their bill group, lines as a tree. Pure, so what the sections hold and what each header
 * adds up to are decided without mounting a grid.
 */
export type ScenarioGridNode =
  | { kind: "income"; row: ScenarioIncomeRow }
  | { kind: "bill"; row: ScenarioBillRow }
  | { kind: "line"; line: ScenarioLineNode };

export const SECTION_IDS = {
  income: "section:income",
  bills: "section:bills",
  lines: "section:lines",
} as const;

export const billGroupHeaderId = (label: string) => `bills:${label}`;

/** Row ids are namespaced because an envelope id can be both a bill row and a line's link. */
export const incomeRowId = (envelopeId: string) => `income:${envelopeId}`;
export const billRowId = (envelopeId: string) => `bill:${envelopeId}`;
export const lineRowId = (lineId: string) => `line:${lineId}`;

/** The id behind a grid row id, and what kind of row it was. */
export function parseRowId(
  id: string,
): { kind: "income" | "bill" | "line"; id: string } | null {
  const [kind, ...rest] = id.split(":");
  if (kind !== "income" && kind !== "bill" && kind !== "line") return null;
  const value = rest.join(":");
  return value === "" ? null : { kind, id: value };
}

function lineRows(
  nodes: readonly ScenarioLineNode[],
  out: GridRow<ScenarioGridNode>[],
  baseDepth: number,
): void {
  for (const line of nodes) {
    out.push({
      kind: "node",
      id: lineRowId(line.id),
      node: { kind: "line", line },
      depth: baseDepth + line.depth,
      branch: {
        hasChildren: line.children.length > 0,
        childCount: line.children.length,
      },
    });
    lineRows(line.children, out, baseDepth);
  }
}

/**
 * Income, Bills (by bill group) and Lines — and a header for each section even when empty,
 * so a scenario with no lines still shows where one would go.
 */
export function scenarioGridRows(
  composition: ScenarioComposition,
): GridRow<ScenarioGridNode>[] {
  const rows: GridRow<ScenarioGridNode>[] = [];

  const incomeCount = composition.incomeRows.length + composition.incomeLines.length;
  rows.push({
    kind: "group",
    id: SECTION_IDS.income,
    label: "Income",
    count: incomeCount,
    depth: 0,
    collapsed: false,
  });
  for (const row of composition.incomeRows) {
    rows.push({
      kind: "node",
      id: incomeRowId(row.envelopeId),
      node: { kind: "income", row },
      depth: 0,
    });
  }
  lineRows(composition.incomeLines, rows, 0);

  rows.push({
    kind: "group",
    id: SECTION_IDS.bills,
    label: "Bills",
    count: composition.billRows.length,
    depth: 0,
    collapsed: false,
  });
  const byGroup = new Map<string, ScenarioBillRow[]>();
  for (const bill of composition.billRows) {
    const list = byGroup.get(bill.groupLabel) ?? [];
    list.push(bill);
    byGroup.set(bill.groupLabel, list);
  }
  const labels = [...byGroup.keys()].sort((a, b) => {
    if (a === "Ungrouped") return 1;
    if (b === "Ungrouped") return -1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  });
  for (const label of labels) {
    const bills = byGroup.get(label) ?? [];
    rows.push({
      kind: "group",
      id: billGroupHeaderId(label),
      label,
      count: bills.length,
      depth: 1,
      collapsed: false,
    });
    for (const bill of bills) {
      rows.push({
        kind: "node",
        id: billRowId(bill.envelopeId),
        node: { kind: "bill", row: bill },
        depth: 1,
      });
    }
  }

  rows.push({
    kind: "group",
    id: SECTION_IDS.lines,
    label: "Lines",
    count: composition.expenseLines.length,
    depth: 0,
    collapsed: false,
  });
  lineRows(composition.expenseLines, rows, 0);

  return rows;
}

/**
 * What a row adds to its section's total, in cents per month.
 *
 * A sub-line is **not** counted: its roll-up parent already carries the sum, and adding both
 * would count every split twice. An excluded bill or income counts as nothing.
 */
export function countedMonthlyCents(node: ScenarioGridNode): number {
  switch (node.kind) {
    case "income":
      return node.row.included ? (node.row.monthlyCents ?? 0) : 0;
    case "bill":
      return node.row.included ? node.row.monthlyCents : 0;
    case "line":
      return node.line.parentId === null ? node.line.monthlyCents : 0;
  }
}

/** A header's subtotal over the rows the grid is showing under it. */
export function sectionMonthlyCents(nodes: readonly ScenarioGridNode[]): number {
  return nodes.reduce((sum, node) => sum + countedMonthlyCents(node), 0);
}
