import { afterAll, describe, expect, it } from "vitest";
import { verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { changePassword } from "./password";
import { upsertUser } from "./provision";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("change password");

const createdUserIds: string[] = [];
const PASSWORD = "password12345678";

function freshEmail(label: string): string {
  return `password-${label}-${crypto.randomUUID()}@example.com`;
}

async function credentialHash(userId: string): Promise<string> {
  const [row] = await db
    .select({ password: accounts.password })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
    .limit(1);
  if (!row?.password) throw new Error("missing credential hash");
  return row.password;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("changePassword", () => {
  it("rotates the credential so the old password no longer verifies", async () => {
    const user = await upsertUser({ email: freshEmail("self"), password: PASSWORD });
    createdUserIds.push(user.id);

    await changePassword(user.id, PASSWORD, "brandnewpassword1");

    const hash = await credentialHash(user.id);
    expect(await verifyPassword({ hash, password: "brandnewpassword1" })).toBe(true);
    expect(await verifyPassword({ hash, password: PASSWORD })).toBe(false);
  });

  it("rejects the wrong current password and leaves the hash alone", async () => {
    const user = await upsertUser({ email: freshEmail("wrong"), password: PASSWORD });
    createdUserIds.push(user.id);
    const before = await credentialHash(user.id);

    await expect(
      changePassword(user.id, "not-the-current-pw", "brandnewpassword1"),
    ).rejects.toThrow(/incorrect/);
    expect(await credentialHash(user.id)).toBe(before);
  });

  it("does not change another user's password", async () => {
    const owner = await upsertUser({ email: freshEmail("owner"), password: PASSWORD });
    const other = await upsertUser({ email: freshEmail("other"), password: PASSWORD });
    createdUserIds.push(owner.id, other.id);
    const otherBefore = await credentialHash(other.id);

    await changePassword(owner.id, PASSWORD, "brandnewpassword1");

    expect(await credentialHash(other.id)).toBe(otherBefore);
    expect(await verifyPassword({ hash: otherBefore, password: PASSWORD })).toBe(true);
  });
});
