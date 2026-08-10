import { db } from "@/db";
import { masterContexts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { normaliseContextName } from "./catalog";

export async function addMasterContext(userId: string, value: string): Promise<string> {
  const { name, normalizedName } = normaliseContextName(value);
  const [created] = await db
    .insert(masterContexts)
    .values({ userId, name, normalizedName })
    .onConflictDoNothing()
    .returning({ id: masterContexts.id });
  if (created) return created.id;

  const [existing] = await db
    .select({ id: masterContexts.id })
    .from(masterContexts)
    .where(
      and(
        eq(masterContexts.userId, userId),
        eq(masterContexts.normalizedName, normalizedName),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Context could not be added.");
  return existing.id;
}

export async function deleteMasterContext(
  userId: string,
  contextId: string,
): Promise<void> {
  await db
    .delete(masterContexts)
    .where(and(eq(masterContexts.id, contextId), eq(masterContexts.userId, userId)));
}
