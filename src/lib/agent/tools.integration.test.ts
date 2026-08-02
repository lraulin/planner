import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createNode } from "@/lib/tree/mutations";
import { loadOutline } from "@/lib/tree/queries";
import { AgentError } from "./errors";
import { dispatchAgentTool } from "./tools";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("agent tools");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `agent-test-${crypto.randomUUID()}@localhost`,
      name: "Agent Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("agent tools", () => {
  let userId: string;
  let otherId: string;

  beforeEach(async () => {
    userId = await makeUser();
    otherId = await makeUser();
  });

  it("creates, searches, updates, and completes a task under a project", async () => {
    const area = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Work",
    });
    const project = await createNode({
      userId,
      parentId: area,
      type: "project",
      name: "API",
    });

    const created = (await dispatchAgentTool(
      "create_node",
      {
        type: "task",
        parentId: project,
        name: "Wire tools",
        priorityLetter: "A",
        priorityRank: 1,
      },
      userId,
    )) as { node: { id: string; state: string } };

    expect(created.node.state).toBe("not_started");

    const search = (await dispatchAgentTool(
      "search_nodes",
      { query: "Wire", type: "task" },
      userId,
    )) as { nodes: { id: string }[] };
    expect(search.nodes.map((n) => n.id)).toContain(created.node.id);

    const done = (await dispatchAgentTool(
      "update_node",
      { id: created.node.id, state: "completed" },
      userId,
    )) as { node: { state: string } };
    expect(done.node.state).toBe("completed");
  });

  // An agent capturing something it has not placed yet should not have to invent a parent
  // for it, so omitting parentId means the top level rather than a validation error.
  it("creates a task at the top level when no parent is given", async () => {
    const created = (await dispatchAgentTool(
      "create_node",
      { type: "task", name: "Unfiled" },
      userId,
    )) as { node: { id: string; parentId: string | null; type: string } };

    expect(created.node.parentId).toBeNull();
    expect(created.node.type).toBe("task");
  });

  // Root create_node is not capture. Capture must land under the Inbox project so
  // unprocessed ideas stay distinct from deliberately unfiled top-level work.
  it("capture puts a task under the inbox, not at the root", async () => {
    const captured = (await dispatchAgentTool(
      "capture",
      { name: "Call the dentist" },
      userId,
    )) as {
      node: { id: string; parentId: string | null; name: string; type: string };
      parentId: string;
      createdIds: string[];
    };

    expect(captured.node.name).toBe("Call the dentist");
    expect(captured.node.type).toBe("task");
    expect(captured.node.parentId).toBe(captured.parentId);
    expect(captured.createdIds).toEqual([captured.node.id]);

    const inbox = (await dispatchAgentTool(
      "get_node",
      { id: captured.parentId },
      userId,
    )) as { node: { type: string; parentId: string | null } };
    expect(inbox.node.type).toBe("project");
    expect(inbox.node.parentId).toBeNull();

    // Confirm the flag path, not only the name — rename would still be the inbox.
    const outline = await loadOutline(userId);
    const inboxRow = outline.find((n) => n.id === captured.parentId);
    expect(inboxRow?.isInbox).toBe(true);
  });

  it("capture rejects a blank name", async () => {
    await expect(
      dispatchAgentTool("capture", { name: "   " }, userId),
    ).rejects.toMatchObject({
      code: "validation",
      message: "name is required",
    });
  });

  it("does not let one user read another user's captured task", async () => {
    const captured = (await dispatchAgentTool(
      "capture",
      { name: "Private idea" },
      userId,
    )) as { node: { id: string } };

    await expect(
      dispatchAgentTool("get_node", { id: captured.node.id }, otherId),
    ).rejects.toBeInstanceOf(AgentError);
  });

  // The Apple Reminders drain's request: one POST for the whole list, sent again whenever
  // the Shortcut is not sure the first one landed.
  it("capture takes a batch and lands every item under the inbox", async () => {
    const batch = (await dispatchAgentTool(
      "capture",
      {
        externalSource: "apple_reminders",
        items: [
          { name: "Call the dentist", externalId: "r1" },
          { name: "File taxes", externalId: "r2", deadline: "2026-04-15T00:00:00Z" },
        ],
      },
      userId,
    )) as {
      parentId: string;
      created: number;
      skipped: number;
      results: { nodeId: string; created: boolean; externalId?: string }[];
    };

    expect(batch.created).toBe(2);
    expect(batch.skipped).toBe(0);
    expect(batch.results.map((r) => r.externalId)).toEqual(["r1", "r2"]);

    const outline = await loadOutline(userId);
    expect(outline.find((n) => n.id === batch.parentId)?.isInbox).toBe(true);
    for (const result of batch.results) {
      expect(outline.find((n) => n.id === result.nodeId)?.parentId).toBe(
        batch.parentId,
      );
    }
  });

  it("capture skips items it has already imported when the batch is resent", async () => {
    const args = {
      externalSource: "apple_reminders",
      items: [{ name: "Buy milk", externalId: "r1" }],
    };

    await dispatchAgentTool("capture", args, userId);
    const again = (await dispatchAgentTool("capture", args, userId)) as {
      created: number;
      skipped: number;
    };

    expect(again).toMatchObject({ created: 0, skipped: 1 });
    const milk = (await loadOutline(userId)).filter((n) => n.name === "Buy milk");
    expect(milk).toHaveLength(1);
  });

  it("capture rejects a malformed batch", async () => {
    await expect(
      dispatchAgentTool("capture", { items: [] }, userId),
    ).rejects.toMatchObject({ code: "validation" });

    await expect(
      dispatchAgentTool("capture", { name: "One", items: [{ name: "Two" }] }, userId),
    ).rejects.toMatchObject({ code: "validation" });

    // An unqualified id would write a row now and a duplicate row next run.
    await expect(
      dispatchAgentTool(
        "capture",
        { items: [{ name: "One", externalId: "r1" }] },
        userId,
      ),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("does not let one user see another user's batch-captured tasks", async () => {
    const batch = (await dispatchAgentTool(
      "capture",
      {
        externalSource: "apple_reminders",
        items: [{ name: "Private reminder", externalId: "r1" }],
      },
      userId,
    )) as { results: { nodeId: string }[] };

    await expect(
      dispatchAgentTool("get_node", { id: batch.results[0].nodeId }, otherId),
    ).rejects.toBeInstanceOf(AgentError);

    const theirOutline = await loadOutline(otherId);
    expect(theirOutline.find((n) => n.name === "Private reminder")).toBeUndefined();
  });

  it("still refuses a nesting that goes backwards", async () => {
    const task = await createNode({
      userId,
      parentId: null,
      type: "task",
      name: "Loose",
    });

    // `validation`, not `internal`: an agent can only correct itself if the 400 says what
    // was wrong. `toAgentError` classifies this by message, so it is worth pinning.
    await expect(
      dispatchAgentTool("create_node", { type: "goal", parentId: task }, userId),
    ).rejects.toMatchObject({
      code: "validation",
      message: "A Goal cannot go under a Task.",
    });
  });

  it("does not let one user read or change another user's node", async () => {
    const area = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Secret",
    });

    await expect(
      dispatchAgentTool("get_node", { id: area }, otherId),
    ).rejects.toBeInstanceOf(AgentError);

    await expect(
      dispatchAgentTool("update_node", { id: area, name: "Hacked" }, otherId),
    ).rejects.toBeInstanceOf(AgentError);

    const owner = (await dispatchAgentTool("get_node", { id: area }, userId)) as {
      node: { name: string };
    };
    expect(owner.node.name).toBe("Secret");
  });

  it("creates a note and lists it", async () => {
    const created = (await dispatchAgentTool(
      "create_note",
      { title: "Inbox dump", body: "Buy milk" },
      userId,
    )) as { note: { id: string; title: string } };
    expect(created.note.title).toBe("Inbox dump");

    const listed = (await dispatchAgentTool("list_notes", {}, userId)) as {
      notes: { id: string }[];
    };
    expect(listed.notes.map((n) => n.id)).toContain(created.note.id);
  });

  it("does not let one user delete another's appointment", async () => {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const created = (await dispatchAgentTool(
      "create_appointment",
      {
        subject: "Private",
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      },
      userId,
    )) as { appointment: { id: string } };

    await expect(
      dispatchAgentTool("delete_appointment", { id: created.appointment.id }, otherId),
    ).rejects.toBeInstanceOf(AgentError);
  });

  it("ensures a weekly plan and sets a focus area", async () => {
    const area = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Health",
    });

    const ensured = (await dispatchAgentTool(
      "ensure_weekly_plan",
      { weekStart: new Date().toISOString() },
      userId,
    )) as { plan: { id: string } };

    await dispatchAgentTool(
      "set_focus_area",
      { planId: ensured.plan.id, nodeId: area, focus: true },
      userId,
    );

    const ctx = (await dispatchAgentTool("get_context", {}, userId)) as {
      focus: { id: string }[];
    };
    expect(ctx.focus.map((n) => n.id)).toContain(area);
  });

  it("rejects unknown tools", async () => {
    await expect(dispatchAgentTool("nope", {}, userId)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("creates a metric, logs an entry, and lists it", async () => {
    const area = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Health",
    });
    const goal = await createNode({
      userId,
      parentId: area,
      type: "goal",
      name: "Fitness",
    });

    const created = (await dispatchAgentTool(
      "create_metric",
      {
        title: "Body weight",
        units: "lb",
        metricType: "instance",
        objectiveTarget: 175,
        ownerNodeId: goal,
      },
      userId,
    )) as {
      metric: {
        id: string;
        title: string;
        lastValue: number | null;
        ownerNodeId: string | null;
      };
    };

    expect(created.metric.title).toBe("Body weight");
    expect(created.metric.ownerNodeId).toBe(goal);
    expect(created.metric.lastValue).toBeNull();

    const logged = (await dispatchAgentTool(
      "log_metric_entry",
      {
        metricId: created.metric.id,
        value: 182.5,
        entryDate: "2026-08-02",
        target: 175,
      },
      userId,
    )) as {
      entryId: string;
      entryDate: string;
      value: number;
      metric: {
        lastValue: number | null;
        lastDate: string | null;
        entries: { value: number }[];
      };
    };

    expect(logged.entryDate).toBe("2026-08-02");
    expect(logged.value).toBe(182.5);
    expect(logged.metric.lastValue).toBe(182.5);
    expect(logged.metric.lastDate).toBe("2026-08-02");
    expect(logged.metric.entries[0]?.value).toBe(182.5);

    const listed = (await dispatchAgentTool(
      "list_metrics",
      { query: "weight" },
      userId,
    )) as { metrics: { id: string; lastValue: number | null }[] };
    expect(listed.metrics.map((m) => m.id)).toContain(created.metric.id);
    expect(listed.metrics.find((m) => m.id === created.metric.id)?.lastValue).toBe(
      182.5,
    );

    const patched = (await dispatchAgentTool(
      "update_metric_entry",
      { id: logged.entryId, value: 181 },
      userId,
    )) as { entry: { value: number }; metric: { lastValue: number | null } };
    expect(patched.entry.value).toBe(181);
    expect(patched.metric.lastValue).toBe(181);
  });

  it("isolates metrics from a second user", async () => {
    const created = (await dispatchAgentTool(
      "create_metric",
      { title: "Private metric" },
      userId,
    )) as { metric: { id: string } };

    await expect(
      dispatchAgentTool("get_metric", { id: created.metric.id }, otherId),
    ).rejects.toMatchObject({ code: "not_found" });

    await expect(
      dispatchAgentTool(
        "log_metric_entry",
        { metricId: created.metric.id, value: 1, entryDate: "2026-08-02" },
        otherId,
      ),
    ).rejects.toMatchObject({ code: "not_found" });

    await expect(
      dispatchAgentTool(
        "update_metric",
        { id: created.metric.id, title: "Hijacked" },
        otherId,
      ),
    ).rejects.toMatchObject({ code: "not_found" });

    const otherList = (await dispatchAgentTool("list_metrics", {}, otherId)) as {
      metrics: { id: string }[];
    };
    expect(otherList.metrics.map((m) => m.id)).not.toContain(created.metric.id);
  });

  it("rejects invalid metric log payloads as validation", async () => {
    const created = (await dispatchAgentTool(
      "create_metric",
      { title: "Mood" },
      userId,
    )) as { metric: { id: string } };

    await expect(
      dispatchAgentTool(
        "log_metric_entry",
        { metricId: created.metric.id, value: 5, entryDate: "not-a-date" },
        userId,
      ),
    ).rejects.toMatchObject({ code: "validation" });

    await expect(
      dispatchAgentTool("log_metric_entry", { metricId: created.metric.id }, userId),
    ).rejects.toMatchObject({ code: "validation" });
  });
});
