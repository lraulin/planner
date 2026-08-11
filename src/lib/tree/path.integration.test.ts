import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createNode } from "./mutations";
import { formatNodePath, loadNodeChain } from "./path";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("tree path");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${crypto.randomUUID()}@localhost`, name: "Test User" })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

describeDb("loadNodeChain", () => {
  let userId: string;
  let otherId: string;

  beforeEach(async () => {
    userId = await makeUser();
    otherId = await makeUser();
  });

  it("returns root-to-leaf segments for the owner and null for everyone else", async () => {
    const areaId = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Work",
    });
    const projectId = await createNode({
      userId,
      parentId: areaId,
      type: "project",
      name: "Ship",
    });
    const taskId = await createNode({
      userId,
      parentId: projectId,
      type: "task",
      name: "Test",
    });

    const chain = await loadNodeChain(userId, taskId);
    expect(chain).not.toBeNull();
    expect(formatNodePath(chain!)).toBe("Work / Ship / Test");
    expect(chain!.map((s) => s.id)).toEqual([areaId, projectId, taskId]);
    expect(chain![2].parentId).toBe(projectId);

    // Second user: fail to read the chain at every step.
    expect(await loadNodeChain(otherId, taskId)).toBeNull();
    expect(await loadNodeChain(otherId, projectId)).toBeNull();
    expect(await loadNodeChain(otherId, areaId)).toBeNull();
  });

  it("returns null for a missing id", async () => {
    expect(
      await loadNodeChain(userId, "00000000-0000-4000-8000-000000000099"),
    ).toBeNull();
  });
});
