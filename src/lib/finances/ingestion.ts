import { reclassifyTransactions, type ReclassifySummary } from "./mutations";
import { applyPayeeAutoCategories } from "./payees/claims";
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
 * Finish every transaction-ingestion path in the same order: stable payees first, then
 * flow/identity reclassify, then claim-or-default on **new uncategorised** eligible rows.
 * A hand assignment and a previously categorised row both win over automation.
 *
 * **`forceReclassify` runs the full pass**, walking every transaction rather than only the
 * ones since a watermark — bank sync opts in unconditionally, since it already promises
 * automatic classification. CSV and pasted-pending imports pass `applyAutoCategorySince`,
 * which still reclassifies the whole ledger (auto-category keys on `payee_id`) and then
 * fills only new uncategorised eligible rows.
 */
export async function finalizeTransactionIngestion(
  userId: string,
  options: {
    forceReclassify?: boolean;
    applyAutoCategorySince?: Date;
    auditBatchId?: string;
    auditOrigin?: string;
  } = {},
): Promise<{ reclassified: ReclassifySummary | null }> {
  let reclassified: ReclassifySummary | null = null;
  if (options.forceReclassify || options.applyAutoCategorySince) {
    reclassified = await reclassifyTransactions(userId, {
      auditBatchId: options.auditBatchId,
      auditOrigin: options.auditOrigin,
    });
  }
  if (options.applyAutoCategorySince) {
    await applyPayeeAutoCategories(userId, {
      createdSince: options.applyAutoCategorySince,
      auditBatchId: options.auditBatchId,
      auditOrigin: options.auditOrigin,
    });
  }
  return { reclassified };
}
