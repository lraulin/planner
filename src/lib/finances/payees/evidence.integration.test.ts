import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetCategories,
  financeCategoryGroups,
  financePayees,
  financeTransactions,
  users,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import {
  claimPayeeForCommitment,
  clearPayeeRouting,
  createPayee,
  setPayeeAutoCategory,
} from "./mutations";
import { payeeEvidenceForCategory } from "./queries";
import { fileWaitingChargesForPayee } from "../budget/mutations";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("payee evidence");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `evidence-${crypto.randomUUID()}@localhost`,
      name: "Evidence Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

async function makeAccount(userId: string): Promise<string> {
  const [account] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: "Checking",
      kind: "checking",
      externalSource: "test",
      externalKey: `chk-${crypto.randomUUID()}`,
    })
    .returning({ id: financeAccounts.id });
  return account.id;
}

async function makeEnvelope(userId: string, name: string): Promise<string> {
  const [group] = await db
    .insert(financeCategoryGroups)
    .values({ userId, name: `${name} group ${crypto.randomUUID()}`, sortKey: "a0" })
    .returning({ id: financeCategoryGroups.id });
  const [row] = await db
    .insert(financeBudgetCategories)
    .values({
      userId,
      groupId: group.id,
      name,
      sortKey: "a0",
      kind: "spending",
    })
    .returning({ id: financeBudgetCategories.id });
  return row.id;
}

async function addCharge(
  userId: string,
  accountId: string,
  values: { payeeId: string; categoryId?: string | null; description?: string },
): Promise<string> {
  const [row] = await db
    .insert(financeTransactions)
    .values({
      userId,
      accountId,
      transactionDate: "2026-08-05",
      description: values.description ?? "AMZN MKTP US",
      amount: "-12.00",
      payeeId: values.payeeId,
      budgetCategoryId: values.categoryId ?? null,
    })
    .returning({ id: financeTransactions.id });
  return row.id;
}

async function storedDefault(payeeId: string) {
  const [row] = await db
    .select({
      claim: financePayees.claimedBudgetCategoryId,
      fallback: financePayees.defaultBudgetCategoryId,
    })
    .from(financePayees)
    .where(eq(financePayees.id, payeeId));
  return row;
}

