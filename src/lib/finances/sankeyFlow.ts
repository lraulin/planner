/**
 * Period-total Sankey: income sources → Spent/Kept (or From savings) → categories.
 *
 * This is not a claim that a given paycheck bought the groceries. It is the period's
 * totals drawn so the widths balance. Transfers are dropped; Uncategorized is a real
 * sink, not omitted.
 */

import {
  effectiveCategory,
  effectiveMerchant,
  incomeCentsOf,
  spendByCategory,
  spendCentsOf,
  type AnalyticsRow,
} from "./analytics";

export type SankeyGrouping = "category" | "category-merchant";

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

export const SANKEY_SPENT = "middle:spent";
export const SANKEY_KEPT = "middle:kept";
export const SANKEY_FROM_SAVINGS = "middle:from-savings";

function sourceId(merchant: string): string {
  return `source:${merchant}`;
}

function sinkId(category: string): string {
  return `sink:${category}`;
}

function merchantSinkId(category: string, merchant: string): string {
  return `merchant:${category}:${merchant}`;
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

export function cashFlowSankey(
  rows: readonly AnalyticsRow[],
  grouping: SankeyGrouping = "category",
): SankeyModel {
  const sources = new Map<string, number>();
  let incomeCents = 0;
  for (const row of rows) {
    const income = incomeCentsOf(row);
    if (income <= 0) continue;
    const merchant = effectiveMerchant(row) || "Income";
    sources.set(merchant, (sources.get(merchant) ?? 0) + income);
    incomeCents += income;
  }

  let spendCents = 0;
  const spendByCatMerchant = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const cost = spendCentsOf(row);
    if (cost === 0) continue;
    spendCents += cost;
    const category = effectiveCategory(row);
    const merchant = effectiveMerchant(row) || category;
    const inner = spendByCatMerchant.get(category) ?? new Map<string, number>();
    inner.set(merchant, (inner.get(merchant) ?? 0) + cost);
    spendByCatMerchant.set(category, inner);
  }

  const netCents = incomeCents - spendCents;
  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];

  const sourceEntries = [...sources.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );
  for (const [merchant, cents] of sourceEntries) {
    nodes.push({
      id: sourceId(merchant),
      label: merchant,
      stage: "source",
      cents,
    });
  }

  const categories = spendByCategory(rows);

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
    sourceEntries.forEach(([merchant], index) => {
      if (toSpent[index] > 0) {
        links.push({
          source: sourceId(merchant),
          target: SANKEY_SPENT,
          cents: toSpent[index],
        });
      }
      if (toKept[index] > 0) {
        links.push({
          source: sourceId(merchant),
          target: SANKEY_KEPT,
          cents: toKept[index],
        });
      }
    });
  } else {
    const shortfall = -netCents;
    if (incomeCents > 0) {
      sourceEntries.forEach(([merchant, cents]) => {
        links.push({
          source: sourceId(merchant),
          target: SANKEY_SPENT,
          cents,
        });
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
    links.push({
      source: SANKEY_FROM_SAVINGS,
      target: SANKEY_SPENT,
      cents: shortfall,
    });
  }

  for (const category of categories) {
    if (category.cents === 0) continue;
    nodes.push({
      id: sinkId(category.category),
      label: category.category,
      stage: "sink",
      cents: category.cents,
    });
    if (spendCents > 0) {
      links.push({
        source: SANKEY_SPENT,
        target: sinkId(category.category),
        cents: category.cents,
      });
    }
    if (grouping === "category-merchant") {
      const inner = spendByCatMerchant.get(category.category);
      if (!inner) continue;
      const merchants = [...inner.entries()].sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
      );
      for (const [merchant, cents] of merchants) {
        if (cents === 0) continue;
        const id = merchantSinkId(category.category, merchant);
        nodes.push({
          id,
          label: merchant,
          stage: "sink",
          cents,
        });
        links.push({
          source: sinkId(category.category),
          target: id,
          cents,
        });
      }
    }
  }

  return { nodes, links, incomeCents, spendCents, netCents };
}

export function sankeyNodeDrill(
  nodeId: string,
): Extract<import("./insightsFilter").InsightsDrill, { kind: "sankey" }> | null {
  if (nodeId === SANKEY_SPENT) return { kind: "sankey", id: "spent", role: "spent" };
  if (nodeId === SANKEY_KEPT) return { kind: "sankey", id: "kept", role: "kept" };
  if (nodeId === SANKEY_FROM_SAVINGS) {
    return { kind: "sankey", id: "from-savings", role: "from-savings" };
  }
  if (nodeId.startsWith("source:")) {
    return { kind: "sankey", id: nodeId.slice("source:".length), role: "source" };
  }
  if (nodeId.startsWith("sink:")) {
    return { kind: "sankey", id: nodeId.slice("sink:".length), role: "category" };
  }
  if (nodeId.startsWith("merchant:")) {
    const rest = nodeId.slice("merchant:".length);
    const sep = rest.indexOf(":");
    const merchant = sep >= 0 ? rest.slice(sep + 1) : rest;
    return { kind: "sankey", id: merchant, role: "merchant" };
  }
  return null;
}
