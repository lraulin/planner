import { beforeEach, describe, expect, it } from "vitest";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { testUsers } from "@/lib/testing/users";
import { addMasterContext, deleteMasterContext } from "./mutations";
import { listMasterContexts } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("master context mutations");

const makeUser = testUsers("context");

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
