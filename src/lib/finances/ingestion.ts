import { reclassifyTransactions, type ReclassifySummary } from "./mutations";
import { findMatches, type FindMatchesResult } from "./schedules/mutations";
import { listScheduleRecords } from "./schedules/queries";

/**
 * Finish every transaction-ingestion path in the same order: stable payees first, then
 * schedule matching. A linked schedule can therefore route an otherwise unassigned row to
 * its envelope as part of the same ingestion flow.
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
    return { reclassified: null, matched: { linked: 0 } };
  }
  const reclassified = await reclassifyTransactions(userId);
  const matched = await findMatches(userId);
  return { reclassified, matched };
}
