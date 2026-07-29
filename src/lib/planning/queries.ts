import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  nodeItems,
  nodes,
  resultAreaDetails,
  weeklyPlanEntries,
  weeklyPlans,
  type WeeklyPlan,
  type WeeklyPlanEntry,
} from "@/db/schema";
import { startOfWeek } from "@/lib/schedule/geometry";
import { loadSchedule, type SchedulePayload } from "@/lib/schedule/queries";
import { loadOutline } from "@/lib/tree/queries";
import type { OutlineNode } from "@/lib/tree/types";

export async function getWeeklyPlan(
  userId: string,
  weekStart: Date,
  weekStartsOn = 0,
): Promise<WeeklyPlan | null> {
  const normalized = startOfWeek(weekStart, weekStartsOn);
  const [row] = await db
    .select()
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.userId, userId), eq(weeklyPlans.weekStart, normalized)))
    .limit(1);
  return row ?? null;
}

export async function getWeeklyPlanById(
  userId: string,
  id: string,
): Promise<WeeklyPlan | null> {
  const [row] = await db
    .select()
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.id, id), eq(weeklyPlans.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Most recent plans first — the wizard's "resume where you left off" list. */
export async function listWeeklyPlans(userId: string, limit = 12) {
  return db
    .select()
    .from(weeklyPlans)
    .where(eq(weeklyPlans.userId, userId))
    .orderBy(desc(weeklyPlans.weekStart))
    .limit(limit);
}

export async function listPlanEntries(
  userId: string,
  planId: string,
): Promise<WeeklyPlanEntry[]> {
  return db
    .select()
    .from(weeklyPlanEntries)
    .where(
      and(eq(weeklyPlanEntries.userId, userId), eq(weeklyPlanEntries.planId, planId)),
    );
}

/**
 * Last week's rewrites for a set of goals, so step 2 can show what you wrote the last time
 * you sat down. Rereading the previous restatement beside the new box is most of why the
 * exercise is worth doing at all.
 */
export async function loadPreviousRewrites(
  userId: string,
  beforeWeekStart: Date,
): Promise<Map<string, { rewrite: string; weekStart: Date }>> {
  const plans = await db
    .select({ id: weeklyPlans.id, weekStart: weeklyPlans.weekStart })
    .from(weeklyPlans)
    .where(eq(weeklyPlans.userId, userId))
    .orderBy(desc(weeklyPlans.weekStart));

  const earlier = plans.filter((p) => p.weekStart < beforeWeekStart);
  if (earlier.length === 0) return new Map();

  const byPlanId = new Map(earlier.map((p) => [p.id, p.weekStart]));
  const entries = await db
    .select({
      planId: weeklyPlanEntries.planId,
      nodeId: weeklyPlanEntries.nodeId,
      rewrite: weeklyPlanEntries.rewrite,
    })
    .from(weeklyPlanEntries)
    .where(
      and(
        eq(weeklyPlanEntries.userId, userId),
        inArray(
          weeklyPlanEntries.planId,
          earlier.map((p) => p.id),
        ),
      ),
    );

  // `earlier` is newest-first, so the first rewrite seen for a node is the most recent one.
  const result = new Map<string, { rewrite: string; weekStart: Date }>();
  for (const plan of earlier) {
    for (const entry of entries) {
      if (entry.planId !== plan.id) continue;
      if (!entry.rewrite.trim()) continue;
      if (result.has(entry.nodeId)) continue;
      result.set(entry.nodeId, {
        rewrite: entry.rewrite,
        weekStart: byPlanId.get(plan.id)!,
      });
    }
  }
  return result;
}

export type ResultAreaReview = {
  nodeId: string;
  description: string;
  mission: string;
  principles: {
    id: string;
    title: string;
    description: string;
  }[];
};

/**
 * The prose step 1 walks through, for every result area at once.
 *
 * `loadNodeDetail` would serve one area per round trip; the wizard pages through all of
 * them, so it is cheaper — and much less flickery — to fetch the set up front.
 */
export async function loadResultAreaReviews(
  userId: string,
): Promise<Map<string, ResultAreaReview>> {
  const areaRows = await db
    .select({
      nodeId: nodes.id,
      description: resultAreaDetails.description,
      mission: resultAreaDetails.mission,
    })
    .from(nodes)
    .leftJoin(resultAreaDetails, eq(resultAreaDetails.nodeId, nodes.id))
    .where(and(eq(nodes.userId, userId), eq(nodes.type, "result_area")));

  if (areaRows.length === 0) return new Map();

  const principles = await db
    .select({
      id: nodeItems.id,
      nodeId: nodeItems.nodeId,
      title: nodeItems.title,
      description: nodeItems.description,
    })
    .from(nodeItems)
    .where(
      and(
        eq(nodeItems.userId, userId),
        eq(nodeItems.kind, "guiding_principle"),
        inArray(
          nodeItems.nodeId,
          areaRows.map((a) => a.nodeId),
        ),
      ),
    )
    .orderBy(asc(nodeItems.sortKey));

  const result = new Map<string, ResultAreaReview>();
  for (const area of areaRows) {
    result.set(area.nodeId, {
      nodeId: area.nodeId,
      description: area.description ?? "",
      mission: area.mission ?? "",
      principles: principles
        .filter((p) => p.nodeId === area.nodeId)
        .map(({ id, title, description }) => ({ id, title, description })),
    });
  }
  return result;
}

export type WeeklyPlanPayload = {
  plan: WeeklyPlan | null;
  entries: WeeklyPlanEntry[];
  nodes: OutlineNode[];
  schedule: SchedulePayload;
  resultAreaReviews: [string, ResultAreaReview][];
  previousRewrites: [string, { rewrite: string; weekStart: string }][];
  weekStart: string;
  weekStartsOn: number;
};

/**
 * Everything the wizard page renders, in one pass.
 *
 * Maps are handed to the client as entry arrays: a `Map` does not survive the RSC
 * boundary, and rebuilding one on the client is a single line at the call site.
 */
export async function loadWeeklyPlanPayload(
  userId: string,
  options: { weekStart: Date; weekStartsOn?: number },
): Promise<WeeklyPlanPayload> {
  const weekStartsOn = options.weekStartsOn ?? 0;
  const weekStart = startOfWeek(options.weekStart, weekStartsOn);

  const plan = await getWeeklyPlan(userId, weekStart, weekStartsOn);

  const [entries, outline, schedule, reviews, previous] = await Promise.all([
    plan ? listPlanEntries(userId, plan.id) : Promise.resolve([]),
    loadOutline(userId),
    loadSchedule(userId, {
      weekStart,
      weekStartsOn,
      timeChartId: plan?.timeChartId ?? null,
    }),
    loadResultAreaReviews(userId),
    loadPreviousRewrites(userId, weekStart),
  ]);

  return {
    plan,
    entries,
    nodes: outline,
    schedule,
    resultAreaReviews: [...reviews.entries()],
    previousRewrites: [...previous.entries()].map(([nodeId, value]) => [
      nodeId,
      { rewrite: value.rewrite, weekStart: value.weekStart.toISOString() },
    ]),
    weekStart: weekStart.toISOString(),
    weekStartsOn,
  };
}
