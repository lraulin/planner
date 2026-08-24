import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financeBudgetCategories, financeCategoryGroups, users } from "@/db/schema";
import { createCategoryGroup } from "./budget/mutations";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { importFinanceCsvFiles, type ImportFile } from "./import";
import { loadRecurringBills } from "./dashboardQueries";
import {
  deleteAccount,
  deleteTransaction,
  setSubscriptionStatus,
  updateAccount,
  updateTransaction,
  upsertBillEnvelope,
} from "./mutations";
import { toDateKey } from "@/lib/schedule/geometry";
import { getTransaction, listAccounts, listTransactions } from "./queries";
import { createPayee } from "./payees/mutations";
import { payeesForCommitment } from "./payees/queries";

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

  it("stores an https account URL and refuses anything else", async () => {
    const url = "https://example.com/account";
    await updateAccount(userId, accountId, { url });
    expect((await listAccounts(userId))[0].url).toBe(url);

    await expect(
      updateAccount(userId, accountId, { url: "javascript:alert(1)" }),
    ).rejects.toThrow("That is not an https URL.");
    expect((await listAccounts(userId))[0].url).toBe(url);
  });

  it("closes and reopens an account", async () => {
    await updateAccount(userId, accountId, { closedOn: "2026-08-18" });
    const closed = (await listAccounts(userId))[0];
    expect(closed.closedAt).not.toBeNull();
    expect(closed.closedAt && toDateKey(closed.closedAt)).toBe("2026-08-18");

    await updateAccount(userId, accountId, { closedOn: null });
    expect((await listAccounts(userId))[0].closedAt).toBeNull();
  });

  it("refuses a closed date that is not a calendar day", async () => {
    await expect(
      updateAccount(userId, accountId, { closedOn: "2026-02-30" }),
    ).rejects.toThrow("Closed date must be YYYY-MM-DD.");
    expect((await listAccounts(userId))[0].closedAt).toBeNull();
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
    await expect(
      updateAccount(intruderId, accountId, { closedOn: "2026-08-18" }),
    ).rejects.toThrow("Account not found.");
    expect((await listAccounts(ownerId))[0].name).toBe("Chase •••9910");
    expect((await listAccounts(ownerId))[0].closedAt).toBeNull();
  });

  it("does not let a second user delete another user's account", async () => {
    await expect(deleteAccount(intruderId, accountId)).rejects.toThrow(
      "Account not found.",
    );
    expect(await listAccounts(ownerId)).toHaveLength(1);
    expect(await listTransactions(ownerId)).toHaveLength(2);
  });
});

describeDb("planned withdrawals", () => {
  let userId: string;
  let transactionId: string;

  beforeEach(async () => {
    userId = await makeUser();
    ({ transactionId } = await seed(userId));
  });

  it("declares a withdrawal planned and names it", async () => {
    expect(
      await updateTransaction(userId, transactionId, {
        plannedWithdrawal: true,
        eventLabel: "  Handgun  ",
      }),
    ).toBeUndefined();
    const saved = await getTransaction(userId, transactionId);
    expect(saved?.plannedWithdrawal).toBe(true);
    expect(saved?.eventLabel).toBe("Handgun");
  });

  it("clears the label when the declaration is taken back", async () => {
    await updateTransaction(userId, transactionId, {
      plannedWithdrawal: true,
      eventLabel: "Handgun",
    });
    await updateTransaction(userId, transactionId, {
      plannedWithdrawal: false,
      eventLabel: "",
    });
    const saved = await getTransaction(userId, transactionId);
    expect(saved?.plannedWithdrawal).toBe(false);
    expect(saved?.eventLabel).toBe("");
  });

  it("leaves an existing label alone when none is supplied", async () => {
    await updateTransaction(userId, transactionId, {
      plannedWithdrawal: true,
      eventLabel: "Handgun",
    });
    await updateTransaction(userId, transactionId, { plannedWithdrawal: true });
    expect((await getTransaction(userId, transactionId))?.eventLabel).toBe("Handgun");
  });

  it("leaves the flag alone when the edit does not mention it", async () => {
    await updateTransaction(userId, transactionId, { plannedWithdrawal: true });
    await updateTransaction(userId, transactionId, { notes: "unrelated" });
    expect((await getTransaction(userId, transactionId))?.plannedWithdrawal).toBe(true);
  });
});