describeDb("payee evidence", () => {
  let userId: string;
  let accountId: string;
  let general: string;

  beforeEach(async () => {
    userId = await makeUser();
    accountId = await makeAccount(userId);
    general = await makeEnvelope(userId, "General Spending");
  });

  it("reports a held first default with the charges that are blocking it", async () => {
    const payeeId = await createPayee(userId, {
      name: "APPLE/BILL",
      aliases: ["APPLE/BILL"],
    });
    await addCharge(userId, accountId, { payeeId, categoryId: general });
    await addCharge(userId, accountId, { payeeId });
    await addCharge(userId, accountId, { payeeId });

    const [row] = await payeeEvidenceForCategory(userId, general);
    expect(row).toMatchObject({
      name: "APPLE/BILL",
      filedCount: 1,
      unfiledCount: 2,
      status: { kind: "held", unfiledCount: 2 },
    });
  });

  it("lists a payee configured for the envelope even before anything is filed", async () => {
    const payeeId = await createPayee(userId, { name: "SMECO", aliases: ["SMECO"] });
    await claimPayeeForCommitment(userId, payeeId, { id: general });

    const [row] = await payeeEvidenceForCategory(userId, general);
    expect(row).toMatchObject({ name: "SMECO", status: { kind: "claimed" } });
  });

  it("flags a payee whose default sends its charges to a different envelope", async () => {
    const dropbox = await makeEnvelope(userId, "Dropbox");
    const payeeId = await createPayee(userId, {
      name: "PAYPAL TO LEE RAULIN INST XFER",
      aliases: ["PAYPAL TO LEE RAULIN INST XFER"],
    });
    await setPayeeAutoCategory(userId, payeeId, {
      mode: "learn",
      defaultBudgetCategoryId: dropbox,
    });
    await addCharge(userId, accountId, { payeeId, categoryId: general });

    const [row] = await payeeEvidenceForCategory(userId, general);
    expect(row.routedTo).toEqual({ id: dropbox, name: "Dropbox" });
    expect(row.status).toEqual({ kind: "applied", source: "learned" });
  });

  it("shows another user nothing about this user's envelope", async () => {
    const payeeId = await createPayee(userId, { name: "AMAZON", aliases: ["AMAZON"] });
    await addCharge(userId, accountId, { payeeId, categoryId: general });

    const intruder = await makeUser();
    expect(await payeeEvidenceForCategory(intruder, general)).toEqual([]);
  });

  describe("clearPayeeRouting", () => {
    it("releases the claim first, then the default", async () => {
      const payeeId = await createPayee(userId, {
        name: "SMECO",
        aliases: ["SMECO"],
      });
      await setPayeeAutoCategory(userId, payeeId, {
        mode: "learn",
        defaultBudgetCategoryId: general,
      });
      await claimPayeeForCommitment(userId, payeeId, { id: general });

      await clearPayeeRouting(userId, payeeId);
      expect(await storedDefault(payeeId)).toEqual({
        claim: null,
        fallback: general,
      });

      await clearPayeeRouting(userId, payeeId);
      expect(await storedDefault(payeeId)).toEqual({ claim: null, fallback: null });
    });

    it("leaves charges already filed where they are", async () => {
      const payeeId = await createPayee(userId, {
        name: "AMAZON",
        aliases: ["AMAZON"],
      });
      await setPayeeAutoCategory(userId, payeeId, {
        mode: "learn",
        defaultBudgetCategoryId: general,
      });
      const chargeId = await addCharge(userId, accountId, {
        payeeId,
        categoryId: general,
      });
      await clearPayeeRouting(userId, payeeId);
      const [row] = await db
        .select({ categoryId: financeTransactions.budgetCategoryId })
        .from(financeTransactions)
        .where(eq(financeTransactions.id, chargeId));
      expect(row.categoryId).toBe(general);
    });

    it("refuses another user's payee, and changes nothing", async () => {
      const payeeId = await createPayee(userId, {
        name: "AMAZON",
        aliases: ["AMAZON"],
      });
      await setPayeeAutoCategory(userId, payeeId, {
        mode: "learn",
        defaultBudgetCategoryId: general,
      });
      const intruder = await makeUser();
      await expect(clearPayeeRouting(intruder, payeeId)).rejects.toThrow(
        /does not exist/,
      );
      expect(await storedDefault(payeeId)).toEqual({
        claim: null,
        fallback: general,
      });
    });
  });

  describe("fileWaitingChargesForPayee", () => {
    it("files only the charges that had no envelope", async () => {
      const other = await makeEnvelope(userId, "Groceries");
      const payeeId = await createPayee(userId, {
        name: "AMAZON MKTPL",
        aliases: ["AMAZON MKTPL"],
      });
      const waiting = await addCharge(userId, accountId, { payeeId });
      const elsewhere = await addCharge(userId, accountId, {
        payeeId,
        categoryId: other,
      });

      expect(await fileWaitingChargesForPayee(userId, payeeId, general)).toEqual({
        filed: 1,
      });

      const rows = await db
        .select({
          id: financeTransactions.id,
          categoryId: financeTransactions.budgetCategoryId,
        })
        .from(financeTransactions)
        .where(eq(financeTransactions.payeeId, payeeId));
      expect(new Map(rows.map((row) => [row.id, row.categoryId]))).toEqual(
        new Map([
          [waiting, general],
          [elsewhere, other],
        ]),
      );
    });

    it("teaches the payee once nothing of its own is left unfiled", async () => {
      const payeeId = await createPayee(userId, {
        name: "AMAZON MKTPL",
        aliases: ["AMAZON MKTPL"],
      });
      await addCharge(userId, accountId, { payeeId });
      await addCharge(userId, accountId, { payeeId });

      await fileWaitingChargesForPayee(userId, payeeId, general);
      expect(await storedDefault(payeeId)).toEqual({
        claim: null,
        fallback: general,
      });

      const [row] = await payeeEvidenceForCategory(userId, general);
      expect(row.status).toEqual({ kind: "applied", source: "learned" });
      expect(row.unfiledCount).toBe(0);
    });

    it("refuses another user's payee", async () => {
      const payeeId = await createPayee(userId, {
        name: "AMAZON",
        aliases: ["AMAZON"],
      });
      const chargeId = await addCharge(userId, accountId, { payeeId });
      const intruder = await makeUser();
      const theirEnvelope = await makeEnvelope(intruder, "Their Spending");

      await expect(
        fileWaitingChargesForPayee(intruder, payeeId, general),
      ).rejects.toThrow(/does not exist/);
      await expect(
        fileWaitingChargesForPayee(intruder, payeeId, theirEnvelope),
      ).rejects.toThrow(/does not exist/);

      const [row] = await db
        .select({ categoryId: financeTransactions.budgetCategoryId })
        .from(financeTransactions)
        .where(eq(financeTransactions.id, chargeId));
      expect(row.categoryId).toBeNull();
    });
  });
});
