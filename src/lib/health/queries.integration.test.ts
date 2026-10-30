import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bankConnections, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { loadHealth } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("health queries");

const createdUserIds: string[] = [];

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("loadHealth", () => {
  it("reports the database up and a just-synced connection as fresh", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `health-${crypto.randomUUID()}@localhost`, name: "Health" })
      .returning({ id: users.id });
    createdUserIds.push(user.id);
    const now = new Date();
    await db.insert(bankConnections).values({
      userId: user.id,
      accessUrl: "https://user:pass@bridge.invalid/simplefin",
      lastSyncedAt: now,
    });

    const report = await loadHealth(now);

    expect(report.database).toBe("ok");
    // Newest across every connection, so another test's later row may win; never older.
    expect(report.bankSync?.stale).toBe(false);
    expect(Date.parse(report.bankSync?.lastSyncedAt ?? "")).toBeGreaterThanOrEqual(
      now.getTime(),
    );
    // Nothing in the body identifies a user or carries the access URL.
    expect(JSON.stringify(report)).not.toContain(user.id);
    expect(JSON.stringify(report)).not.toContain("bridge.invalid");
  });
});
