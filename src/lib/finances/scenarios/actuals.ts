import { monthBuckets } from "../analytics";
import { monthKeyOf } from "../budget/envelope";
import { descendantEnvelopeIds } from "../budget/hierarchy";
import type { BudgetCategoryRow } from "../budget/queries";
import { reportRange, spendingContributions, type EnvelopeReportRow } from "../reports";

/**
 * What the transaction history says each envelope costs a month, for the "Last 12 mo"
 * column beside a scenario's planned figure.
 *
 * Not a second definition of cost of living: the rows are `loadInsightsRows`, the filter is
 * Insights' `spendingContributions`, and the window is Insights' own `reportRange("12m")` cut
 * to **completed** months — so a scenario and the Insights page cannot quote different
 * averages for the same envelope. `reports.test.ts` pins the Insights side and `actuals.test.ts`
 * pins that this one agrees with it.
 *
 * Averaged over the completed months the history actually covers (fewer than twelve for a
 * short history), and `null` where there are none — an unknown, not a zero.
 */
export type SpendingActuals = {
  /** Completed months the averages span. Zero means no history, and every average is null. */
  months: number;
  /**
   * Total spend per envelope id across those months. Totals, not averages, so an average
   * over several envelopes rounds once — the way Insights rounds one series — rather than
   * once per envelope.
   */
  totalByEnvelope: ReadonlyMap<string, number>;
};

export function spendingActuals(
  rows: readonly EnvelopeReportRow[],
  todayKey: string,
): SpendingActuals {
  const range = reportRange("12m", todayKey, rows[0]?.transactionDate ?? null);
  const current = monthKeyOf(todayKey).slice(0, 7);
  const completed = monthBuckets(range).filter((bucket) => bucket.key < current);
  const first = completed[0];
  const last = completed[completed.length - 1];
  if (!first || !last) return { months: 0, totalByEnvelope: new Map() };

  const totals = new Map<string, number>();
  for (const row of spendingContributions(rows, "all")) {
    if (row.budgetCategoryId === null) continue;
    if (row.transactionDate < first.startKey || row.transactionDate > last.endKey)
      continue;
    totals.set(
      row.budgetCategoryId,
      (totals.get(row.budgetCategoryId) ?? 0) - row.amountCents,
    );
  }
  return { months: completed.length, totalByEnvelope: totals };
}

/** Average monthly spend over a set of envelopes; null when there is no history at all. */
export function averageOver(
  actuals: SpendingActuals,
  envelopeIds: Iterable<string>,
): number | null {
  if (actuals.months === 0) return null;
  let total = 0;
  for (const id of envelopeIds) total += actuals.totalByEnvelope.get(id) ?? 0;
  return Math.round(total / actuals.months);
}

/** Average monthly spend of one budget group and everything nested beneath it. */
export function groupAverage(
  actuals: SpendingActuals,
  groups: Parameters<typeof descendantEnvelopeIds>[0],
  categories: readonly Pick<BudgetCategoryRow, "id" | "groupId">[],
  groupId: string,
): number | null {
  return averageOver(actuals, descendantEnvelopeIds(groups, categories, groupId));
}
