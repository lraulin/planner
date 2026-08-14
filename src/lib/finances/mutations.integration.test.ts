import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { importFinanceCsvFiles, type ImportFile } from "./import";
import { loadRecurringBills } from "./dashboardQueries";
import {
  deleteAccount,
  deleteRecurringBill,
  deleteTransaction,
  updateAccount,
  updateTransaction,
  upsertRecurringBill,
} from "./mutations";
import { getTransaction, listAccounts, listTransactions } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("finance mutations");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `finance-mutations-${crypto.randomUUID()}@localhost`,
      name: "Finance Mutations Test",
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

const chaseFile: ImportFile = {
  name: "Chase9910_Activity_20260812.csv",
  text: [
    "Transaction Date,Post Date,Description,Category,Type,Amount,Memo",
    "08/10/2026,08/11/2026,AMAZON MKTPL*5H1YV8C82,Shopping,Sale,-10.59,",
    "08/06/2026,08/07/2026,Payment Thank You-Mobile,,Payment,481.20,",
    "",
  ].join("\n"),
};

async function seed(userId: string): Promise<{
  accountId: string;
  transactionId: string;
}> {
  await importFinanceCsvFiles({ userId, files: [chaseFile] });
  const [account] = await listAccounts(userId);
  const [transaction] = await listTransactions(userId);
  return { accountId: account.id, transactionId: transaction.id };
}

describeDb("finance mutations", () => {
  let userId: string;
  let accountId: string;
  let transactionId: string;

  beforeEach(async () => {
    userId = await makeUser();
    ({ accountId, transactionId } = await seed(userId));
  });

  it("sets a category and a note without touching the bank's own fields", async () => {
    await updateTransaction(userId, transactionId, {
      category: "Household",
      notes: "nappies",
    });

    const row = await getTransaction(userId, transactionId);
    expect(row).toMatchObject({
      category: "Household",
      notes: "nappies",
      sourceCategory: "Shopping",
      description: "AMAZON MKTPL*5H1YV8C82",
      amountCents: -1059,
    });
  });

  it("writes only the fields supplied", async () => {
    await updateTransaction(userId, transactionId, { category: "Household" });
    await updateTransaction(userId, transactionId, { notes: "nappies" });

    expect(await getTransaction(userId, transactionId)).toMatchObject({
      category: "Household",
      notes: "nappies",
    });
  });

  it("treats a blank category as uncategorised rather than storing an empty string", async () => {
    // Otherwise "" and null both mean uncategorised and every filter has to check for two
    // values forever.
    await updateTransaction(userId, transactionId, { category: "Household" });
    await updateTransaction(userId, transactionId, { category: "   " });
    expect((await getTransaction(userId, transactionId))?.category).toBeNull();

    await updateTransaction(userId, transactionId, { category: "Household" });
    await updateTransaction(userId, transactionId, { category: null });
    expect((await getTransaction(userId, transactionId))?.category).toBeNull();
  });

  it("trims a category so two spellings do not become two categories", async () => {
    await updateTransaction(userId, transactionId, { category: "  Household  " });
    expect((await getTransaction(userId, transactionId))?.category).toBe("Household");
  });

  it("deletes one transaction and leaves the rest", async () => {
    await deleteTransaction(userId, transactionId);
    const rows = await listTransactions(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("Payment Thank You-Mobile");
    expect(await getTransaction(userId, transactionId)).toBeNull();
  });

  it("re-imports a deleted transaction, because the fingerprint lives in the file", async () => {
    // Worth pinning: delete is not a tombstone. It is the fix for a stale pending twin, not
    // a way to permanently hide a transaction from future imports.
    await deleteTransaction(userId, transactionId);
    const result = await importFinanceCsvFiles({ userId, files: [chaseFile] });
    expect(result).toMatchObject({ created: 1, skipped: 1 });
    expect(await listTransactions(userId)).toHaveLength(2);
  });

  it("renames and reclassifies an account", async () => {
    await updateAccount(userId, accountId, {
      name: "Sapphire Reserve",
      kind: "credit_card",
      institution: "Chase Bank",
    });

    expect((await listAccounts(userId))[0]).toMatchObject({
      name: "Sapphire Reserve",
      kind: "credit_card",
      institution: "Chase Bank",
    });
  });

  it("refuses to blank an account's name", async () => {
    await expect(updateAccount(userId, accountId, { name: "  " })).rejects.toThrow(
      "An account needs a name.",
    );
    expect((await listAccounts(userId))[0].name).toBe("Chase •••9910");
  });

  it("takes an account's transactions with it when it is deleted", async () => {
    await deleteAccount(userId, accountId);
    expect(await listAccounts(userId)).toEqual([]);
    expect(await listTransactions(userId)).toEqual([]);
  });
});

describeDb("finance user isolation", () => {
  let ownerId: string;
  let intruderId: string;
  let accountId: string;
  let transactionId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    ({ accountId, transactionId } = await seed(ownerId));
  });

  it("does not let a second user read another user's rows", async () => {
    expect(await listAccounts(intruderId)).toEqual([]);
    expect(await listTransactions(intruderId)).toEqual([]);
    expect(await getTransaction(intruderId, transactionId)).toBeNull();
  });

  it("does not let a second user change another user's transaction", async () => {
    await expect(
      updateTransaction(intruderId, transactionId, { category: "Stolen" }),
    ).rejects.toThrow("Transaction not found.");
    expect((await getTransaction(ownerId, transactionId))?.category).toBeNull();
  });

  it("does not let a second user delete another user's transaction", async () => {
    await expect(deleteTransaction(intruderId, transactionId)).rejects.toThrow(
      "Transaction not found.",
    );
    expect(await getTransaction(ownerId, transactionId)).not.toBeNull();
  });

  it("does not let a second user change another user's account", async () => {
    await expect(
      updateAccount(intruderId, accountId, { name: "Stolen" }),
    ).rejects.toThrow("Account not found.");
    expect((await listAccounts(ownerId))[0].name).toBe("Chase •••9910");
  });

  it("does not let a second user delete another user's account", async () => {
    await expect(deleteAccount(intruderId, accountId)).rejects.toThrow(
      "Account not found.",
    );
    expect(await listAccounts(ownerId)).toHaveLength(1);
    expect(await listTransactions(ownerId)).toHaveLength(2);
  });
});

