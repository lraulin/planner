import { afterAll, describe, expect, it } from "vitest";
import { verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, nodes, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { upsertUser } from "./provision";

/**
 * Integration tests against the local Postgres (`npm run db:up`), following the harness in
 * `src/lib/schedule/mutations.integration.test.ts`.
 *
 * This module writes the identity rows every other table hangs off, so the cases that
 * matter most are the ones about *not* touching an account you did not name: renaming onto
 * an address someone else holds, and provisioning one account leaving every other one —
 * name, password, credential row, data — exactly as it was.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("account provisioning");

const createdUserIds: string[] = [];

/** Unique per run, so a rerun after a crashed cleanup does not collide. */
function freshEmail(label: string): string {
  return `provision-${label}-${crypto.randomUUID()}@example.com`;
}

async function provision(email: string, password: string, name?: string) {
  const result = await upsertUser({ email, password, name });
  createdUserIds.push(result.id);
  return result;
}

async function credentialHash(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ password: accounts.password })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
    .limit(1);
  return row?.password ?? null;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("upsertUser", () => {
  it("creates an account that can actually sign in", async () => {
    const email = freshEmail("create");
    const result = await provision(email, "password123", "Someone");

    expect(result.outcome).toBe("created");

    const [user] = await db.select().from(users).where(eq(users.id, result.id));
    expect(user.email).toBe(email);
    expect(user.name).toBe("Someone");

    // The stored hash has to be one Better Auth accepts, not merely present — writing a
    // row it cannot verify produces an account that exists and cannot be used.
    const hash = await credentialHash(result.id);
    expect(hash).toBeTruthy();
    expect(await verifyPassword({ hash: hash!, password: "password123" })).toBe(true);
  });

  it("stores the address lowercased, because that is how sign-in looks it up", async () => {
    const email = freshEmail("case");
    const result = await provision(email.toUpperCase(), "password123");

    expect(result.email).toBe(email.toLowerCase());
    const [user] = await db.select().from(users).where(eq(users.id, result.id));
    expect(user.email).toBe(email.toLowerCase());
  });

  it("is idempotent, and resets the password on a rerun", async () => {
    const email = freshEmail("idempotent");
    const first = await provision(email, "password123");
    const second = await upsertUser({ email, password: "different456" });

    expect(second.id).toBe(first.id);
    expect(second.outcome).toBe("updated");

    const hash = await credentialHash(first.id);
    expect(await verifyPassword({ hash: hash!, password: "different456" })).toBe(true);
    expect(await verifyPassword({ hash: hash!, password: "password123" })).toBe(false);
  });

  it("rejects a password Better Auth would refuse at sign-in", async () => {
    await expect(
      upsertUser({ email: freshEmail("short"), password: "short" }),
    ).rejects.toThrow(/at least 8/);
  });

  it("rejects an address Better Auth's validator would refuse", async () => {
    // The reason this project's original `dev@localhost` user had to be renamed.
    await expect(
      upsertUser({ email: "someone@localhost", password: "password123" }),
    ).rejects.toThrow(/example\.com/);
  });
});

describeDb("upsertUser with renameFrom", () => {
  it("keeps the same users.id, so the account's data survives", async () => {
    const before = freshEmail("rename-before");
    const after = freshEmail("rename-after");
    const created = await provision(before, "password123");

    await db.insert(nodes).values({
      userId: created.id,
      parentId: null,
      type: "result_area",
      name: "Work",
      sortKey: "a0",
    });

    const renamed = await upsertUser({
      email: after,
      password: "password123",
      renameFrom: before,
    });

    expect(renamed.outcome).toBe("renamed");
    expect(renamed.id).toBe(created.id);

    const rows = await db.select().from(nodes).where(eq(nodes.userId, created.id));
    expect(rows.map((r) => r.name)).toEqual(["Work"]);
  });

  it("converges when the old address is already gone", async () => {
    // A rerun of a completed rename is a no-op, not a failure — otherwise the safe
    // response to "did that command finish?" is to check by hand.
    const email = freshEmail("rename-converge");
    const first = await upsertUser({
      email,
      password: "password123",
      renameFrom: freshEmail("never-existed"),
    });
    createdUserIds.push(first.id);

    const second = await upsertUser({
      email,
      password: "password123",
      renameFrom: freshEmail("never-existed"),
    });

    expect(second.id).toBe(first.id);
  });
});

describeDb("one account cannot reach another", () => {
  it("refuses to rename onto an address another account holds", async () => {
    const mine = freshEmail("victim");
    const theirs = freshEmail("attacker");
    const victim = await provision(mine, "password123", "Victim");
    const attacker = await provision(theirs, "password123", "Attacker");

    await expect(
      upsertUser({ email: mine, password: "password123", renameFrom: theirs }),
    ).rejects.toThrow(/already uses that address/);

    // Neither account moved.
    const [victimRow] = await db.select().from(users).where(eq(users.id, victim.id));
    const [attackerRow] = await db
      .select()
      .from(users)
      .where(eq(users.id, attacker.id));
    expect(victimRow.email).toBe(mine);
    expect(attackerRow.email).toBe(theirs);
  });

  it("leaves every other account untouched when provisioning one", async () => {
    const mine = freshEmail("bystander");
    const bystander = await provision(mine, "password123", "Bystander");
    const bystanderHash = await credentialHash(bystander.id);

    await db.insert(nodes).values({
      userId: bystander.id,
      parentId: null,
      type: "result_area",
      name: "Private",
      sortKey: "a0",
    });

    await provision(freshEmail("newcomer"), "password123", "Newcomer");

    const [row] = await db.select().from(users).where(eq(users.id, bystander.id));
    expect(row).toBeDefined();
    expect(row.email).toBe(mine);
    expect(row.name).toBe("Bystander");
    expect(await credentialHash(bystander.id)).toBe(bystanderHash);

    const rows = await db.select().from(nodes).where(eq(nodes.userId, bystander.id));
    expect(rows.map((r) => r.name)).toEqual(["Private"]);
  });
});
