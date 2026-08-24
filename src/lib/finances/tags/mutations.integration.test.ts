import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financeTags, financeTransactions, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import {
  createFinanceTag,
  deleteFinanceTag,
  discoverFinanceTags,
  updateFinanceTag,
} from "./mutations";
import { listFinanceTags } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("finance tag mutations");

describeDb("finance tag ownership", () => {
  let owner = "";
  let intruder = "";
  let accountId = "";

  beforeAll(async () => {
    const created = await db
      .insert(users)
      .values([
        { email: `tags-owner-${crypto.randomUUID()}@example.com`, name: "Tag owner" },
        {
          email: `tags-intruder-${crypto.randomUUID()}@example.com`,
          name: "Tag intruder",
        },
      ])
      .returning({ id: users.id });
    owner = created[0].id;
    intruder = created[1].id;
    const [account] = await db
      .insert(financeAccounts)
      .values({
        userId: owner,
        name: "Checking",
        kind: "checking",
        externalSource: "manual",
        externalKey: crypto.randomUUID(),
      })
      .returning({ id: financeAccounts.id });
    accountId = account.id;
  });

  afterAll(async () => {
    if (owner) await db.delete(users).where(eq(users.id, owner));
    if (intruder) await db.delete(users).where(eq(users.id, intruder));
  });

  it("discovers exact tokens and keeps Notes when metadata is deleted", async () => {
    await db.insert(financeTransactions).values({
      userId: owner,
      accountId,
      transactionDate: "2026-08-23",
      description: "DINNER",
      amount: "-42.00",
      notes: "Friends #dining-out #Gift ##literal",
    });

    const rows = await discoverFinanceTags(owner);
    expect(rows.map((row) => row.tag)).toEqual(["Gift", "dining-out"]);
    expect(rows.every((row) => row.transactionCount === 1)).toBe(true);

    const dining = rows.find((row) => row.tag === "dining-out")!;
    await updateFinanceTag(owner, dining.id, {
      color: "#AABBCC",
      description: "Restaurants",
      hidden: true,
    });
    expect(await listFinanceTags(owner)).toContainEqual(
      expect.objectContaining({
        id: dining.id,
        color: "#aabbcc",
        description: "Restaurants",
        hidden: true,
      }),
    );

    await deleteFinanceTag(owner, dining.id);
    const [transaction] = await db
      .select({ notes: financeTransactions.notes })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, owner));
    expect(transaction?.notes).toBe("Friends #dining-out #Gift ##literal");
  });

  it("does not let another user read, change, or delete an owned tag", async () => {
    const owned = await createFinanceTag(owner, { tag: "private" });
    expect(await listFinanceTags(intruder)).toEqual([]);
    await expect(
      updateFinanceTag(intruder, owned.id, { description: "stolen" }),
    ).rejects.toThrow(/does not exist/i);
    await expect(deleteFinanceTag(intruder, owned.id)).rejects.toThrow(
      /does not exist/i,
    );
    const [stillOwned] = await db
      .select({ description: financeTags.description })
      .from(financeTags)
      .where(and(eq(financeTags.userId, owner), eq(financeTags.id, owned.id)));
    expect(stillOwned?.description).toBe("");
  });
});
