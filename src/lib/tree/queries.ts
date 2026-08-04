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
        n.priority_letter, n.priority_rank,
        n.tc_priority_letter, n.tc_priority_rank,
        n.state, n.deadline,
        n.target_start_date, n.target_end_date, n.deferred_date,
        n.focus, n.collapsed, n.notes, n.is_inbox, n.completed_at, n.created_at, n.updated_at,
        0 AS depth,
        ARRAY[n.sort_key] AS path
      FROM nodes n
      WHERE n.user_id = ${userId} AND n.parent_id IS NULL

      UNION ALL

      SELECT
        c.id, c.parent_id, c.type, c.name, c.sort_key,
        c.priority_letter, c.priority_rank,
        c.tc_priority_letter, c.tc_priority_rank,
        c.state, c.deadline,
        c.target_start_date, c.target_end_date, c.deferred_date,
        c.focus, c.collapsed, c.notes, c.is_inbox, c.completed_at, c.created_at, c.updated_at,
        t.depth + 1,
        t.path || c.sort_key
      FROM nodes c
      JOIN tree t ON c.parent_id = t.id
      WHERE c.user_id = ${userId}
    )
    SELECT
      t.id, t.parent_id, t.type, t.name, t.sort_key,
      t.priority_letter, t.priority_rank,
      t.tc_priority_letter, t.tc_priority_rank,
      t.state, t.deadline,
      t.focus, t.collapsed, t.notes, t.is_inbox, t.completed_at, t.created_at, t.updated_at, t.depth,
      td.effort_minutes, td.effort_left_minutes, td.actual_effort_minutes,
      td.percent_complete, td.recurrence_frequency,
      COALESCE(td.contexts, pd.contexts, gd.contexts, ARRAY[]::text[]) AS contexts,
      td.actual_start_date, COALESCE(td.date_completed, t.completed_at) AS date_completed,
      COALESCE(td.description, pd.description, rad.description, '') AS description,
      COALESCE(td.effort_driven, pd.effort_driven) AS effort_driven,
      COALESCE(td.lead_time_minutes, pd.lead_time_minutes) AS lead_time_minutes,
      td.deadline_lead_time_minutes,
      COALESCE(td.place, pd.place, '') AS place,
      pd.expected_cost, COALESCE(td.cost_low, pd.low_cost) AS cost_low,
      COALESCE(td.cost_high, pd.high_cost) AS cost_high,
      COALESCE(td.actual_cost, pd.cost_to_date) AS cost_to_date,
      rad.color, rad.category, rad.importance,
      t.deferred_date, t.target_start_date AS target_start, t.target_end_date AS target_end,
      COALESCE(pd.purpose, gd.purpose, '') AS purpose, pd.assigned_to,
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
      tcPriorityLetter:
        (r.tc_priority_letter as OutlineRow["tcPriorityLetter"]) ?? null,
      tcPriorityRank: r.tc_priority_rank === null ? null : Number(r.tc_priority_rank),
      state: r.state as OutlineRow["state"],
      deadline: r.deadline ? new Date(r.deadline as string) : null,
      focus: Boolean(r.focus),
      collapsed: Boolean(r.collapsed),
      notes: (r.notes as string) ?? "",
      isInbox: Boolean(r.is_inbox),
      completedAt: r.completed_at ? new Date(r.completed_at as string) : null,
      dateCompleted: r.date_completed ? new Date(r.date_completed as string) : null,
      createdAt: new Date(r.created_at as string),
      updatedAt: new Date(r.updated_at as string),
      depth: Number(r.depth),
      effortMinutes: r.effort_minutes === null ? null : Number(r.effort_minutes),
      effortLeftMinutes:
        r.effort_left_minutes === null ? null : Number(r.effort_left_minutes),
      actualEffortMinutes:
        r.actual_effort_minutes === null ? null : Number(r.actual_effort_minutes),
      percentComplete: r.percent_complete === null ? null : Number(r.percent_complete),
      contexts: (r.contexts as string[] | null) ?? [],
      actualStartDate: r.actual_start_date
        ? new Date(r.actual_start_date as string)
        : null,
      description: (r.description as string | null) ?? "",
      effortDriven:
        r.effort_driven === null || r.effort_driven === undefined
          ? null
          : Boolean(r.effort_driven),
      leadTimeMinutes:
        r.lead_time_minutes === null ? null : Number(r.lead_time_minutes),
      deadlineLeadTimeMinutes:
        r.deadline_lead_time_minutes === null
          ? null
          : Number(r.deadline_lead_time_minutes),
      place: (r.place as string | null) ?? "",
      expectedCost: r.expected_cost === null ? null : Number(r.expected_cost),
      costLow: r.cost_low === null ? null : Number(r.cost_low),
      costHigh: r.cost_high === null ? null : Number(r.cost_high),
      costToDate: r.cost_to_date === null ? null : Number(r.cost_to_date),
      deferredDate: r.deferred_date ? new Date(r.deferred_date as string) : null,
      recurrenceFrequency:
        (r.recurrence_frequency as OutlineRow["recurrenceFrequency"]) ?? "none",
      color: (r.color as string | null) ?? null,
      category: (r.category as string | null) ?? null,
      importance: r.importance === null ? null : Number(r.importance),
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
