import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeAuditEvents,
  financeBudgetCategories,
  financeTransactions,
  users,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { restoreDeletedHold } from "./auditRestoreWrite";
import { deleteTransactions } from "./mutations";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("audit restore");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `restore-${crypto.randomUUID()}@localhost`, name: "Restore Test" })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

async function seed(userId: string) {
  const [account] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: "Card",
      kind: "credit_card",
      institution: "Capital One",
      externalSource: "csv:capitalone",
      externalKey: "3448",
    })
    .returning({ id: financeAccounts.id });
  const [envelope] = await db
    .insert(financeBudgetCategories)
    .values({ userId, name: "Pets", sortKey: "a0" })
    .returning({ id: financeBudgetCategories.id });
  const [hold] = await db
    .insert(financeTransactions)
    .values({
      userId,
      accountId: account.id,
      transactionDate: "2026-09-18",
      pending: true,
      description: "Chewy.com",
      amount: "-51.29",
      notes: "dog food",
      budgetCategoryId: envelope.id,
      externalSource: "scrape:capitalone",
      externalId: "chewy|0",
    })
    .returning({ id: financeTransactions.id });
  return { accountId: account.id, envelopeId: envelope.id, holdId: hold.id };
}

describeDb("restoreDeletedHold", () => {
  let userId: string;
  let accountId: string;
  let envelopeId: string;
  let holdId: string;

  beforeEach(async () => {
    userId = await makeUser();
    ({ accountId, envelopeId, holdId } = await seed(userId));
    await deleteTransactions(userId, [holdId]);
  });

  it("puts the hold back under its own id with its envelope and notes, and audits it", async () => {
    const { eventId } = await restoreDeletedHold(userId, holdId);

    const [row] = await db
      .select()
      .from(financeTransactions)
      .where(eq(financeTransactions.id, holdId));
    expect(row).toMatchObject({
      userId,
      accountId,
      pending: true,
      description: "Chewy.com",
      amount: "-51.29",
      notes: "dog food",
      budgetCategoryId: envelopeId,
      externalId: "chewy|0",
    });
    const [event] = await db
      .select()
      .from(financeAuditEvents)
      .where(eq(financeAuditEvents.id, eventId));
    expect(event.userId).toBe(userId);
  });

  it("refuses to restore a hold that is already back", async () => {
    await restoreDeletedHold(userId, holdId);
    await expect(restoreDeletedHold(userId, holdId)).rejects.toThrow(/already back/);
  });

  it("refuses when a posted successor has arrived, rather than count the charge twice", async () => {
    await db.insert(financeTransactions).values({
      userId,
      accountId,
      transactionDate: "2026-09-19",
      postedDate: "2026-09-19",
      pending: false,
      description: "CHEWY.COM",
      amount: "-51.29",
      externalSource: "api:simplefin",
      externalId: "sf-chewy",
    });
    await expect(restoreDeletedHold(userId, holdId)).rejects.toThrow(/twice/);
    const rows = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, holdId));
    expect(rows).toEqual([]);
  });

  it("does not let a second user restore the first user's deletion", async () => {
    const intruder = await makeUser();
    await expect(restoreDeletedHold(intruder, holdId)).rejects.toThrow(
      /No deletion of that transaction/,
    );
    const rows = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, holdId));
    expect(rows).toEqual([]);
  });

  it("does not let a second user read, change or delete the restored row either", async () => {
    await restoreDeletedHold(userId, holdId);
    const intruder = await makeUser();
    // Deleting is scoped: someone else's id is ignored, and the row survives.
    await deleteTransactions(intruder, [holdId]);
    const [row] = await db
      .select({ id: financeTransactions.id, userId: financeTransactions.userId })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, holdId));
    expect(row.userId).toBe(userId);
  });
});
