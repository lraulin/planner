/**
 * Period-total Sankey: income sources → Spent/Kept (or From savings) → where it went.
 *
 * This is not a claim that a given paycheck bought the groceries. It is the period's
 * totals drawn so the widths balance. Transfers are dropped; Uncategorized is a real
 * sink, not omitted.
 */

import type { EnvelopeKind } from "@/db/schema";
import {
  effectiveCategory,
  effectiveFlow,
  incomeCentsOf,
  spendCentsOf,
  type AnalyticsRow,
} from "./analytics";
import { UNCATEGORIZED } from "./classify/categories";
import type { BudgetGroupRow } from "./budget/queries";

export type SankeyNode = {
  id: string;
  label: string;
  stage: "source" | "middle" | "sink";
  cents: number;
};

export type SankeyLink = {
  source: string;
  target: string;
  cents: number;
};

export type SankeyModel = {
  nodes: SankeyNode[];
  links: SankeyLink[];
  incomeCents: number;
  spendCents: number;
  netCents: number;
};

/** Which node a row's income lands in, and which node its spend leaves through. */
export type SankeyLabels<R extends AnalyticsRow> = {
  source: (row: R) => string;
  sink: (row: R) => string;
};

export const SANKEY_SPENT = "middle:spent";
export const SANKEY_KEPT = "middle:kept";
export const SANKEY_FROM_SAVINGS = "middle:from-savings";

function sourceId(label: string): string {
  return `source:${label}`;
}

function sinkId(label: string): string {
  return `sink:${label}`;
}

/** Split `total` across `weights` in whole cents. The last positive weight takes the remainder. */
function allocate(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((acc, value) => acc + value, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  const shares = weights.map((weight) =>
    weight <= 0 ? 0 : Math.round((total * weight) / sum),
  );
  let last = -1;
  shares.forEach((share, index) => {
    if (share > 0 || weights[index] > 0) last = index;
  });
  if (last < 0) return shares;
  const allocated = shares.reduce((acc, share) => acc + share, 0);
  shares[last] += total - allocated;
  return shares;
}

function byCentsDescending(left: [string, number], right: [string, number]): number {
  return right[1] - left[1] || left[0].localeCompare(right[0]);
}

export function cashFlowSankey<R extends AnalyticsRow>(
  rows: readonly R[],
  labels: SankeyLabels<R>,
): SankeyModel {
  const sources = new Map<string, number>();
  const sinks = new Map<string, number>();
  let incomeCents = 0;
  let spendCents = 0;
  for (const row of rows) {
    const income = incomeCentsOf(row);
    if (income > 0) {
      const label = labels.source(row);
      sources.set(label, (sources.get(label) ?? 0) + income);
      incomeCents += income;
    }
    const cost = spendCentsOf(row);
    if (cost !== 0) {
      const label = labels.sink(row);
      sinks.set(label, (sinks.get(label) ?? 0) + cost);
      spendCents += cost;
    }
  }

  const netCents = incomeCents - spendCents;
  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];

  const sourceEntries = [...sources.entries()].sort(byCentsDescending);
  for (const [label, cents] of sourceEntries) {
    nodes.push({ id: sourceId(label), label, stage: "source", cents });
  }

  if (netCents >= 0) {
    if (spendCents > 0) {
      nodes.push({
        id: SANKEY_SPENT,
        label: "Spent",
        stage: "middle",
        cents: spendCents,
      });
    }
    if (netCents > 0) {
      nodes.push({
        id: SANKEY_KEPT,
        label: "Kept",
        stage: "middle",
        cents: netCents,
      });
    }
    const sourceWeights = sourceEntries.map((entry) => entry[1]);
    const toSpent = allocate(spendCents, sourceWeights);
    const toKept = allocate(netCents, sourceWeights);
    sourceEntries.forEach(([label], index) => {
      if (toSpent[index] > 0) {
        links.push({
          source: sourceId(label),
          target: SANKEY_SPENT,
          cents: toSpent[index],
        });
      }
      if (toKept[index] > 0) {
        links.push({
          source: sourceId(label),
          target: SANKEY_KEPT,
          cents: toKept[index],
        });
      }
    });
  } else {
    const shortfall = -netCents;
    if (incomeCents > 0) {
      sourceEntries.forEach(([label, cents]) => {
        links.push({ source: sourceId(label), target: SANKEY_SPENT, cents });
      });
    }
    nodes.push({
      id: SANKEY_FROM_SAVINGS,
      label: "From savings",
      stage: "source",
      cents: shortfall,
    });
    nodes.push({
      id: SANKEY_SPENT,
      label: "Spent",
      stage: "middle",
      cents: spendCents,
    });
    links.push({ source: SANKEY_FROM_SAVINGS, target: SANKEY_SPENT, cents: shortfall });
  }

  for (const [label, cents] of [...sinks.entries()].sort(byCentsDescending)) {
    if (cents === 0) continue;
    nodes.push({ id: sinkId(label), label, stage: "sink", cents });
    if (spendCents > 0) {
      links.push({ source: SANKEY_SPENT, target: sinkId(label), cents });
    }
  }

  return { nodes, links, incomeCents, spendCents, netCents };
}

/** What {@link budgetGroupSankey} reads off a row beyond the analytics fields. */
export type BudgetGroupSankeyRow = AnalyticsRow & {
  budgetCategoryId: string | null;
  groupId: string | null;
  envelopeKind: EnvelopeKind | null;
};

/**
 * The Sankey drawn by budget group, which is the level a whole year reads at.
 *
 * One node per payee and per envelope put 18 sources and 50 sinks on one picture, every
 * label stacked on its neighbour. A row lands under its envelope's **top-level** group. An
 * envelope with no group stands as its own node: groups are optional folders inside a
 * section, so an ungrouped envelope — Payroll, VA, a savings goal — is already top level.
 *
 * Money crossing the boundary (a crypto sale, a tax refund, a sweep out) is counted as
 * income or spend here, because a diagram of where the money came from that left it out
 * would not balance against the accounts. Uncategorized, it gets its own node rather than
 * hiding in Uncategorized.
 */
export function budgetGroupSankey(
  rows: readonly BudgetGroupSankeyRow[],
  groups: readonly Pick<BudgetGroupRow, "id" | "name" | "parentGroupId">[],
): SankeyModel {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const topLevelName = (groupId: string): string | null => {
    const seen = new Set<string>();
    let current = byId.get(groupId);
    while (current?.parentGroupId) {
      if (seen.has(current.id)) throw new Error("Budget groups contain a cycle.");
      seen.add(current.id);
      current = byId.get(current.parentGroupId);
    }
    return current?.name ?? null;
  };
  // Labelled before the flow is rewritten: afterwards a crypto sale looks like a paycheck.
  const labelled = rows.map((row) => {
    const transfer = effectiveFlow(row) === "external_transfer";
    const grouped = row.groupId ? topLevelName(row.groupId) : null;
    const label =
      grouped ??
      (row.budgetCategoryId
        ? effectiveCategory(row)
        : transfer
          ? row.amountCents > 0
            ? "Transfers in"
            : "Transfers out"
          : UNCATEGORIZED);
    return {
      ...row,
      flowOverride: transfer
        ? row.amountCents > 0
          ? ("income" as const)
          : ("spend" as const)
        : row.flowOverride,
      label,
    };
  });

  return cashFlowSankey(labelled, {
    source: (row) => row.label,
    sink: (row) => row.label,
  });
}
