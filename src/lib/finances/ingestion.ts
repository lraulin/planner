import { reclassifyTransactions, type ReclassifySummary } from "./mutations";
import { autoMapConfiguredBudgetCategories } from "./budget/mutations";
import { findMatches, type FindMatchesResult } from "./schedules/mutations";
import { listScheduleRecords } from "./schedules/queries";

/**
 * Finish every transaction-ingestion path in the same order: stable payees first, schedule
 * matching second, then the taxonomy-to-envelope map for anything still unassigned. A linked
 * schedule therefore wins over the broad category claim, and a hand assignment wins over both.
 */
export async function finalizeTransactionIngestion(
  userId: string,
  options: { forceReclassify?: boolean } = {},
): Promise<{
  reclassified: ReclassifySummary | null;
  matched: FindMatchesResult;
}> {
  // CSV and pasted-pending imports historically leave classification to the explicit
  // Reclassify workflow. They only need the automatic pass once a schedule exists to match.
  // Live bank sync opts in unconditionally because it already promised automatic
  // classification before this shared finish step existed.
  if (!options.forceReclassify && (await listScheduleRecords(userId)).length === 0) {
    await autoMapConfiguredBudgetCategories(userId);
    return { reclassified: null, matched: { linked: 0 } };
  }
  const reclassified = await reclassifyTransactions(userId);
  const matched = await findMatches(userId);
  await autoMapConfiguredBudgetCategories(userId);
  return { reclassified, matched };
}
