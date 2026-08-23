/**
 * What a reclassify would do to `derived_flow`, before it does it.
 *
 * A change to any detector in `reclassify.ts` rewrites flows across the whole history on the
 * next pass, and flow is load-bearing: `spend`, `refund` and `interest_fee` are counted as
 * cost, `external_transfer` and `transfer` are movement. Moving one row between those two
 * groups moves reported spending, the pay-period result, the Sankey and the dashboard.
 *
 * So a detector change is audited the way the payee cutover was audited
 * (`agent-os/specs/2026-08-23-1041-payee-matcher-cutover/`): plan first, report the difference
 * as **counts and signed cents grouped by transition**, and let a human decide before anything
 * is written. Transaction ids are deliberately absent — the question a reviewer is answering is
 * "how much money moved, and between which two meanings", not "which rows".
 *
 * The stored flow is the previous implementation's output, so diffing a fresh plan against it
 * needs no second copy of the old code kept alive to compare against.
 */

import type { FinanceFlowKind } from "@/db/schema";

export type StoredFlowRow = {
  id: string;
  /** Signed cents, positive is money in — the same convention as `finance_transactions`. */
  amountCents: number;
  derivedFlow: FinanceFlowKind | null;
  derivedCategory?: string | null;
};

export type PlannedFlowRow = {
  id: string;
  derivedFlow: FinanceFlowKind;
  derivedCategory?: string | null;
};

/** One (was, now) pair, with how many rows moved and how much signed money went with them. */
export type FlowTransition = {
  from: string | null;
  to: string | null;
  rows: number;
  cents: number;
};

export type FlowDiff = {
  scanned: number;
  changed: number;
  transitions: FlowTransition[];
};

function keyOf(from: string | null, to: string | null): string {
  return `${from ?? "(none)"} ${to ?? "(none)"}`;
}

/**
 * Group every row whose value under `read` moved, into (was, now) pairs.
 *
 * Generic over the field because flow and category need exactly the same report and would
 * otherwise be two copies that could drift in their edge cases — which row counts as new,
 * whether null is a value, how ties order.
 */
function summarize<T extends { id: string }>(
  stored: readonly (T & { amountCents: number })[],
  planned: readonly { id: string }[],
  read: (row: object) => string | null,
): FlowDiff {
  const byId = new Map(stored.map((row) => [row.id, row]));
  const groups = new Map<string, FlowTransition>();
  let changed = 0;

  for (const plan of planned) {
    const before = byId.get(plan.id);
    if (!before) continue;
    const was = read(before);
    const now = read(plan);
    if (was === now) continue;

    changed += 1;
    const key = keyOf(was, now);
    const group = groups.get(key);
    if (group) {
      group.rows += 1;
      group.cents += before.amountCents;
      continue;
    }
    groups.set(key, { from: was, to: now, rows: 1, cents: before.amountCents });
  }

  // Biggest movement first, because that is the one a reviewer has to be able to explain. Ties
  // break on the transition name so two runs over the same data print the same report.
  const transitions = [...groups.values()].sort(
    (a, b) =>
      Math.abs(b.cents) - Math.abs(a.cents) ||
      b.rows - a.rows ||
      keyOf(a.from, a.to).localeCompare(keyOf(b.from, b.to)),
  );

  return { scanned: byId.size, changed, transitions };
}

/**
 * Group the rows whose planned flow differs from the stored one.
 *
 * A row present in the plan but absent from `stored` is not a change — it has never been
 * classified, so there is no previous meaning for it to have moved away from. Counting those
 * would bury a real regression under the backlog of a fresh import.
 */
export function summarizeFlowChanges(
  stored: readonly StoredFlowRow[],
  planned: readonly PlannedFlowRow[],
): FlowDiff {
  return summarize(
    stored,
    planned,
    (row) => (row as PlannedFlowRow).derivedFlow ?? null,
  );
}

/**
 * The same report for `derived_category`.
 *
 * Both fields have to be audited together, because a rule change can move one without the
 * other: a rule that only names a category leaves flow alone, and a flow-only rule pushes its
 * row out of the categorised set entirely through `carriesCategory`. Reporting just one would
 * let the other half of a regression through.
 */
export function summarizeCategoryChanges(
  stored: readonly StoredFlowRow[],
  planned: readonly PlannedFlowRow[],
): FlowDiff {
  return summarize(
    stored,
    planned,
    (row) => (row as PlannedFlowRow).derivedCategory ?? null,
  );
}

/** One line per transition, for a CLI. */
export function formatFlowDiff(diff: FlowDiff, label = "flow"): string {
  const head = `${diff.changed} of ${diff.scanned} classified rows change ${label}`;
  if (diff.transitions.length === 0) return `${head}.`;

  const lines = diff.transitions.map((transition) => {
    const money = (transition.cents / 100).toFixed(2);
    const rows = transition.rows === 1 ? "1 row" : `${transition.rows} rows`;
    return `  ${transition.from ?? "(none)"} to ${transition.to}: ${rows}, $${money}`;
  });
  return [`${head}:`, ...lines].join("\n");
}
