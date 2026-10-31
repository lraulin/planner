import { expect, it } from "vitest";
import { db } from "@/db";
import { bankConnections } from "@/db/schema";
import { describeWithDatabase } from "@/lib/testing/database";
import { testUsers } from "@/lib/testing/users";
import { loadHealth } from "./queries";

const describeDb = await describeWithDatabase("health queries");

const makeUser = testUsers("health");

describeDb("loadHealth", () => {
  it("reports the database up and a just-synced connection as fresh", async () => {
    const userId = await makeUser("Health");
    const now = new Date();
    await db.insert(bankConnections).values({
      userId,
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
    expect(JSON.stringify(report)).not.toContain(userId);
    expect(JSON.stringify(report)).not.toContain("bridge.invalid");
  });
});
