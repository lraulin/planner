import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { amazonOrderItems } from "@/db/schema";

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
