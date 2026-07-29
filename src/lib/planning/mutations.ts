import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { nodes, weeklyPlanEntries, weeklyPlans } from "@/db/schema";
import { startOfWeek } from "@/lib/schedule/geometry";

/**
 * Writes for the weekly planning wizard.
 *
 * Every function takes a `userId` and every `where` clause carries it — including the ones
 * that look like they cannot need it, such as updating an entry by its own id. An entry is
 * reachable from a plan id, and a plan id is a uuid someone could hold; scoping the write
 * is what makes guessing one useless.
 */

export type WeeklyPlanInput = {
  weekStart: Date;
  weekStartsOn?: number;
  reviewAreasGoals?: boolean;
};

/** Clamp to a real weekday index; anything else means the caller passed junk. */
function normalizeWeekStartsOn(value: number | undefined): number {
  if (value === undefined || !Number.isInteger(value) || value < 0 || value > 6)
    return 0;
  return value;
}

/**
 * The plan for a week, creating it on first entry.
 *
 * `weekStart` is normalized here rather than trusted, so "plan the week containing
 * Thursday" and "plan the week starting Sunday" resolve to the same row instead of two.
 */
export async function ensureWeeklyPlan(userId: string, input: WeeklyPlanInput) {
  const weekStartsOn = normalizeWeekStartsOn(input.weekStartsOn);
  const weekStart = startOfWeek(input.weekStart, weekStartsOn);

  const [existing] = await db
    .select()
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.userId, userId), eq(weeklyPlans.weekStart, weekStart)))
    .limit(1);

  if (existing) {
    if (
      input.reviewAreasGoals === undefined ||
      input.reviewAreasGoals === existing.reviewAreasGoals
    ) {
      return existing;
    }
    return updateWeeklyPlan(userId, existing.id, {
      reviewAreasGoals: input.reviewAreasGoals,
    });
  }

  const [row] = await db
    .insert(weeklyPlans)
    .values({
      userId,
      weekStart,
      weekStartsOn,
      reviewAreasGoals: input.reviewAreasGoals ?? true,
    })
    .returning();
  return row;
}

export type WeeklyPlanPatch = {
  weekStartsOn?: number;
  reviewAreasGoals?: boolean;
  availableMinutes?: number | null;
  timeChartId?: string | null;
  blockSizeMinutes?: number;
  avoidCollisions?: boolean;
};

export async function updateWeeklyPlan(
  userId: string,
  id: string,
  patch: WeeklyPlanPatch,
) {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.weekStartsOn !== undefined) {
    values.weekStartsOn = normalizeWeekStartsOn(patch.weekStartsOn);
  }
  if (patch.reviewAreasGoals !== undefined) {
    values.reviewAreasGoals = patch.reviewAreasGoals;
  }
  if (patch.availableMinutes !== undefined) {
    values.availableMinutes =
      patch.availableMinutes === null ? null : Math.max(0, patch.availableMinutes);
  }
  if (patch.timeChartId !== undefined) values.timeChartId = patch.timeChartId;
  if (patch.blockSizeMinutes !== undefined) {
    values.blockSizeMinutes = Math.max(5, patch.blockSizeMinutes);
  }
  if (patch.avoidCollisions !== undefined)
    values.avoidCollisions = patch.avoidCollisions;

  const [row] = await db
    .update(weeklyPlans)
    .set(values)
    .where(and(eq(weeklyPlans.id, id), eq(weeklyPlans.userId, userId)))
    .returning();
  if (!row) throw new Error("Weekly plan not found.");
  return row;
}

/** Achieve's "Save and Close". Reopening is a plain toggle — a week is never truly done. */
export async function setWeeklyPlanCompleted(
  userId: string,
  id: string,
  completed: boolean,
) {
  const [row] = await db
    .update(weeklyPlans)
    .set({ completedAt: completed ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(weeklyPlans.id, id), eq(weeklyPlans.userId, userId)))
    .returning();
  if (!row) throw new Error("Weekly plan not found.");
  return row;
}

export async function deleteWeeklyPlan(userId: string, id: string) {
  const deleted = await db
    .delete(weeklyPlans)
    .where(and(eq(weeklyPlans.id, id), eq(weeklyPlans.userId, userId)))
    .returning({ id: weeklyPlans.id });
  if (deleted.length === 0) throw new Error("Weekly plan not found.");
}

export type PlanEntryPatch = {
  focus?: boolean;
  reviewed?: boolean;
  rewrite?: string;
  committedMinutes?: number | null;
};

/**
 * Record what this plan decided about one node, creating the row on first write.
 *
 * Both the plan and the node are re-checked against `userId` before anything is written:
 * without the node check, a plan of mine could be made to carry a row pointing at someone
 * else's project, and step 4 would then render their project names inside my week.
 */
export async function upsertPlanEntry(
  userId: string,
  planId: string,
  nodeId: string,
  patch: PlanEntryPatch,
) {
  const [plan] = await db
    .select({ id: weeklyPlans.id })
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.id, planId), eq(weeklyPlans.userId, userId)))
    .limit(1);
  if (!plan) throw new Error("Weekly plan not found.");

  const [node] = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .limit(1);
  if (!node) throw new Error("Item not found.");

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.focus !== undefined) values.focus = patch.focus;
  if (patch.reviewed !== undefined) values.reviewed = patch.reviewed;
  if (patch.rewrite !== undefined) values.rewrite = patch.rewrite;
  if (patch.committedMinutes !== undefined) {
    values.committedMinutes =
      patch.committedMinutes === null ? null : Math.max(0, patch.committedMinutes);
  }

  const [row] = await db
    .insert(weeklyPlanEntries)
    .values({
      userId,
      planId,
      nodeId,
      focus: patch.focus ?? false,
      reviewed: patch.reviewed ?? false,
      rewrite: patch.rewrite ?? "",
      committedMinutes: patch.committedMinutes ?? null,
    })
    .onConflictDoUpdate({
      target: [weeklyPlanEntries.planId, weeklyPlanEntries.nodeId],
      set: values,
    })
    .returning();
  return row;
}

/**
 * Step 1's "Make this a Focus Area for this week".
 *
 * Writes both places on purpose: `nodes.focus` is what the outline's Focus filter reads
 * (so the flag is useful the moment you leave the wizard), and the plan entry is what
 * survives next week's un-focus, so the plan stays a record of what you decided then.
 */
export async function setFocusArea(
  userId: string,
  planId: string,
  nodeId: string,
  focus: boolean,
) {
  const entry = await upsertPlanEntry(userId, planId, nodeId, {
    focus,
    reviewed: true,
  });
  await db
    .update(nodes)
    .set({ focus, updatedAt: new Date() })
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));
  return entry;
}
