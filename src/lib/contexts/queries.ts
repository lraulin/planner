import { db } from "@/db";
import { masterContexts } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export type MasterContextOption = { id: string; name: string };

export async function listMasterContexts(
  userId: string,
): Promise<MasterContextOption[]> {
  return db
    .select({ id: masterContexts.id, name: masterContexts.name })
    .from(masterContexts)
    .where(eq(masterContexts.userId, userId))
    .orderBy(asc(masterContexts.normalizedName), asc(masterContexts.name));
}
