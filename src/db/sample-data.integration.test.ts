import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { nodes, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createNode } from "@/lib/tree/mutations";
import { loadOutline } from "@/lib/tree/queries";
import { seedSampleData } from "./sample-data";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("sample data");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `sample-test-${crypto.randomUUID()}@localhost`,
      name: "Sample Test User",
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

describeDb("sample data", () => {
  let userId: string;
  let otherUserId: string;

  beforeEach(async () => {
    userId = await makeUser();
    otherUserId = await makeUser();
  });

  it("seeds Result Areas without state and preserves another user's outline", async () => {
    await createNode({
      userId: otherUserId,
      parentId: null,
      type: "task",
      name: "Other user's task",
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      await seedSampleData(userId);
    } finally {
      log.mockRestore();
    }

    const seeded = await db
      .select({ type: nodes.type, state: nodes.state })
      .from(nodes)
      .where(eq(nodes.userId, userId));
    const resultAreas = seeded.filter((node) => node.type === "result_area");
    const finiteItems = seeded.filter((node) => node.type !== "result_area");

    expect(resultAreas.length).toBeGreaterThan(0);
    expect(resultAreas.every((node) => node.state === null)).toBe(true);
    expect(finiteItems.length).toBeGreaterThan(0);
    expect(finiteItems.every((node) => node.state === "not_started")).toBe(true);
    expect((await loadOutline(otherUserId)).map((node) => node.name)).toEqual([
      "Other user's task",
    ]);
  });
});