describeDb("planned withdrawal isolation", () => {
  let ownerId: string;
  let intruderId: string;
  let transactionId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    ({ transactionId } = await seed(ownerId));
    await updateTransaction(ownerId, transactionId, {
      plannedWithdrawal: true,
      eventLabel: "Handgun",
    });
  });

  it("does not let a second user read the flag", async () => {
    expect(await getTransaction(intruderId, transactionId)).toBeNull();
    expect(await listTransactions(intruderId)).toEqual([]);
  });

  it("does not let a second user change the flag", async () => {
    await expect(
      updateTransaction(intruderId, transactionId, { plannedWithdrawal: false }),
    ).rejects.toThrow("Transaction not found.");
    const saved = await getTransaction(ownerId, transactionId);
    expect(saved?.plannedWithdrawal).toBe(true);
    expect(saved?.eventLabel).toBe("Handgun");
  });

  it("does not let a second user delete the row the flag sits on", async () => {
    await expect(deleteTransaction(intruderId, transactionId)).rejects.toThrow(
      "Transaction not found.",
    );
    expect((await getTransaction(ownerId, transactionId))?.plannedWithdrawal).toBe(
      true,
    );
  });
});

describeDb("declared bill envelopes", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("declares a cadence and reads it back", async () => {
    await upsertBillEnvelope(userId, {
      name: "Geico",
      cadence: { unit: "month", n: 6 },
      expectedCents: 141_260,
    });

    expect(await loadRecurringBills(userId)).toMatchObject([
      {
        name: "Geico",
        payees: [],
        status: "active",
        cancelledOn: null,
        url: "",
        cadenceMonths: 6,
        cadenceDays: null,
        expectedCents: 141_260,
        anchorDate: null,
        scheduled: true,
        dueDay: null,
      },
    ]);
  });

  it("corrects a declaration in place rather than making a second one", async () => {
    // The caller is a review row that knows the merchant and not whether a declaration
    // exists, so declaring twice has to mean correcting — two rows would be two answers.
    await upsertBillEnvelope(userId, {
      name: "Geico",
      cadence: { unit: "month", n: 6 },
    });
    await upsertBillEnvelope(userId, {
      name: "Geico",
      cadence: { unit: "month", n: 12 },
      expectedCents: 282_520,
    });

    const bills = await loadRecurringBills(userId);
    expect(bills).toHaveLength(1);
    expect(bills[0]).toMatchObject({
      cadenceMonths: 12,
      cadenceDays: null,
      expectedCents: 282_520,
    });
  });

  it("keeps the declared amount when only the cadence is corrected", async () => {
    // What the grid sends. A blanket write would clear the amount here, and the bill's
    // figure would silently fall back to the visible window's median.
    await upsertBillEnvelope(userId, {
      name: "Geico",
      cadence: { unit: "month", n: 6 },
      expectedCents: 141_260,
      anchorDate: "2026-03-03",
    });
    await upsertBillEnvelope(userId, {
      name: "Geico",
      cadence: { unit: "month", n: 12 },
    });

    expect((await loadRecurringBills(userId))[0]).toMatchObject({
      name: "Geico",
      cadenceMonths: 12,
      cadenceDays: null,
      expectedCents: 141_260,
      anchorDate: "2026-03-03",
      scheduled: true,
      dueDay: null,
    });
  });

  it("clears the amount when null is passed explicitly", async () => {
    await upsertBillEnvelope(userId, {
      name: "Geico",
      cadence: { unit: "month", n: 6 },
      expectedCents: 141_260,
    });
    await upsertBillEnvelope(userId, {
      name: "Geico",
      cadence: { unit: "month", n: 6 },
      expectedCents: null,
    });

    expect((await loadRecurringBills(userId))[0].expectedCents).toBeNull();
  });

  it("refuses a cadence the column would reject with a database error", async () => {
    await expect(
      upsertBillEnvelope(userId, { name: "Geico", cadence: { unit: "month", n: 0 } }),
    ).rejects.toThrow("A cadence in months must be from 1 to 24.");
    await expect(
      upsertBillEnvelope(userId, { name: "Geico", cadence: { unit: "month", n: 36 } }),
    ).rejects.toThrow("A cadence in months must be from 1 to 24.");
    // The day column has its own CHECK, so it needs its own sentence rather than a
    // constraint violation nobody upstream can read.
    await expect(
      upsertBillEnvelope(userId, { name: "Geico", cadence: { unit: "day", n: 1 } }),
    ).rejects.toThrow("A cadence in days must be from 2 to 200.");
    await expect(
      upsertBillEnvelope(userId, { name: "Geico", cadence: { unit: "day", n: 400 } }),
    ).rejects.toThrow("A cadence in days must be from 2 to 200.");
    await expect(
      upsertBillEnvelope(userId, { name: "  ", cadence: { unit: "month", n: 6 } }),
    ).rejects.toThrow("A bill needs a name.");
    expect(await loadRecurringBills(userId)).toEqual([]);
  });

  it("declares a bill that recurs on no schedule", async () => {
    await upsertBillEnvelope(userId, {
      name: "Taylor Gas",
      cadence: { unit: "month", n: 12 },
      expectedCents: 50_000,
      scheduled: false,
    });

    expect((await loadRecurringBills(userId))[0]).toMatchObject({
      name: "Taylor Gas",
      cadenceMonths: 12,
      cadenceDays: null,
      expectedCents: 50_000,
      scheduled: false,
    });
  });

  it("refuses an unscheduled bill with no stated cost", async () => {
    // It has no cadence to infer an amount from and no forecast to fall back on, so a
    // declaration without a number would contribute nothing to the budget while still
    // suppressing its own charges from the review list — strictly worse than not declaring.
    await expect(
      upsertBillEnvelope(userId, {
        name: "Taylor Gas",
        cadence: { unit: "month", n: 12 },
        scheduled: false,
      }),
    ).rejects.toThrow("needs its cost for the period");
    expect(await loadRecurringBills(userId)).toEqual([]);
  });

  it("keeps the amount and due day when only the cadence is corrected", async () => {
    // The grid sends one field at a time, and a blanket write would silently clear the
    // figure the bill envelope's own funding math runs on.
    await upsertBillEnvelope(userId, {
      name: "RENT:RAULIN",
      cadence: { unit: "month", n: 1 },
      expectedCents: 210_000,
      dueDay: 1,
    });
    await upsertBillEnvelope(userId, {
      name: "RENT:RAULIN",
      cadence: { unit: "month", n: 1 },
    });

    expect((await loadRecurringBills(userId))[0]).toMatchObject({
      dueDay: 1,
      expectedCents: 210_000,
    });
  });

  it("refuses a due day the column would reject with a database error", async () => {
    await expect(
      upsertBillEnvelope(userId, {
        name: "Geico",
        cadence: { unit: "month", n: 6 },
        dueDay: 0,
      }),
    ).rejects.toThrow("A due day must be a whole number from 1 to 31.");
    await expect(
      upsertBillEnvelope(userId, {
        name: "Geico",
        cadence: { unit: "month", n: 6 },
        dueDay: 32,
      }),
    ).rejects.toThrow("A due day must be a whole number from 1 to 31.");
    expect(await loadRecurringBills(userId)).toEqual([]);
  });

  it("creates a bill with no group and does not invent Spending › Bills", async () => {
    await upsertBillEnvelope(userId, {
      name: "Geico",
      cadence: { unit: "month", n: 6 },
    });
    const [bill] = await loadRecurringBills(userId);
    expect(bill).toBeDefined();

    const [row] = await db
      .select({ groupId: financeBudgetCategories.groupId })
      .from(financeBudgetCategories)
      .where(eq(financeBudgetCategories.userId, userId));
    expect(row?.groupId).toBeNull();

    const groups = await db
      .select({ name: financeCategoryGroups.name })
      .from(financeCategoryGroups)
      .where(eq(financeCategoryGroups.userId, userId));
    expect(groups).toEqual([]);

    await upsertBillEnvelope(userId, {
      name: "Geico",
      cadence: { unit: "month", n: 12 },
    });
    expect(await loadRecurringBills(userId)).toHaveLength(1);
  });
});

