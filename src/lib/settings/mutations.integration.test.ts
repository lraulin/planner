import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import {
  InvalidSettingError,
  resetAllUserSettings,
  resetUserSetting,
  writeUserSetting,
  writeUserSettings,
} from "./mutations";
import { loadUserSettings } from "./queries";
import { chooserScope, gridScope } from "./scopes";

/**
 * Integration tests against the local Postgres (`npm run db:up`), following the harness in
 * `src/lib/notes/mutations.integration.test.ts`. Each test works under its own user.
 *
 * The cross-user block is the point of this file. Settings rows are addressed by
 * `(user_id, scope)` and every function here takes a `userId` — a dropped `userId` in a
 * `where` clause would let one account read or wipe another's preferences, and is
 * completely invisible when you only ever test with one user.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("settings mutations");

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
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("writing settings", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("round-trips a scope's payload", async () => {
    await writeUserSetting(userId, gridScope("tasks"), { v: 1, view: "completed" });

    expect(await loadUserSettings(userId)).toEqual({
      "grid:tasks": { v: 1, view: "completed" },
    });
  });

  it("updates in place rather than accumulating rows", async () => {
    const scope = gridScope("tasks");
    await writeUserSetting(userId, scope, { v: 1, view: "all" });
    await writeUserSetting(userId, scope, { v: 1, view: "completed" });

    const snapshot = await loadUserSettings(userId);
    expect(Object.keys(snapshot)).toEqual([scope]);
    expect(snapshot[scope]).toEqual({ v: 1, view: "completed" });
  });

  it("keeps scopes independent", async () => {
    await writeUserSetting(userId, gridScope("tasks"), { v: 1, view: "all" });
    await writeUserSetting(userId, gridScope("goals"), { v: 1, view: "completed" });

    const snapshot = await loadUserSettings(userId);
    expect(snapshot[gridScope("tasks")]).toEqual({ v: 1, view: "all" });
    expect(snapshot[gridScope("goals")]).toEqual({ v: 1, view: "completed" });
  });

  it("returns an empty snapshot for a user who has changed nothing", async () => {
    expect(await loadUserSettings(userId)).toEqual({});
  });

  it("applies a batch, upserting and inserting in the same call", async () => {
    await writeUserSetting(userId, gridScope("tasks"), { v: 1, view: "all" });
    await writeUserSettings(userId, [
      { scope: gridScope("tasks"), value: { v: 1, view: "completed" } },
      { scope: chooserScope("tc-priority"), value: { v: 1, hidePlanned: true } },
    ]);

    const snapshot = await loadUserSettings(userId);
    expect(snapshot[gridScope("tasks")]).toEqual({ v: 1, view: "completed" });
    expect(snapshot[chooserScope("tc-priority")]).toEqual({ v: 1, hidePlanned: true });
  });

  it("rejects an unknown scope instead of storing a row nothing will read", async () => {
    await expect(
      writeUserSetting(userId, "wishes:list", { v: 1 }),
    ).rejects.toBeInstanceOf(InvalidSettingError);
    expect(await loadUserSettings(userId)).toEqual({});
  });

  it("rejects a whole batch when one entry is invalid", async () => {
    // Validated up front so a bad scope cannot leave half a batch applied.
    await expect(
      writeUserSettings(userId, [
        { scope: gridScope("tasks"), value: { v: 1 } },
        { scope: "nonsense", value: { v: 1 } },
      ]),
    ).rejects.toBeInstanceOf(InvalidSettingError);

    expect(await loadUserSettings(userId)).toEqual({});
  });

  it("rejects a payload too large to be a real preference", async () => {
    await expect(
      writeUserSetting(userId, gridScope("tasks"), { v: 1, junk: "x".repeat(70_000) }),
    ).rejects.toBeInstanceOf(InvalidSettingError);
  });
});

describeDb("resetting settings", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("forgets one scope and leaves the rest", async () => {
    await writeUserSetting(userId, gridScope("tasks"), { v: 1 });
    await writeUserSetting(userId, gridScope("goals"), { v: 1 });

    await resetUserSetting(userId, gridScope("tasks"));

    expect(Object.keys(await loadUserSettings(userId))).toEqual([gridScope("goals")]);
  });

  it("forgets every scope", async () => {
    await writeUserSetting(userId, gridScope("tasks"), { v: 1 });
    await writeUserSetting(userId, chooserScope("tc-priority"), { v: 1 });

    await resetAllUserSettings(userId);

    expect(await loadUserSettings(userId)).toEqual({});
  });

  it("can clear a row whose scope this build no longer recognises", async () => {
    // Reset is deliberately not scope-validated: a row from an older build must not be
    // stuck in the table forever with no way to remove it.
    const retired = gridScope("tasks");
    await writeUserSetting(userId, retired, { v: 1 });

    await expect(resetUserSetting(userId, retired)).resolves.toBeUndefined();
    expect(await loadUserSettings(userId)).toEqual({});
  });
});

describeDb("cross-user isolation", () => {
  let owner: string;
  let intruder: string;
  const scope = gridScope("tasks");

  beforeEach(async () => {
    owner = await makeUser();
    intruder = await makeUser();
    await writeUserSetting(owner, scope, { v: 1, view: "owner" });
  });

  it("does not let one user read another's settings", async () => {
    expect(await loadUserSettings(intruder)).toEqual({});
  });

  it("does not let one user change another's settings", async () => {
    await writeUserSetting(intruder, scope, { v: 1, view: "intruder" });

    const ownerSnapshot = await loadUserSettings(owner);
    expect(ownerSnapshot[scope]).toEqual({ v: 1, view: "owner" });

    const intruderSnapshot = await loadUserSettings(intruder);
    expect(intruderSnapshot[scope]).toEqual({ v: 1, view: "intruder" });
  });

  it("does not let one user delete another's settings", async () => {
    await resetUserSetting(intruder, scope);
    await resetAllUserSettings(intruder);

    const ownerSnapshot = await loadUserSettings(owner);
    expect(ownerSnapshot[scope]).toEqual({ v: 1, view: "owner" });
  });
});
