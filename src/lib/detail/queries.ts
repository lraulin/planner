import { db } from "@/db";
import {
  goalDetails,
  nodeItems,
  nodes,
  notes,
  projectDetails,
  resultAreaDetails,
  taskDetails,
} from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { plannedDayForNode } from "@/lib/day/queries";
import { noteSnippet } from "@/lib/notes/snippet";
import { owningResultAreaIdFromChain } from "@/lib/tree/owningResultArea";
import { loadNodeChain } from "@/lib/tree/path";
import type { LinkedNoteSummary, NodeDetail, ResultAreaOption } from "./types";

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
      targetStartDate: nodes.targetStartDate,
      targetEndDate: nodes.targetEndDate,
      deferredDate: nodes.deferredDate,
      focus: nodes.focus,
      notes: nodes.notes,
    })
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .limit(1);

  if (!node) return null;

  // Only one of the four side tables can match, so they are fetched together rather than
  // branching on type and paying an extra round trip for the branch.
  const [
    resultArea,
    goal,
    project,
    task,
    items,
    linkedNoteRows,
    plannedDay,
    chain,
    resultAreas,
  ] = await Promise.all([
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
    // Scoped by userId so a guessed node id cannot leak another user's notes.
    db
      .select({
        id: notes.id,
        title: notes.title,
        noteDate: notes.noteDate,
        body: notes.body,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.nodeId, nodeId)))
      .orderBy(desc(notes.updatedAt)),
    // Whatever the Task Chooser treats as choosable work can be planned onto a day —
    // manual §8: "leaf tasks (and task-less projects)". Result areas and goals are places
    // work lives, not work, so they skip the query entirely.
    node.type === "task" || node.type === "project"
      ? plannedDayForNode(userId, nodeId)
      : null,
    loadNodeChain(userId, nodeId),
    // Goal and Project forms offer every area; Result Area / Task forms ignore the list.
    listResultAreas(userId),
  ]);

  const linkedNotes: LinkedNoteSummary[] = linkedNoteRows.map((row) => ({
    id: row.id,
    title: row.title,
    noteDate: row.noteDate,
    snippet: noteSnippet(row.body),
    updatedAt: row.updatedAt,
  }));

  return {
    ...node,
    priorityRank: node.priorityRank === null ? null : Number(node.priorityRank),
    resultAreaId: owningResultAreaIdFromChain(chain),
    resultAreas,
    resultArea: resultArea[0] ?? null,
    goal: goal[0] ?? null,
    project: project[0] ?? null,
    task: task[0] ?? null,
    items,
    linkedNotes,
    plannedDay,
  };
}

/** Result Areas this user can file a Goal or Project under, by name. */
export async function listResultAreas(userId: string): Promise<ResultAreaOption[]> {
  return db
    .select({ id: nodes.id, name: nodes.name })
    .from(nodes)
    .where(and(eq(nodes.userId, userId), eq(nodes.type, "result_area")))
    .orderBy(asc(nodes.name));
}
