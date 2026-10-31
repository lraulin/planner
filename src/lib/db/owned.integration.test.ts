import { beforeAll, expect, it } from "vitest";
import { db } from "@/db";
import { masterContexts } from "@/db/schema";
import { describeWithDatabase } from "@/lib/testing/database";
import { testUsers } from "@/lib/testing/users";
import { findOwnedRow, requireOwnedRow } from "./owned";

const describeDb = await describeWithDatabase("owned row lookups");
const makeUser = testUsers("owned-row");

/**
 * Seventy mutations guard an id from a request with `requireOwnedRow`, so what matters is
 * that another user's real id reads exactly like an id that does not exist.
 */
describeDb("findOwnedRow and requireOwnedRow", () => {
  let owner: string;
  let intruder: string;
  let contextId: string;

  beforeAll(async () => {
    owner = await makeUser("Owner");
    intruder = await makeUser("Intruder");
    const [row] = await db
      .insert(masterContexts)
      .values({ userId: owner, name: "@Home", normalizedName: "home" })
      .returning({ id: masterContexts.id });
    contextId = row.id;
  });

  it("returns the owner's full row", async () => {
    const row = await requireOwnedRow(db, masterContexts, contextId, owner, "missing");
    expect(row).toMatchObject({ id: contextId, userId: owner, name: "@Home" });
  });

  it("treats another user's id as missing", async () => {
    expect(await findOwnedRow(db, masterContexts, contextId, intruder)).toBeNull();
    await expect(
      requireOwnedRow(db, masterContexts, contextId, intruder, "Context not found."),
    ).rejects.toThrow("Context not found.");
  });

  it("treats an unknown id as missing", async () => {
    expect(
      await findOwnedRow(db, masterContexts, crypto.randomUUID(), owner),
    ).toBeNull();
  });

  it("reads through a transaction as well as the pool", async () => {
    const name = await db.transaction(async (tx) => {
      const row = await requireOwnedRow(
        tx,
        masterContexts,
        contextId,
        owner,
        "missing",
      );
      return row.name;
    });
    expect(name).toBe("@Home");
  });
});
