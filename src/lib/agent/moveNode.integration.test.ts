import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createNode } from "@/lib/tree/mutations";
import { loadOutline } from "@/lib/tree/queries";
import { dispatchAgentTool } from "./tools";

/**
 * `move_node` is the agent's only way to change a node's parent: `update_node` rejects
 * parentId as an unknown field, on purpose, because a move re-keys siblings and renumbers
 * priorities rather than writing one column.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("move_node agent tool");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `move-node-${crypto.randomUUID()}@localhost`, name: "Move Node" })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

type Moved = { node: { id: string; parentId: string | null; path: string } };

async function childNames(userId: string, parentId: string | null): Promise<string[]> {
  return (await loadOutline(userId))
    .filter((node) => node.parentId === parentId)
    .map((node) => node.name);
}

describeDb("move_node", () => {
  let userId: string;
  let otherId: string;
  let area: string;
  let alpha: string;
  let beta: string;
  let task: string;

  beforeEach(async () => {
    userId = await makeUser();
    otherId = await makeUser();
    area = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Work",
    });
    alpha = await createNode({
      userId,
      parentId: area,
      type: "project",
      name: "Alpha",
    });
    beta = await createNode({ userId, parentId: area, type: "project", name: "Beta" });
    task = await createNode({ userId, parentId: alpha, type: "task", name: "Call" });
  });

  it("re-files a task under another project", async () => {
    const moved = (await dispatchAgentTool(
      "move_node",
      { id: task, parentId: beta },
      userId,
    )) as Moved;

    expect(moved.node).toMatchObject({ id: task, parentId: beta });
    expect(moved.node.path).toContain("Beta");
    expect(await childNames(userId, alpha)).toEqual([]);
    expect(await childNames(userId, beta)).toEqual(["Call"]);
  });

  it("places a node first, before, or after a sibling", async () => {
    const gamma = await createNode({
      userId,
      parentId: area,
      type: "project",
      name: "Gamma",
    });

    await dispatchAgentTool(
      "move_node",
      { id: gamma, parentId: area, position: "first" },
      userId,
    );
    expect(await childNames(userId, area)).toEqual(["Gamma", "Alpha", "Beta"]);

    await dispatchAgentTool(
      "move_node",
      { id: gamma, parentId: area, position: "after", siblingId: beta },
      userId,
    );
    expect(await childNames(userId, area)).toEqual(["Alpha", "Beta", "Gamma"]);

    await dispatchAgentTool(
      "move_node",
      { id: gamma, parentId: area, position: "before", siblingId: beta },
      userId,
    );
    expect(await childNames(userId, area)).toEqual(["Alpha", "Gamma", "Beta"]);
  });

  it("moves to the top level with parentId null", async () => {
    const moved = (await dispatchAgentTool(
      "move_node",
      { id: task, parentId: null },
      userId,
    )) as Moved;
    expect(moved.node.parentId).toBeNull();
  });

  it("refuses bad placements as validation errors", async () => {
    // Inside itself.
    await expect(
      dispatchAgentTool("move_node", { id: alpha, parentId: task }, userId),
    ).rejects.toMatchObject({ code: "validation" });
    // A nesting the outline forbids: a result area under a task.
    await expect(
      dispatchAgentTool("move_node", { id: area, parentId: task }, userId),
    ).rejects.toMatchObject({ code: "validation" });
    // before/after without a sibling, and a sibling that lives elsewhere.
    await expect(
      dispatchAgentTool(
        "move_node",
        { id: task, parentId: beta, position: "before" },
        userId,
      ),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      dispatchAgentTool(
        "move_node",
        { id: task, parentId: beta, position: "after", siblingId: alpha },
        userId,
      ),
    ).rejects.toMatchObject({ code: "validation" });
    expect(await childNames(userId, alpha)).toEqual(["Call"]);
  });

  it("keeps update_node from taking a parent", async () => {
    await expect(
      dispatchAgentTool("update_node", { id: task, parentId: beta }, userId),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("will not let another user move the node or move into their tree", async () => {
    await expect(
      dispatchAgentTool("move_node", { id: task, parentId: null }, otherId),
    ).rejects.toMatchObject({ code: "not_found" });

    const theirs = await createNode({
      userId: otherId,
      parentId: null,
      type: "project",
      name: "Theirs",
    });
    await expect(
      dispatchAgentTool("move_node", { id: task, parentId: theirs }, userId),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await childNames(userId, alpha)).toEqual(["Call"]);
  });
});