describeDb("declared bill envelope isolation", () => {
  let ownerId: string;
  let intruderId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    await createCategoryGroup(ownerId, { name: "Household" });
    await createCategoryGroup(intruderId, { name: "Household" });
    await upsertBillEnvelope(ownerId, {
      name: "Geico",
      cadence: { unit: "month", n: 6 },
      expectedCents: 141_260,
      dueDay: 3,
    });
  });

  it("does not let a second user read another user's declared bills", async () => {
    expect(await loadRecurringBills(intruderId)).toEqual([]);
  });

  it("does not let a second user change another user's declared amount", async () => {
    // Rewriting someone else's cost would silently change the number they budget by.
    await upsertBillEnvelope(intruderId, {
      name: "Geico",
      cadence: { unit: "month", n: 6 },
      expectedCents: 1,
      dueDay: 28,
    });

    expect((await loadRecurringBills(ownerId))[0]).toMatchObject({
      expectedCents: 141_260,
      dueDay: 3,
    });
  });

  it("does not let a second user change another user's declaration", async () => {
    // The lookup is scoped to this user, so this must create the intruder's own row and
    // leave the owner's untouched — the failure mode a shared-key upsert would have.
    await upsertBillEnvelope(intruderId, {
      name: "Geico",
      cadence: { unit: "month", n: 1 },
    });

    expect((await loadRecurringBills(ownerId))[0]).toMatchObject({
      cadenceMonths: 6,
      cadenceDays: null,
      expectedCents: 141_260,
    });
    expect((await loadRecurringBills(intruderId))[0]).toMatchObject({
      cadenceMonths: 1,
      cadenceDays: null,
      expectedCents: null,
    });
  });
});

