import { db } from "@/db";
import { sql } from "drizzle-orm";
import { deriveNotes } from "./derive";
import type { NoteNode, NoteRow } from "./types";

/**
 * Loads a user's whole note tree in one round trip.
 *
 * Same shape as `loadOutline` in `src/lib/tree/queries.ts`: the recursive CTE accumulates
 * each note's chain of sort keys into a path array, so ordering by that path yields
 * depth-first order with siblings correctly sequenced.
 *
 * The join to `nodes` is for the "Linked to" column. It is a left join on a nullable
 * column, so an unlinked note — the common case — costs nothing.
 */
export async function loadNotes(userId: string): Promise<NoteNode[]> {
  const result = await db.execute(sql`
    WITH RECURSIVE note_tree AS (
      SELECT
        n.id, n.parent_id, n.sort_key, n.title, n.subject, n.body,
        n.note_date, n.flag, n.contexts, n.collapsed, n.node_id,
        n.created_at, n.updated_at,
        0 AS depth,
        ARRAY[n.sort_key] AS path
      FROM notes n
      WHERE n.user_id = ${userId} AND n.parent_id IS NULL

      UNION ALL

      SELECT
        c.id, c.parent_id, c.sort_key, c.title, c.subject, c.body,
        c.note_date, c.flag, c.contexts, c.collapsed, c.node_id,
        c.created_at, c.updated_at,
        t.depth + 1,
        t.path || c.sort_key
      FROM notes c
      JOIN note_tree t ON c.parent_id = t.id
      WHERE c.user_id = ${userId}
    )
    SELECT
      t.id, t.parent_id, t.sort_key, t.title, t.subject, t.body,
      t.note_date, t.flag, t.contexts, t.collapsed, t.node_id,
      t.created_at, t.updated_at, t.depth,
      linked.name AS node_name,
      linked.type AS node_type
    FROM note_tree t
    LEFT JOIN nodes linked ON linked.id = t.node_id AND linked.user_id = ${userId}
    ORDER BY t.path
  `);

  const rows: NoteRow[] = (result as unknown as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    parentId: (r.parent_id as string | null) ?? null,
    sortKey: r.sort_key as string,
    title: r.title as string,
    subject: r.subject as string,
    body: r.body as string,
    noteDate: r.note_date ? new Date(r.note_date as string) : null,
    flag: r.flag as NoteRow["flag"],
    contexts: (r.contexts as string[] | null) ?? [],
    collapsed: Boolean(r.collapsed),
    depth: Number(r.depth),
    nodeId: (r.node_id as string | null) ?? null,
    nodeName: (r.node_name as string | null) ?? null,
    nodeType: (r.node_type as NoteRow["nodeType"]) ?? null,
    createdAt: new Date(r.created_at as string),
    updatedAt: new Date(r.updated_at as string),
  }));

  return deriveNotes(rows);
}

/** Every note linked to one record, newest first. Backs the Notes tab on a node's drawer. */
export async function loadNotesForNode(
  userId: string,
  nodeId: string,
): Promise<NoteNode[]> {
  const all = await loadNotes(userId);
  return all
    .filter((note) => note.nodeId === nodeId)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}
