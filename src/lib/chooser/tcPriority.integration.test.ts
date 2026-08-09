import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { nodes, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createNode, setTcPriorities } from "@/lib/tree/mutations";
import { loadOutline } from "@/lib/tree/queries";
import { planTcDrop } from "./tcPriority";

/**
 * Integration tests for Task Chooser priority against the local Postgres
 * (`npm run db:up`). Each test works under its own user, so these never touch seeded
 * development data.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("tc priority");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `tc-${crypto.randomUUID()}@localhost`, name: "Test User" })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

async function makeTask(userId: string, name: string): Promise<string> {
  return createNode({ userId, type: "task", parentId: null, name });
}

/** The user's ranking as "name→A1" strings, ordered by letter then rank. */
async function rankingOf(userId: string): Promise<string[]> {
  const rows = await loadOutline(userId);
  return rows
    .filter((row) => row.tcPriorityLetter !== null)
    .sort(
      (a, b) =>
        a.tcPriorityLetter!.localeCompare(b.tcPriorityLetter!) ||
        (a.tcPriorityRank ?? 0) - (b.tcPriorityRank ?? 0),
    )
    .map((row) => `${row.name}→${row.tcPriorityLetter}${row.tcPriorityRank}`);
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("setTcPriorities", () => {
  it("persists a batch and reads it back through loadOutline", async () => {
    const userId = await makeUser();
    const first = await makeTask(userId, "first");
    const second = await makeTask(userId, "second");

    await setTcPriorities(userId, [
      { nodeId: first, letter: "A", rank: 1 },
      { nodeId: second, letter: "A", rank: 2 },
    ]);

    expect(await rankingOf(userId)).toEqual(["first→A1", "second→A2"]);
  });

  it("applies a whole reorder atomically, leaving no duplicate ranks", async () => {
    const userId = await makeUser();
    const a = await makeTask(userId, "a");
    const b = await makeTask(userId, "b");
    const c = await makeTask(userId, "c");

    await setTcPriorities(userId, [
      { nodeId: a, letter: "A", rank: 1 },
      { nodeId: b, letter: "A", rank: 2 },
      { nodeId: c, letter: "A", rank: 3 },
    ]);

    // Drag c to the top, planned by the pure logic and persisted here.
    const loaded = await loadOutline(userId);
    await setTcPriorities(userId, planTcDrop(loaded, c, a, "before"));

    expect(await rankingOf(userId)).toEqual(["c→A1", "a→A2", "b→A3"]);
  });

  it("clears the rank alongside the letter", async () => {
    const userId = await makeUser();
    const task = await makeTask(userId, "task");

    await setTcPriorities(userId, [{ nodeId: task, letter: "A", rank: 1 }]);
    await setTcPriorities(userId, [{ nodeId: task, letter: null, rank: null }]);

    const [row] = await db.select().from(nodes).where(eq(nodes.id, task));
    expect(row.tcPriorityLetter).toBeNull();
    expect(row.tcPriorityRank).toBeNull();
  });

  it("rejects a letter without a rank instead of storing a bare TC priority", async () => {
    const userId = await makeUser();
    const task = await makeTask(userId, "task");

    await setTcPriorities(userId, [{ nodeId: task, letter: "A", rank: 1 }]);
    await expect(
      setTcPriorities(userId, [{ nodeId: task, letter: "B", rank: null }]),
    ).rejects.toThrow(/positive integer rank/i);

    const [row] = await db.select().from(nodes).where(eq(nodes.id, task));
    expect(row.tcPriorityLetter).toBe("A");
    expect(row.tcPriorityRank).toBe(1);
  });

  it("does nothing on an empty batch", async () => {
    const userId = await makeUser();
    await expect(setTcPriorities(userId, [])).resolves.toBeUndefined();
  });

  it("leaves the Task Chooser priority independent of the outline priority", async () => {
    // The whole reason this is a separate column: ranking in the chooser must not
    // rewrite the sibling ordering the outline shows.
    const userId = await makeUser();
    const task = await makeTask(userId, "task");

    await db
      .update(nodes)
      .set({ priorityLetter: "C", priorityRank: 4 })
      .where(eq(nodes.id, task));
    await setTcPriorities(userId, [{ nodeId: task, letter: "A", rank: 1 }]);

    const [row] = await db.select().from(nodes).where(eq(nodes.id, task));
    expect(row.priorityLetter).toBe("C");
    expect(row.priorityRank).toBe(4);
    expect(row.tcPriorityLetter).toBe("A");
    expect(row.tcPriorityRank).toBe(1);
  });
});

describeDb("cross-user isolation", () => {
  it("will not let a second user read, change, or clear the first user's ranking", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const task = await makeTask(owner, "owned");

    await setTcPriorities(owner, [{ nodeId: task, letter: "A", rank: 1 }]);

    // Read: the intruder's outline does not contain the row at all.
    const intruderOutline = await loadOutline(intruder);
    expect(intruderOutline.map((row) => row.id)).not.toContain(task);

    // Change: naming the id directly writes nothing.
    await setTcPriorities(intruder, [{ nodeId: task, letter: "D", rank: 9 }]);
    let [row] = await db.select().from(nodes).where(eq(nodes.id, task));
    expect(row.tcPriorityLetter).toBe("A");
    expect(row.tcPriorityRank).toBe(1);

    // Clear: neither does blanking it.
    await setTcPriorities(intruder, [{ nodeId: task, letter: null, rank: null }]);
    [row] = await db.select().from(nodes).where(eq(nodes.id, task));
    expect(row.tcPriorityLetter).toBe("A");

    // Delete: scoped deletes find nothing to remove.
    await db.delete(nodes).where(and(eq(nodes.id, task), eq(nodes.userId, intruder)));
    const survivors = await db.select().from(nodes).where(eq(nodes.id, task));
    expect(survivors).toHaveLength(1);

    // And the owner still sees exactly what they set.
    expect(await rankingOf(owner)).toEqual(["owned→A1"]);
  });

  it("applies only the owner's rows when a batch mixes two users", async () => {
    // A plan that names a foreign id must not become a partial write the owner cannot see.
    const owner = await makeUser();
    const other = await makeUser();
    const mine = await makeTask(owner, "mine");
    const theirs = await makeTask(other, "theirs");

    await setTcPriorities(owner, [
      { nodeId: mine, letter: "B", rank: 1 },
      { nodeId: theirs, letter: "B", rank: 2 },
    ]);

    expect(await rankingOf(owner)).toEqual(["mine→B1"]);
    expect(await rankingOf(other)).toEqual([]);
  });
});
