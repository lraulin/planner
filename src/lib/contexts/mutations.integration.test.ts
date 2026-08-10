import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { addMasterContext, deleteMasterContext } from "./mutations";
import { listMasterContexts } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("master context mutations");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `context-${crypto.randomUUID()}@localhost`, name: "Context User" })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

describeDb("master contexts", () => {
  let ownerId: string;
  let otherId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    otherId = await makeUser();
  });

  it("deduplicates case-insensitively while preserving the first spelling", async () => {
    const first = await addMasterContext(ownerId, "  @Home ");
    const second = await addMasterContext(ownerId, "@home");

    expect(second).toBe(first);
    expect(await listMasterContexts(ownerId)).toEqual([{ id: first, name: "@Home" }]);
  });

  it("scopes identical names and deletion to the acting user", async () => {
    const ownerContext = await addMasterContext(ownerId, "@Work");
    const otherContext = await addMasterContext(otherId, "@Work");

    expect(otherContext).not.toBe(ownerContext);
    expect(await listMasterContexts(otherId)).toEqual([
      { id: otherContext, name: "@Work" },
    ]);

    await deleteMasterContext(otherId, ownerContext);
    expect(await listMasterContexts(ownerId)).toEqual([
      { id: ownerContext, name: "@Work" },
    ]);

    await deleteMasterContext(ownerId, ownerContext);
    expect(await listMasterContexts(ownerId)).toEqual([]);
  });
});
