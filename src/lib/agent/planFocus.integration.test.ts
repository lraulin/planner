import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { nodes, users } from "@/db/schema";
import { ensureWeeklyPlan } from "@/lib/planning/mutations";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createNode } from "@/lib/tree/mutations";
import { dispatchAgentTool } from "./tools";

/**
 * Plan-entry focus through the agent tools. In Achieve Planner a project's weekly MVP flag
 * is its Focus flag (release-log.txt:550; step 4 of the weekly wizard marks MVP projects,
 * online-help.md:1722-1723), so both entry tools write a project's focus through to the
 * outline. They used to disagree: the batch tool synced every node type and the single-entry
 * tool synced none.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("plan-entry focus agent tools");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `plan-focus-${crypto.randomUUID()}@localhost`,
      name: "Plan Focus",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

async function focusOf(nodeId: string): Promise<boolean | undefined> {
  return (await db.select().from(nodes).where(eq(nodes.id, nodeId)))[0]?.focus;
}

describeDb("plan-entry focus", () => {
  let userId: string;
  let planId: string;
  let area: string;
  let project: string;

  beforeEach(async () => {
    userId = await makeUser();
    planId = (await ensureWeeklyPlan(userId, { weekStart: new Date(2026, 8, 30) })).id;
    area = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Work",
    });
    project = await createNode({
      userId,
      parentId: area,
      type: "project",
      name: "Launch",
    });
  });

  it("upsert_plan_entry sets and clears a project's focus flag", async () => {
    await dispatchAgentTool(
      "upsert_plan_entry",
      { planId, nodeId: project, focus: true },
      userId,
    );
    expect(await focusOf(project)).toBe(true);

    await dispatchAgentTool(
      "upsert_plan_entry",
      { planId, nodeId: project, committedMinutes: 90 },
      userId,
    );
    expect(await focusOf(project)).toBe(true);

    await dispatchAgentTool(
      "upsert_plan_entry",
      { planId, nodeId: project, focus: false },
      userId,
    );
    expect(await focusOf(project)).toBe(false);
  });

  it("update_weekly_plan_entries syncs projects and leaves Result Areas alone", async () => {
    const result = (await dispatchAgentTool(
      "update_weekly_plan_entries",
      {
        planId,
        entries: [
          { nodeId: area, focus: true, reviewed: true },
          { nodeId: project, focus: true, committedMinutes: 120 },
        ],
      },
      userId,
    )) as { entries: { nodeId: string; focus: boolean }[] };

    expect(result.entries.map((entry) => entry.focus)).toEqual([true, true]);
    expect(await focusOf(project)).toBe(true);
    expect(await focusOf(area)).toBe(false);
  });

  it("upsert_plan_entry leaves a Result Area's outline flag alone", async () => {
    await dispatchAgentTool(
      "upsert_plan_entry",
      { planId, nodeId: area, focus: true },
      userId,
    );
    expect(await focusOf(area)).toBe(false);
  });
});
