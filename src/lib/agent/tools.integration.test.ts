import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createNode } from "@/lib/tree/mutations";
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
});
