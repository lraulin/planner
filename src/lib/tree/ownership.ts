import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { nodes } from "@/db/schema";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Refuse a link to an outline node that is missing or belongs to someone else.
 *
 * The node-side twin of `assertContactOwned`, for every row that points at a task, project or
 * Result Area by id — a note, an appointment's project, a Time Chart area's Result Area, a day
 * line. `security.md` asks every mutation to prove ownership before writing; without this a
 * guessed id stores a pointer into another user's outline, and their deleting that node would
 * `set null` on this user's row. `undefined` (leave it) and `null` (clear it) pass.
 */
export async function assertNodeOwned(
  tx: Executor,
  userId: string,
  nodeId: string | null | undefined,
  what = "Record",
): Promise<void> {
  if (nodeId === undefined || nodeId === null) return;
  const [node] = await tx
    .select({ id: nodes.id })
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .limit(1);
  if (!node) throw new Error(`${what} not found.`);
}
