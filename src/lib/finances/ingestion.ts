import {
  applyRuleActionsToTransactions,
  reclassifyTransactions,
  type ReclassifySummary,
} from "./mutations";
import { applyPayeeClaims } from "./payees/claims";
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
 * Finish every transaction-ingestion path in the same order: stable payees first, then rules,
 * then the taxonomy-to-envelope map for anything still unassigned. A payee's bill claim
 * therefore wins over the broad category claim, and a hand assignment wins over both.
 *
 * **`forceReclassify` runs the full pass**, walking every transaction rather than only the
 * ones since a watermark — bank sync opts in unconditionally, since it already promises
 * automatic classification. CSV and pasted-pending imports run the incremental rules pass
 * instead, which is cheap enough to run on every import without a gate.
 */
export async function finalizeTransactionIngestion(
  userId: string,
  options: { forceReclassify?: boolean; applyRulesSince?: Date } = {},
): Promise<{ reclassified: ReclassifySummary | null }> {
  let reclassified: ReclassifySummary | null = null;
  if (options.forceReclassify) {
    reclassified = await reclassifyTransactions(userId);
  }
  if (options.applyRulesSince) {
    await applyRuleActionsToTransactions(userId, {
      createdSince: options.applyRulesSince,
    });
  }
  // Claims beat a broad merchant rule. Track as bill already filed its payee; this
  // catches charges that arrived after the claim (import / sync).
  await applyPayeeClaims(userId);
  return { reclassified };
}
