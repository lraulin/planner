import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleContactSyncs, type GoogleContactSync } from "@/db/schema";

export async function getGoogleContactSync(
  userId: string,
): Promise<GoogleContactSync | null> {
  const [row] = await db
    .select()
    .from(googleContactSyncs)
    .where(eq(googleContactSyncs.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function googleContactSyncIsStale(
  userId: string,
  maxAgeMs: number,
): Promise<boolean> {
  const state = await getGoogleContactSync(userId);
  return Boolean(
    state && state.lastSyncedAt.getTime() < Date.now() - Math.max(0, maxAgeMs),
  );
}
