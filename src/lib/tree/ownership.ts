import type { DbExecutor } from "@/db/executor";
import { nodes } from "@/db/schema";
import { ownedRow } from "@/lib/db/owned";

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
  tx: DbExecutor,
  userId: string,
  nodeId: string | null | undefined,
  what = "Record",
): Promise<void> {
  if (nodeId === undefined || nodeId === null) return;
  const [node] = await tx
    .select({ id: nodes.id })
    .from(nodes)
    .where(ownedRow(nodes, nodeId, userId))
    .limit(1);
  if (!node) throw new Error(`${what} not found.`);
}
