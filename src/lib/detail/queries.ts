import { db } from "@/db";
import {
  goalDetails,
  nodeItems,
  nodes,
  projectDetails,
  resultAreaDetails,
  taskDetails,
} from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import type { NodeDetail } from "./types";

/**
 * Loads one record for its detail form: core fields, the side table for its type, and every
 * repeating list row it owns.
 *
 * Deliberately separate from `loadOutline`, which reads the whole tree on every page render.
 * These columns are only ever wanted for the one record a drawer is open on, so paying for
 * them per-open beats widening the query that runs for every row.
 *
 * Returns null when the record does not exist or belongs to someone else — the two are
 * indistinguishable on purpose.
 */
export async function loadNodeDetail(
  userId: string,
  nodeId: string,
): Promise<NodeDetail | null> {
  const [node] = await db
    .select({
      id: nodes.id,
      type: nodes.type,
      name: nodes.name,
      priorityLetter: nodes.priorityLetter,
      priorityRank: nodes.priorityRank,
      state: nodes.state,
      deadline: nodes.deadline,
      focus: nodes.focus,
      notes: nodes.notes,
    })
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .limit(1);

  if (!node) return null;

  // Only one of the four side tables can match, so they are fetched together rather than
  // branching on type and paying an extra round trip for the branch.
  const [resultArea, goal, project, task, items] = await Promise.all([
    node.type === "result_area"
      ? db
          .select()
          .from(resultAreaDetails)
          .where(eq(resultAreaDetails.nodeId, nodeId))
          .limit(1)
      : [],
    node.type === "goal"
      ? db.select().from(goalDetails).where(eq(goalDetails.nodeId, nodeId)).limit(1)
      : [],
    node.type === "project"
      ? db
          .select()
          .from(projectDetails)
          .where(eq(projectDetails.nodeId, nodeId))
          .limit(1)
      : [],
    node.type === "task"
      ? db.select().from(taskDetails).where(eq(taskDetails.nodeId, nodeId)).limit(1)
      : [],
    db
      .select()
      .from(nodeItems)
      .where(and(eq(nodeItems.userId, userId), eq(nodeItems.nodeId, nodeId)))
      .orderBy(asc(nodeItems.kind), asc(nodeItems.sortKey)),
  ]);

  return {
    ...node,
    priorityRank: node.priorityRank === null ? null : Number(node.priorityRank),
    resultArea: resultArea[0] ?? null,
    goal: goal[0] ?? null,
    project: project[0] ?? null,
    task: task[0] ?? null,
    items,
  };
}
