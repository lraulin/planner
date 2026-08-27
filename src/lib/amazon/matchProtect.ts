import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { amazonChargeMatches } from "@/db/schema";

/**
 * A later manual split edit must not be rewritten by a repeated Amazon capture.
 */
export async function markAmazonMatchSplitProtected(
  userId: string,
  transactionId: string,
): Promise<void> {
  await db
    .update(amazonChargeMatches)
    .set({ splitProtected: true, updatedAt: new Date() })
    .where(
      and(
        eq(amazonChargeMatches.userId, userId),
        eq(amazonChargeMatches.transactionId, transactionId),
      ),
    );
}
