import {
  applyRuleActionsToTransactions,
  reclassifyTransactions,
  type ReclassifySummary,
} from "./mutations";
import { findMatches, type FindMatchesResult } from "./schedules/mutations";
import { listScheduleRecords } from "./schedules/queries";
import { db } from "@/db";
import { sql } from "drizzle-orm";

/** Database-clock watermark taken before an ingestion begins. */
export async function transactionIngestionWatermark(): Promise<Date> {
  const result = await db.execute(sql`select clock_timestamp() as at`);
  const row = (result as unknown as Array<{ at: Date | string }>)[0];
  if (!row) throw new Error("Could not read the transaction ingestion watermark");
  return row.at instanceof Date ? row.at : new Date(row.at);
}

/**
 * Finish every transaction-ingestion path in the same order: stable payees first, schedule
 * matching second, then the taxonomy-to-envelope map for anything still unassigned. A linked
 * schedule therefore wins over the broad category claim, and a hand assignment wins over both.
 */
export async function finalizeTransactionIngestion(
  userId: string,
  options: { forceReclassify?: boolean; applyRulesSince?: Date } = {},
): Promise<{
  reclassified: ReclassifySummary | null;
  matched: FindMatchesResult;
}> {
  // CSV and pasted-pending imports historically leave classification to the explicit
  // Reclassify workflow. They only need the automatic pass once a schedule exists to match.
  // Live bank sync opts in unconditionally because it already promised automatic
  // classification before this shared finish step existed.
  if (!options.forceReclassify && (await listScheduleRecords(userId)).length === 0) {
    if (options.applyRulesSince) {
      await applyRuleActionsToTransactions(userId, {
        createdSince: options.applyRulesSince,
      });
    }
    return { reclassified: null, matched: { linked: 0 } };
  }
  const reclassified = await reclassifyTransactions(userId);
  const matched = await findMatches(userId);
  if (options.applyRulesSince) {
    await applyRuleActionsToTransactions(userId, {
      createdSince: options.applyRulesSince,
    });
  }
  return { reclassified, matched };
}
