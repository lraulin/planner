import { db } from "@/db";
import { sql } from "drizzle-orm";
import { derive } from "./derive";
import type { OutlineNode, OutlineRow } from "./types";

/**
 * Loads a user's entire outline in one round trip.
 *
 * The recursive CTE accumulates each node's chain of sort keys into a path array, so
 * ordering by that path yields depth-first order with siblings correctly sequenced —
 * exactly the order the outline grid renders.
 */
export async function loadOutline(userId: string): Promise<OutlineNode[]> {
  const result = await db.execute(sql`
    WITH RECURSIVE tree AS (
      SELECT
        n.id, n.parent_id, n.type, n.name, n.sort_key,
        n.priority_letter, n.priority_rank, n.state, n.deadline,
        n.focus, n.collapsed, n.notes, n.is_inbox, n.completed_at,
        0 AS depth,
        ARRAY[n.sort_key] AS path
      FROM nodes n
      WHERE n.user_id = ${userId} AND n.parent_id IS NULL

      UNION ALL

      SELECT
        c.id, c.parent_id, c.type, c.name, c.sort_key,
        c.priority_letter, c.priority_rank, c.state, c.deadline,
        c.focus, c.collapsed, c.notes, c.is_inbox, c.completed_at,
        t.depth + 1,
        t.path || c.sort_key
      FROM nodes c
      JOIN tree t ON c.parent_id = t.id
      WHERE c.user_id = ${userId}
    )
    SELECT
      t.id, t.parent_id, t.type, t.name, t.sort_key,
      t.priority_letter, t.priority_rank, t.state, t.deadline,
      t.focus, t.collapsed, t.notes, t.is_inbox, t.completed_at, t.depth,
      td.effort_minutes, td.effort_left_minutes, td.actual_effort_minutes,
      td.percent_complete, td.contexts,
      rad.color, rad.category,
      -- One column per grid column: a project keeps its dates in project_details and a
      -- task in task_details, and no row is ever both.
      COALESCE(pd.project_start, td.target_start_date) AS target_start,
      COALESCE(pd.target_end, td.target_end_date) AS target_end,
      pd.purpose, pd.assigned_to,
      gd.definition, gd.range, gd.is_dream
    FROM tree t
    LEFT JOIN task_details td ON td.node_id = t.id
    LEFT JOIN result_area_details rad ON rad.node_id = t.id
    LEFT JOIN project_details pd ON pd.node_id = t.id
    LEFT JOIN goal_details gd ON gd.node_id = t.id
    ORDER BY t.path
  `);

  const rows: OutlineRow[] = (result as unknown as Record<string, unknown>[]).map(
    (r) => ({
      id: r.id as string,
      parentId: (r.parent_id as string | null) ?? null,
      type: r.type as OutlineRow["type"],
      name: r.name as string,
      sortKey: r.sort_key as string,
      priorityLetter: (r.priority_letter as OutlineRow["priorityLetter"]) ?? null,
      priorityRank: r.priority_rank === null ? null : Number(r.priority_rank),
      state: r.state as OutlineRow["state"],
      deadline: r.deadline ? new Date(r.deadline as string) : null,
      focus: Boolean(r.focus),
      collapsed: Boolean(r.collapsed),
      notes: (r.notes as string) ?? "",
      isInbox: Boolean(r.is_inbox),
      completedAt: r.completed_at ? new Date(r.completed_at as string) : null,
      depth: Number(r.depth),
      effortMinutes: r.effort_minutes === null ? null : Number(r.effort_minutes),
      effortLeftMinutes:
        r.effort_left_minutes === null ? null : Number(r.effort_left_minutes),
      actualEffortMinutes:
        r.actual_effort_minutes === null ? null : Number(r.actual_effort_minutes),
      percentComplete: r.percent_complete === null ? null : Number(r.percent_complete),
      contexts: (r.contexts as string[] | null) ?? [],
      color: (r.color as string | null) ?? null,
      category: (r.category as string | null) ?? null,
      targetStart: r.target_start ? new Date(r.target_start as string) : null,
      targetEnd: r.target_end ? new Date(r.target_end as string) : null,
      purpose: (r.purpose as string | null) ?? "",
      assignedTo: (r.assigned_to as string | null) ?? "",
      definition: (r.definition as string | null) ?? "",
      range: (r.range as string | null) ?? "",
      isDream: Boolean(r.is_dream),
    }),
  );

  return derive(rows);
}