describeDb("declared recurring bills", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("declares a cadence and reads it back", async () => {
    await upsertRecurringBill(userId, {
      merchant: "Geico",
      cadenceMonths: 6,
      expectedCents: 141_260,
    });

    expect(await loadRecurringBills(userId)).toEqual([
      {
        merchant: "Geico",
        cadenceMonths: 6,
        expectedCents: 141_260,
        anchorDate: null,
      },
    ]);
  });

  it("corrects a declaration in place rather than making a second one", async () => {
    // The caller is a review row that knows the merchant and not whether a declaration
    // exists, so declaring twice has to mean correcting — two rows would be two answers.
    await upsertRecurringBill(userId, { merchant: "Geico", cadenceMonths: 6 });
    await upsertRecurringBill(userId, {
      merchant: "Geico",
      cadenceMonths: 12,
      expectedCents: 282_520,
    });

    const bills = await loadRecurringBills(userId);
    expect(bills).toHaveLength(1);
    expect(bills[0]).toMatchObject({ cadenceMonths: 12, expectedCents: 282_520 });
  });

  it("keeps the declared amount when only the cadence is corrected", async () => {
    // What the recurring table sends. A blanket write would clear the amount here, and the
    // bill's figure would silently fall back to the visible window's median.
    await upsertRecurringBill(userId, {
      merchant: "Geico",
      cadenceMonths: 6,
      expectedCents: 141_260,
      anchorDate: "2026-03-03",
    });
    await upsertRecurringBill(userId, { merchant: "Geico", cadenceMonths: 12 });

    expect((await loadRecurringBills(userId))[0]).toEqual({
      merchant: "Geico",
      cadenceMonths: 12,
      expectedCents: 141_260,
      anchorDate: "2026-03-03",
    });
  });

  it("clears the amount when null is passed explicitly", async () => {
    await upsertRecurringBill(userId, {
      merchant: "Geico",
      cadenceMonths: 6,
      expectedCents: 141_260,
    });
    await upsertRecurringBill(userId, {
      merchant: "Geico",
      cadenceMonths: 6,
      expectedCents: null,
    });

    expect((await loadRecurringBills(userId))[0].expectedCents).toBeNull();
  });

  it("refuses a cadence the column would reject with a database error", async () => {
    await expect(
      upsertRecurringBill(userId, { merchant: "Geico", cadenceMonths: 0 }),
    ).rejects.toThrow("A cadence must be a whole number of months");
    await expect(
      upsertRecurringBill(userId, { merchant: "Geico", cadenceMonths: 36 }),
    ).rejects.toThrow("A cadence must be a whole number of months");
    await expect(
      upsertRecurringBill(userId, { merchant: "  ", cadenceMonths: 6 }),
    ).rejects.toThrow("A bill needs a merchant.");
    expect(await loadRecurringBills(userId)).toEqual([]);
  });

  it("undeclares a bill", async () => {
    await upsertRecurringBill(userId, { merchant: "Geico", cadenceMonths: 6 });
    await deleteRecurringBill(userId, "Geico");
    expect(await loadRecurringBills(userId)).toEqual([]);
  });
});

describeDb("declared recurring bill isolation", () => {
  let ownerId: string;
  let intruderId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    await upsertRecurringBill(ownerId, {
      merchant: "Geico",
      cadenceMonths: 6,
      expectedCents: 141_260,
    });
  });

  it("does not let a second user read another user's declared bills", async () => {
    expect(await loadRecurringBills(intruderId)).toEqual([]);
  });

  it("does not let a second user change another user's declaration", async () => {
    // The uniqueness is per user, so this must create the intruder's own row and leave the
    // owner's untouched — the failure mode a shared-key upsert would have.
    await upsertRecurringBill(intruderId, { merchant: "Geico", cadenceMonths: 1 });

    expect((await loadRecurringBills(ownerId))[0]).toMatchObject({
      cadenceMonths: 6,
      expectedCents: 141_260,
    });
    expect((await loadRecurringBills(intruderId))[0]).toMatchObject({
      cadenceMonths: 1,
      expectedCents: null,
    });
  });

  it("does not let a second user delete another user's declaration", async () => {
    await deleteRecurringBill(intruderId, "Geico");
    expect(await loadRecurringBills(ownerId)).toHaveLength(1);
  });
});