describeDb("stable bill envelope payee claims", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
    await createCategoryGroup(userId, { name: "Household" });
  });

  it("claims selected payees and preserves them when only cadence changes", async () => {
    const payeeId = await createPayee(userId, { name: "Pizza Hut" });
    await upsertBillEnvelope(userId, {
      name: "Pizza night",
      payeeIds: [payeeId],
      cadence: { unit: "month", n: 1 },
    });
    await upsertBillEnvelope(userId, {
      name: "Pizza night",
      cadence: { unit: "month", n: 3 },
    });

    const [bill] = await loadRecurringBills(userId);
    expect(bill).toMatchObject({ cadenceMonths: 3, payeeIds: [payeeId] });
    expect(await payeesForCommitment(userId, { id: bill.id })).toEqual([
      { id: payeeId, name: "Pizza Hut" },
    ]);
  });

  it("rolls back the row edit when a selected payee belongs to another envelope", async () => {
    const primary = await createPayee(userId, { name: "Primary" });
    const held = await createPayee(userId, { name: "Held" });
    await upsertBillEnvelope(userId, {
      name: "Bill",
      payeeIds: [primary],
      cadence: { unit: "month", n: 1 },
    });
    await upsertBillEnvelope(userId, {
      name: "Other bill",
      payeeIds: [held],
      cadence: { unit: "month", n: 1 },
    });

    await expect(
      upsertBillEnvelope(userId, {
        name: "Bill",
        payeeIds: [held],
        cadence: { unit: "month", n: 3 },
      }),
    ).rejects.toThrow("already belongs to");

    expect(
      (await loadRecurringBills(userId)).find((bill) => bill.name === "Bill"),
    ).toMatchObject({
      cadenceMonths: 1,
      payeeIds: [primary],
    });
  });

  it("refuses another user's payee and leaves no partial declaration", async () => {
    const otherId = await makeUser();
    const otherPayee = await createPayee(otherId, { name: "Theirs" });
    await expect(
      upsertBillEnvelope(userId, {
        name: "Mine",
        payeeIds: [otherPayee],
        cadence: { unit: "month", n: 1 },
      }),
    ).rejects.toThrow("That payee does not exist");
    expect(await loadRecurringBills(userId)).toEqual([]);
  });
});

describeDb("subscription status", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
    await createCategoryGroup(userId, { name: "Household" });
    await upsertBillEnvelope(userId, {
      name: "Paramount+",
      cadence: { unit: "month", n: 1 },
      expectedCents: 1299,
    });
  });

  it("cancels a bill and stamps the date", async () => {
    await setSubscriptionStatus(userId, "Paramount+", "cancelled", {
      cancelledOn: "2026-08-16",
    });

    expect((await loadRecurringBills(userId))[0]).toMatchObject({
      status: "cancelled",
      cancelledOn: "2026-08-16",
      expectedCents: 1299,
    });
  });

  it("re-anchors a still-active bill without touching the amount", async () => {
    // The charge never arrived, the user says it is still live, so the walk starts again
    // from today rather than staying overdue forever.
    await setSubscriptionStatus(userId, "Paramount+", "active", {
      reanchorOn: "2026-08-16",
    });

    expect((await loadRecurringBills(userId))[0]).toMatchObject({
      status: "active",
      anchorDate: "2026-08-16",
      expectedCents: 1299,
    });
  });

  it("pauses a bill without cancelling it, and unpausing restores it", async () => {
    await setSubscriptionStatus(userId, "Paramount+", "paused");
    expect((await loadRecurringBills(userId))[0]).toMatchObject({
      status: "paused",
      cancelledOn: null,
      expectedCents: 1299,
    });

    await setSubscriptionStatus(userId, "Paramount+", "active");
    expect((await loadRecurringBills(userId))[0].status).toBe("active");
  });

  it("does not let a second user change another user's status", async () => {
    const intruderId = await makeUser();
    await expect(
      setSubscriptionStatus(intruderId, "Paramount+", "cancelled"),
    ).rejects.toThrow("Bill not found.");
    expect((await loadRecurringBills(userId))[0].status).toBe("active");
  });
});
