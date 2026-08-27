import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  amazonChargeMatches,
  amazonCharges,
  amazonOrderItems,
  amazonSubscriptions,
} from "@/db/schema";

/**
 * Delete one line item the user owns. Used by isolation tests; the Orders page does
 * not expose delete in this spec.
 */
export async function deleteAmazonItem(userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(amazonOrderItems)
    .where(and(eq(amazonOrderItems.id, id), eq(amazonOrderItems.userId, userId)))
    .returning({ id: amazonOrderItems.id });
  return deleted.length > 0;
}

export async function deleteAmazonSubscription(
  userId: string,
  id: string,
): Promise<boolean> {
  const deleted = await db
    .delete(amazonSubscriptions)
    .where(and(eq(amazonSubscriptions.id, id), eq(amazonSubscriptions.userId, userId)))
    .returning({ id: amazonSubscriptions.id });
  return deleted.length > 0;
}

export async function deleteAmazonCharge(userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(amazonCharges)
    .where(and(eq(amazonCharges.id, id), eq(amazonCharges.userId, userId)))
    .returning({ id: amazonCharges.id });
  return deleted.length > 0;
}

export async function updateAmazonSubscriptionReview(
  userId: string,
  id: string,
  patch: { needsReview: boolean; reviewReason: string },
): Promise<boolean> {
  const updated = await db
    .update(amazonSubscriptions)
    .set({
      needsReview: patch.needsReview,
      reviewReason: patch.reviewReason,
      updatedAt: new Date(),
    })
    .where(and(eq(amazonSubscriptions.id, id), eq(amazonSubscriptions.userId, userId)))
    .returning({ id: amazonSubscriptions.id });
  return updated.length > 0;
}

export async function updateAmazonChargeReview(
  userId: string,
  id: string,
  patch: { needsReview: boolean; reviewReason: string },
): Promise<boolean> {
  const updated = await db
    .update(amazonCharges)
    .set({
      needsReview: patch.needsReview,
      reviewReason: patch.reviewReason,
      updatedAt: new Date(),
    })
    .where(and(eq(amazonCharges.id, id), eq(amazonCharges.userId, userId)))
    .returning({ id: amazonCharges.id });
  return updated.length > 0;
}

export async function deleteAmazonChargeMatch(
  userId: string,
  chargeId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(amazonChargeMatches)
    .where(
      and(
        eq(amazonChargeMatches.chargeId, chargeId),
        eq(amazonChargeMatches.userId, userId),
      ),
    )
    .returning({ id: amazonChargeMatches.id });
  return deleted.length > 0;
}
