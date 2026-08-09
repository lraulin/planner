import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { listPlanEntries } from "@/lib/planning/queries";
import { ensureWeeklyPlan } from "@/lib/planning/mutations";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createNode } from "@/lib/tree/mutations";
import { dispatchAgentTool } from "./tools";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("agent tool contracts");

const userIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `agent-contract-${crypto.randomUUID()}@localhost`,
      name: "Agent Contract Test",
    })
    .returning({ id: users.id });
  userIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of userIds) await db.delete(users).where(eq(users.id, id));
});

describeDb("agent tool contract database behavior", () => {
  let userId: string;
  let otherId: string;

  beforeEach(async () => {
    userId = await makeUser();
    otherId = await makeUser();
  });

  it("replays a keyed node unchanged and scopes the same key per user", async () => {
    const first = (await dispatchAgentTool(
      "create_node",
      {
        type: "task",
        name: "Original",
        externalSource: "test_import",
        externalId: "node-1",
      },
      userId,
    )) as { node: { id: string }; created: boolean };
    expect(first.created).toBe(true);

    await dispatchAgentTool(
      "update_node",
      { id: first.node.id, name: "Triaged" },
      userId,
    );
    const replay = (await dispatchAgentTool(
      "create_node",
      {
        type: "task",
        name: "Incoming stale name",
        externalSource: "test_import",
        externalId: "node-1",
      },
      userId,
    )) as { node: { id: string; name: string }; created: boolean };
    expect(replay).toMatchObject({
      created: false,
      node: { id: first.node.id, name: "Triaged" },
    });

    const other = (await dispatchAgentTool(
      "create_node",
      {
        type: "task",
        name: "Other user's copy",
        externalSource: "test_import",
        externalId: "node-1",
      },
      otherId,
    )) as { node: { id: string }; created: boolean };
    expect(other.created).toBe(true);
    expect(other.node.id).not.toBe(first.node.id);
    await expect(
      dispatchAgentTool("get_node", { id: first.node.id }, otherId),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("replays keyed notes, metrics, and metric entries without reverting edits", async () => {
    const note = (await dispatchAgentTool(
      "create_note",
      {
        title: "Imported",
        body: "First body",
        externalSource: "test_import",
        externalId: "note-1",
      },
      userId,
    )) as { note: { id: string }; created: boolean };
    await dispatchAgentTool(
      "update_note",
      { id: note.note.id, body: "Edited body" },
      userId,
    );
    const noteReplay = (await dispatchAgentTool(
      "create_note",
      {
        title: "Stale",
        body: "Stale body",
        externalSource: "test_import",
        externalId: "note-1",
      },
      userId,
    )) as { note: { id: string; body: string }; created: boolean };
    expect(noteReplay).toMatchObject({
      created: false,
      note: { id: note.note.id, body: "Edited body" },
    });

    const metric = (await dispatchAgentTool(
      "create_metric",
      {
        title: "Imported metric",
        externalSource: "test_import",
        externalId: "metric-1",
      },
      userId,
    )) as { metric: { id: string }; created: boolean };
    await dispatchAgentTool(
      "update_metric",
      { id: metric.metric.id, title: "Renamed metric" },
      userId,
    );
    const metricReplay = (await dispatchAgentTool(
      "create_metric",
      {
        title: "Stale metric",
        externalSource: "test_import",
        externalId: "metric-1",
      },
      userId,
    )) as { metric: { id: string; title: string }; created: boolean };
    expect(metricReplay).toMatchObject({
      created: false,
      metric: { id: metric.metric.id, title: "Renamed metric" },
    });

    const entry = (await dispatchAgentTool(
      "log_metric_entry",
      {
        metricId: metric.metric.id,
        value: 1,
        entryDate: "2026-08-09",
        externalSource: "test_import",
        externalId: "entry-1",
      },
      userId,
    )) as { entryId: string; created: boolean };
    await dispatchAgentTool(
      "update_metric_entry",
      { id: entry.entryId, value: 2 },
      userId,
    );
    const entryReplay = (await dispatchAgentTool(
      "log_metric_entry",
      {
        metricId: metric.metric.id,
        value: 999,
        entryDate: "2026-08-08",
        externalSource: "test_import",
        externalId: "entry-1",
      },
      userId,
    )) as { entryId: string; value: number; created: boolean };
    expect(entryReplay).toMatchObject({
      entryId: entry.entryId,
      value: 2,
      created: false,
    });

    await dispatchAgentTool(
      "log_metric_entry",
      { metricId: metric.metric.id, value: 3, entryDate: "2026-08-10" },
      userId,
    );
    const pagedMetric = (await dispatchAgentTool(
      "get_metric",
      { id: metric.metric.id, entryLimit: 1 },
      userId,
    )) as {
      metric: {
        entries: unknown[];
        entryPageInfo: { total: number; hasMore: boolean };
      };
    };
    expect(pagedMetric.metric.entries).toHaveLength(1);
    expect(pagedMetric.metric.entryPageInfo).toMatchObject({
      total: 2,
      hasMore: true,
    });
  });

  it("returns compact, explicit pages for nodes and notes", async () => {
    for (const name of ["One", "Two", "Three"]) {
      await dispatchAgentTool("create_node", { type: "task", name }, userId);
    }
    const nodes = (await dispatchAgentTool(
      "search_nodes",
      { type: "task", limit: 2 },
      userId,
    )) as {
      nodes: unknown[];
      pageInfo: { total: number; hasMore: boolean; nextOffset: number };
    };
    expect(nodes.nodes).toHaveLength(2);
    expect(nodes.pageInfo).toMatchObject({ total: 3, hasMore: true, nextOffset: 2 });

    await dispatchAgentTool(
      "create_note",
      { title: "Needle", body: "A long private body with needle inside" },
      userId,
    );
    const notes = (await dispatchAgentTool(
      "search_notes",
      { query: "needle", limit: 1 },
      userId,
    )) as {
      notes: { id: string; snippet: string; body?: string }[];
      pageInfo: { total: number };
    };
    expect(notes.pageInfo.total).toBe(1);
    expect(notes.notes[0].snippet).toContain("needle");
    expect(notes.notes[0]).not.toHaveProperty("body");
    const full = (await dispatchAgentTool(
      "get_note",
      { id: notes.notes[0].id },
      userId,
    )) as { note: { body: string } };
    expect(full.note.body).toBe("A long private body with needle inside");
  });

  it("applies weekly-plan entries in order, is replay-safe, and rolls back on foreign ids", async () => {
    const firstNode = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "First",
    });
    const secondNode = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Second",
    });
    const foreignNode = await createNode({
      userId: otherId,
      parentId: null,
      type: "result_area",
      name: "Foreign",
    });
    const plan = await ensureWeeklyPlan(userId, {
      weekStart: new Date("2026-08-09T12:00:00Z"),
    });

    const args = {
      planId: plan.id,
      entries: [
        { nodeId: secondNode, focus: true, reviewed: true },
        { nodeId: firstNode, reviewed: true, rewrite: "First rewrite" },
      ],
    };
    const applied = (await dispatchAgentTool(
      "update_weekly_plan_entries",
      args,
      userId,
    )) as { entries: { id: string; nodeId: string }[]; applied: number };
    expect(applied.entries.map((entry) => entry.nodeId)).toEqual([
      secondNode,
      firstNode,
    ]);
    expect(applied.applied).toBe(2);

    const loaded = (await dispatchAgentTool(
      "load_weekly_plan",
      { weekStart: "2026-08-09T12:00:00Z" },
      userId,
    )) as { plan: { id: string } | null };
    expect(loaded.plan?.id).toBe(plan.id);

    const replay = (await dispatchAgentTool(
      "update_weekly_plan_entries",
      args,
      userId,
    )) as { entries: { id: string }[] };
    expect(replay.entries.map((entry) => entry.id)).toEqual(
      applied.entries.map((entry) => entry.id),
    );
    expect(await listPlanEntries(userId, plan.id)).toHaveLength(2);

    await expect(
      dispatchAgentTool(
        "update_weekly_plan_entries",
        {
          planId: plan.id,
          entries: [
            { nodeId: firstNode, rewrite: "Must roll back" },
            { nodeId: foreignNode, reviewed: true },
          ],
        },
        userId,
      ),
    ).rejects.toMatchObject({ code: "not_found" });
    const rows = await listPlanEntries(userId, plan.id);
    expect(rows.find((entry) => entry.nodeId === firstNode)?.rewrite).toBe(
      "First rewrite",
    );

    await expect(
      dispatchAgentTool(
        "update_weekly_plan_entries",
        { planId: plan.id, entries: [{ nodeId: firstNode, reviewed: false }] },
        otherId,
      ),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
