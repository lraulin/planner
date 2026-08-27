import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetCategories,
  financeCategoryGroups,
  financeTransactions,
  users,
} from "@/db/schema";
import { createBudgetCategory, createCategoryGroup } from "./budget/mutations";
import {
  loadBillSnapshots,
  loadNextDueKeys,
  type BudgetCategoryRow,
} from "./budget/queries";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { importFinanceCsvFiles, type ImportFile } from "./import";
import { loadRecurringBills } from "./dashboardQueries";
import {
  deleteAccount,
  deleteTransaction,
  deleteTransactions,
  setSubscriptionStatus,
  splitTransaction,
  trackTransactionAsBill,
  unsplitTransaction,
  updateSplitChildren,
  updateAccount,
  updateTransaction,
  upsertBillEnvelope,
} from "./mutations";
import { numericStringToCents } from "./money";
import { toDateKey } from "@/lib/schedule/geometry";
import { getTransaction, listAccounts, listTransactions } from "./queries";
import { createPayee } from "./payees/mutations";
import { getPayee, listAliasRows, payeesForCommitment } from "./payees/queries";
import { payeeForDescription, payeeIndex } from "./payees/resolve";

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

  it("does not let a second user bulk-delete another user's transaction", async () => {
    await deleteTransactions(intruderId, [transactionId]);
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

describeDb("event labels", () => {
  let userId: string;
  let transactionId: string;

  beforeEach(async () => {
    userId = await makeUser();
    ({ transactionId } = await seed(userId));
  });

  it("names a one-off and trims the label", async () => {
    expect(
      await updateTransaction(userId, transactionId, {
        eventLabel: "  Handgun  ",
      }),
    ).toBeUndefined();
    expect((await getTransaction(userId, transactionId))?.eventLabel).toBe("Handgun");
  });

  it("clears the label when it is set blank", async () => {
    await updateTransaction(userId, transactionId, { eventLabel: "Handgun" });
    await updateTransaction(userId, transactionId, { eventLabel: "" });
    expect((await getTransaction(userId, transactionId))?.eventLabel).toBe("");
  });

  it("leaves an existing label alone when the edit does not mention it", async () => {
    await updateTransaction(userId, transactionId, { eventLabel: "Handgun" });
    await updateTransaction(userId, transactionId, { notes: "unrelated" });
    expect((await getTransaction(userId, transactionId))?.eventLabel).toBe("Handgun");
  });
});

describeDb("event label isolation", () => {
  let ownerId: string;
  let intruderId: string;
  let transactionId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    ({ transactionId } = await seed(ownerId));
    await updateTransaction(ownerId, transactionId, { eventLabel: "Handgun" });
  });

  it("does not let a second user read the label", async () => {
    expect(await getTransaction(intruderId, transactionId)).toBeNull();
    expect(await listTransactions(intruderId)).toEqual([]);
  });

  it("does not let a second user change the label", async () => {
    await expect(
      updateTransaction(intruderId, transactionId, { eventLabel: "" }),
    ).rejects.toThrow("Transaction not found.");
    expect((await getTransaction(ownerId, transactionId))?.eventLabel).toBe("Handgun");
  });

  it("does not let a second user delete the row the label sits on", async () => {
    await expect(deleteTransaction(intruderId, transactionId)).rejects.toThrow(
      "Transaction not found.",
    );
    expect((await getTransaction(ownerId, transactionId))?.eventLabel).toBe("Handgun");
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

  it("corrects next charge on an existing bill and can clear it", async () => {
    await upsertBillEnvelope(userId, {
      name: "Geico",
      cadence: { unit: "month", n: 6 },
    });
    await upsertBillEnvelope(userId, {
      name: "Geico",
      cadence: { unit: "month", n: 6 },
      anchorDate: "2026-09-03",
    });
    expect((await loadRecurringBills(userId))[0].anchorDate).toBe("2026-09-03");

    await upsertBillEnvelope(userId, {
      name: "Geico",
      cadence: { unit: "month", n: 6 },
      anchorDate: null,
    });
    expect((await loadRecurringBills(userId))[0].anchorDate).toBeNull();
  });
});

describeDb("bill next charge against posted history", () => {
  let userId: string;
  let accountId: string;

  beforeEach(async () => {
    userId = await makeUser();
    const [account] = await db
      .insert(financeAccounts)
      .values({
        userId,
        name: "Card",
        kind: "credit_card",
        externalSource: "test",
        externalKey: `card-${crypto.randomUUID()}`,
      })
      .returning({ id: financeAccounts.id });
    accountId = account.id;
  });

  it("refuses a next charge on or before the last claimed payee charge", async () => {
    const geico = await createPayee(userId, { name: "GEICO" });
    await db.insert(financeTransactions).values({
      userId,
      accountId,
      transactionDate: "2026-08-04",
      description: "GEICO *AUTO",
      amount: "-594.98",
      payeeId: geico,
    });
    await upsertBillEnvelope(userId, {
      name: "Geico",
      payeeIds: [geico],
      cadence: { unit: "month", n: 6 },
      expectedCents: 59498,
      anchorDate: "2026-09-03",
    });

    await expect(
      upsertBillEnvelope(userId, {
        name: "Geico",
        cadence: { unit: "month", n: 6 },
        anchorDate: "2026-08-04",
      }),
    ).rejects.toThrow("Next charge must be after the last posted charge (2026-08-04).");
    await expect(
      upsertBillEnvelope(userId, {
        name: "Geico",
        cadence: { unit: "month", n: 6 },
        anchorDate: "2026-08-03",
      }),
    ).rejects.toThrow("Next charge must be after the last posted charge (2026-08-04).");

    expect((await loadRecurringBills(userId))[0].anchorDate).toBe("2026-09-03");

    await upsertBillEnvelope(userId, {
      name: "Geico",
      cadence: { unit: "month", n: 6 },
      anchorDate: "2026-08-05",
    });
    expect((await loadRecurringBills(userId))[0].anchorDate).toBe("2026-08-05");
  });

  it("does not treat a recategorised charge as the last posted charge", async () => {
    // Last charge is the payee claim. A later row filed onto the envelope by hand
    // belongs to a different merchant and must not move the due-date floor.
    const geico = await createPayee(userId, { name: "GEICO" });
    const cvs = await createPayee(userId, { name: "CVS" });
    await db.insert(financeTransactions).values({
      userId,
      accountId,
      transactionDate: "2026-08-01",
      description: "GEICO *AUTO",
      amount: "-594.98",
      payeeId: geico,
    });
    await upsertBillEnvelope(userId, {
      name: "Geico",
      payeeIds: [geico],
      cadence: { unit: "month", n: 6 },
      expectedCents: 59498,
    });
    const [bill] = await loadRecurringBills(userId);
    await db.insert(financeTransactions).values({
      userId,
      accountId,
      transactionDate: "2026-08-20",
      description: "CVS/PHARMACY",
      amount: "-12.00",
      payeeId: cvs,
      budgetCategoryId: bill.id,
    });

    await upsertBillEnvelope(userId, {
      name: "Geico",
      cadence: { unit: "month", n: 6 },
      anchorDate: "2026-08-10",
    });
    expect((await loadRecurringBills(userId))[0].anchorDate).toBe("2026-08-10");
  });
});

describeDb("next due keys for the bills grid", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("still dates a paused scheduled bill, which apply snapshots skip", async () => {
    // The grid used to take nextDueKeys from loadBillSnapshots, so a paused bill
    // showed "—" and had nothing to edit.
    await upsertBillEnvelope(userId, {
      name: "Paramount+",
      cadence: { unit: "month", n: 1 },
      expectedCents: 1299,
      anchorDate: "2026-09-01",
      status: "paused",
    });
    const [bill] = await loadRecurringBills(userId);
    const categories: BudgetCategoryRow[] = [
      {
        id: bill.id,
        groupId: null,
        name: bill.name,
        sortKey: "a",
        hidden: false,
        notes: "",
        kind: "bill",
        isIncome: false,
        templates: [],
        bill: {
          status: "paused",
          cancelledOn: null,
          url: "",
          cadenceMonths: 1,
          cadenceDays: null,
          dueDay: null,
          anchorDate: "2026-09-01",
          scheduled: true,
          expectedCents: 1299,
        },
      },
    ];

    expect((await loadNextDueKeys(userId, categories, "2026-08-21")).get(bill.id)).toBe(
      "2026-09-01",
    );
    expect(await loadBillSnapshots(userId, categories, "2026-08-21")).toEqual([]);
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

  it("does not let a second user change another user's next charge", async () => {
    await upsertBillEnvelope(ownerId, {
      name: "Geico",
      cadence: { unit: "month", n: 6 },
      anchorDate: "2026-09-03",
    });
    await upsertBillEnvelope(intruderId, {
      name: "Geico",
      cadence: { unit: "month", n: 6 },
      anchorDate: "2026-12-01",
    });

    expect((await loadRecurringBills(ownerId))[0].anchorDate).toBe("2026-09-03");
    expect((await loadRecurringBills(intruderId))[0].anchorDate).toBe("2026-12-01");
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

  it("files that payee's history as the bill and leaves a different CVS payee alone", async () => {
    const [account] = await db
      .insert(financeAccounts)
      .values({
        userId,
        name: "Card",
        kind: "credit_card",
        externalSource: "test",
        externalKey: `card-${crypto.randomUUID()}`,
      })
      .returning({ id: financeAccounts.id });
    const extraCare = await createPayee(userId, { name: "CVS ExtraCare" });
    const pharmacy = await createPayee(userId, { name: "CVS" });
    const [billCharge, shopCharge] = await db
      .insert(financeTransactions)
      .values([
        {
          userId,
          accountId: account.id,
          transactionDate: "2026-07-05",
          description: "CVSExtraCare 8007467287RI",
          amount: "-5.00",
          payeeId: extraCare,
        },
        {
          userId,
          accountId: account.id,
          transactionDate: "2026-07-06",
          description: "CVS/PHARMACY #01522",
          amount: "-22.84",
          payeeId: pharmacy,
        },
      ])
      .returning({ id: financeTransactions.id });

    await upsertBillEnvelope(userId, {
      name: "CVS ExtraCare",
      payeeIds: [extraCare],
      cadence: { unit: "month", n: 1 },
      expectedCents: 500,
    });

    const bills = await loadRecurringBills(userId);
    const extra = bills.find((bill) => bill.name === "CVS ExtraCare");
    expect(extra?.payeeIds).toEqual([extraCare]);

    const filed = await db
      .select({
        id: financeTransactions.id,
        categoryId: financeTransactions.budgetCategoryId,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, userId));
    expect(filed.find((row) => row.id === billCharge.id)?.categoryId).toBe(extra?.id);
    expect(filed.find((row) => row.id === shopCharge.id)?.categoryId).toBeNull();
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

describeDb("trackTransactionAsBill", () => {
  let userId: string;
  let accountId: string;

  beforeEach(async () => {
    userId = await makeUser();
    const [account] = await db
      .insert(financeAccounts)
      .values({
        userId,
        name: "Card",
        kind: "credit_card",
        externalSource: "test",
        externalKey: `card-${crypto.randomUUID()}`,
      })
      .returning({ id: financeAccounts.id });
    accountId = account.id;
  });

  async function addCharge(
    description: string,
    amount: string,
    date: string,
    payeeId?: string | null,
  ): Promise<string> {
    const [row] = await db
      .insert(financeTransactions)
      .values({
        userId,
        accountId,
        transactionDate: date,
        description,
        amount,
        payeeId: payeeId ?? null,
      })
      .returning({ id: financeTransactions.id });
    return row.id;
  }

  it("mints a payee and files history from a row with none", async () => {
    const recent = await addCharge("GEICO *AUTO", "-594.98", "2026-08-04");
    const history = await addCharge("GEICO *AUTO", "-594.98", "2026-02-04");

    const { payeeId } = await trackTransactionAsBill(userId, recent, {
      name: "Geico",
      cadence: { unit: "month", n: 6 },
      expectedCents: 59498,
    });

    const bills = await loadRecurringBills(userId);
    expect(bills).toMatchObject([
      { name: "Geico", payeeIds: [payeeId], cadenceMonths: 6 },
    ]);
    expect(await getPayee(userId, payeeId)).toMatchObject({
      claim: { id: bills[0].id, name: "Geico" },
    });

    const filed = await db
      .select({
        id: financeTransactions.id,
        categoryId: financeTransactions.budgetCategoryId,
        payeeId: financeTransactions.payeeId,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, userId));
    expect(filed.find((row) => row.id === recent)).toMatchObject({
      categoryId: bills[0].id,
      payeeId,
    });
    expect(filed.find((row) => row.id === history)).toMatchObject({
      categoryId: bills[0].id,
      payeeId,
    });
  });

  it("splits ExtraCare off a shared CVS payee so pharmacy charges stay unclaimed", async () => {
    const cvs = await createPayee(userId, {
      name: "CVS",
      aliases: ["CVS", "CVS/PHARMACY", "CVSEXTRACARE"],
    });
    const extra = await addCharge(
      "CVSExtraCare 8007467287RI",
      "-5.00",
      "2026-07-05",
      cvs,
    );
    const shop = await addCharge("CVS/PHARMACY #01522", "-22.84", "2026-07-06", cvs);

    const { payeeId } = await trackTransactionAsBill(userId, extra, {
      name: "CVS ExtraCare",
      cadence: { unit: "month", n: 1 },
      expectedCents: 500,
    });
    expect(payeeId).not.toBe(cvs);

    const bills = await loadRecurringBills(userId);
    const envelope = bills.find((bill) => bill.name === "CVS ExtraCare");
    expect(envelope?.payeeIds).toEqual([payeeId]);

    const filed = await db
      .select({
        id: financeTransactions.id,
        categoryId: financeTransactions.budgetCategoryId,
        payeeId: financeTransactions.payeeId,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, userId));
    expect(filed.find((row) => row.id === extra)).toMatchObject({
      categoryId: envelope?.id,
      payeeId,
    });
    expect(filed.find((row) => row.id === shop)).toMatchObject({
      categoryId: null,
      payeeId: cvs,
    });
  });

  it("files only this amount of a mixed Apple Store payee, without taking the alias", async () => {
    const apple = await createPayee(userId, {
      name: "Apple",
      aliases: ["APPLE/BILL", "APPLE GREENE WINE AND SPIDUNKIRKMD"],
    });
    const music = await addCharge("PP*APPLE.COM/BILL", "-9.99", "2026-07-01", apple);
    const app = await addCharge("PP*APPLE.COM/BILL", "-14.99", "2026-07-15", apple);
    const wine = await addCharge(
      "APPLE GREENE WINE AND SPIDUNKIRKMD",
      "-32.69",
      "2026-07-20",
      apple,
    );

    const { payeeId } = await trackTransactionAsBill(userId, music, {
      name: "Apple Music",
      cadence: { unit: "month", n: 1 },
      expectedCents: 999,
    });
    expect(payeeId).not.toBe(apple);

    const bills = await loadRecurringBills(userId);
    const envelope = bills.find((bill) => bill.name === "Apple Music");
    expect(envelope?.payeeIds).toEqual([payeeId]);

    const billed = await getPayee(userId, payeeId);
    expect(billed?.aliases).toEqual([]);

    const filed = await db
      .select({
        id: financeTransactions.id,
        categoryId: financeTransactions.budgetCategoryId,
        payeeId: financeTransactions.payeeId,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, userId));
    expect(filed.find((row) => row.id === music)).toMatchObject({
      categoryId: envelope?.id,
      payeeId,
    });
    expect(filed.find((row) => row.id === app)).toMatchObject({
      categoryId: null,
    });
    expect(filed.find((row) => row.id === app)?.payeeId).not.toBe(payeeId);
    expect(filed.find((row) => row.id === wine)).toMatchObject({
      categoryId: null,
      payeeId: apple,
    });

    const index = payeeIndex(await listAliasRows(userId));
    expect(payeeForDescription("PP*APPLE.COM/BILL", index)).not.toBe(payeeId);
  });

  it("keeps a named payee when alternate statement spellings give it multiple aliases", async () => {
    const dedicated = await createPayee(userId, {
      name: "LOTUSEATERS",
      aliases: ["LOTUSEATERS", "LOTUSEATERS SWINDON"],
    });
    const charge = await addCharge(
      "LOTUSEATERS.COM",
      "-15.99",
      "2026-08-01",
      dedicated,
    );

    const { payeeId } = await trackTransactionAsBill(userId, charge, {
      name: "Lotuseaters",
      cadence: { unit: "month", n: 1 },
      expectedCents: 1599,
    });
    expect(payeeId).toBe(dedicated);
    expect(await getPayee(userId, dedicated)).toMatchObject({
      aliases: ["LOTUSEATERS", "LOTUSEATERS SWINDON"],
      claim: { name: "Lotuseaters" },
    });
  });

  it("rolls back on an illegal cadence without minting a payee", async () => {
    const charge = await addCharge("TAYLOR GAS", "-180.00", "2026-08-01");
    await expect(
      trackTransactionAsBill(userId, charge, {
        name: "Taylor Gas",
        cadence: { unit: "month", n: 0 },
      }),
    ).rejects.toThrow(/from 1 to 24/);

    expect(await loadRecurringBills(userId)).toEqual([]);
    const [row] = await db
      .select({ payeeId: financeTransactions.payeeId })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, charge));
    expect(row?.payeeId).toBeNull();
    expect(
      payeeForDescription("TAYLOR GAS", payeeIndex(await listAliasRows(userId))),
    ).toBeNull();
  });

  it("will not let a second user read, change, or delete the owner's bill", async () => {
    const charge = await addCharge("PARAMOUNT+", "-12.99", "2026-08-01");
    const { payeeId } = await trackTransactionAsBill(userId, charge, {
      name: "Paramount+",
      cadence: { unit: "month", n: 1 },
      expectedCents: 1299,
    });
    const [bill] = await loadRecurringBills(userId);
    const intruderId = await makeUser();

    await expect(
      trackTransactionAsBill(intruderId, charge, {
        name: "Stolen",
        cadence: { unit: "month", n: 1 },
        expectedCents: 1299,
      }),
    ).rejects.toThrow(/does not exist/);
    expect(await getPayee(intruderId, payeeId)).toBeNull();
    expect(await loadRecurringBills(intruderId)).toEqual([]);
    expect(await getTransaction(intruderId, charge)).toBeNull();
    await expect(
      upsertBillEnvelope(intruderId, {
        name: "Paramount+",
        cadence: { unit: "month", n: 12 },
      }),
    ).resolves.toBeUndefined();
    expect((await loadRecurringBills(userId))[0]).toMatchObject({
      id: bill.id,
      cadenceMonths: 1,
    });
    await expect(deleteTransaction(intruderId, charge)).rejects.toThrow(/not found/i);
    expect(await getTransaction(userId, charge)).not.toBeNull();
  });
});

describeDb("split transactions", () => {
  let userId: string;
  let accountId: string;
  let appleId: string;
  let software: string;
  let fitness: string;

  beforeEach(async () => {
    userId = await makeUser();
    const [account] = await db
      .insert(financeAccounts)
      .values({
        userId,
        name: "Sapphire",
        kind: "credit_card",
        externalSource: "test",
        externalKey: `card-${crypto.randomUUID()}`,
      })
      .returning({ id: financeAccounts.id });
    accountId = account.id;
    const [row] = await db
      .insert(financeTransactions)
      .values({
        userId,
        accountId,
        transactionDate: "2026-05-03",
        description: "PP*APPLE.COM/BILL",
        amount: "-34.97",
        externalSource: "csv:chase-credit",
        externalId: `apple-${crypto.randomUUID()}`,
      })
      .returning({ id: financeTransactions.id });
    appleId = row.id;
    software = await createBudgetCategory(userId, { name: "Software" });
    fitness = await createBudgetCategory(userId, { name: "Fitness" });
  });

  async function children(parentId: string) {
    return db
      .select({
        id: financeTransactions.id,
        amount: financeTransactions.amount,
        categoryId: financeTransactions.budgetCategoryId,
        notes: financeTransactions.notes,
        description: financeTransactions.description,
        transactionDate: financeTransactions.transactionDate,
        accountId: financeTransactions.accountId,
        externalId: financeTransactions.externalId,
        isParent: financeTransactions.isParent,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.parentId, parentId));
  }

  const apple = [
    { amountCents: -1378, budgetCategoryId: null as string | null, notes: "Copilot" },
    {
      amountCents: -2119,
      budgetCategoryId: null as string | null,
      notes: "Intervals Pro",
    },
  ];

  it("divides the Apple charge between two envelopes", async () => {
    await splitTransaction(userId, appleId, [
      { ...apple[0], budgetCategoryId: software },
      { ...apple[1], budgetCategoryId: fitness },
    ]);

    const rows = await children(appleId);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.amount).sort()).toEqual(["-13.78", "-21.19"]);
    expect(new Set(rows.map((row) => row.categoryId))).toEqual(
      new Set([software, fitness]),
    );
    // A child inherits the bank's half and is not itself a bank row (D4, D9).
    for (const row of rows) {
      expect(row.description).toBe("PP*APPLE.COM/BILL");
      expect(row.transactionDate).toBe("2026-05-03");
      expect(row.accountId).toBe(accountId);
      expect(row.externalId).toBeNull();
      expect(row.isParent).toBe(false);
    }

    const [parent] = await db
      .select({
        isParent: financeTransactions.isParent,
        amount: financeTransactions.amount,
        categoryId: financeTransactions.budgetCategoryId,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, appleId));
    expect(parent).toMatchObject({
      isParent: true,
      amount: "-34.97",
      categoryId: null,
    });
  });

  it("refuses a split that does not add up, naming the shortfall", async () => {
    await expect(
      splitTransaction(userId, appleId, [
        { amountCents: -1300, budgetCategoryId: software },
        { amountCents: -1999, budgetCategoryId: fitness },
      ]),
    ).rejects.toThrow(/short by \$1\.98/);
    expect(await children(appleId)).toEqual([]);

    await expect(
      splitTransaction(userId, appleId, [
        { amountCents: -2000, budgetCategoryId: software },
        { amountCents: -2000, budgetCategoryId: fitness },
      ]),
    ).rejects.toThrow(/over by \$5\.03/);
  });

  it("moves an envelope already on the row onto the first child", async () => {
    await db
      .update(financeTransactions)
      .set({ budgetCategoryId: software })
      .where(eq(financeTransactions.id, appleId));

    await splitTransaction(userId, appleId, [
      { ...apple[0] },
      { ...apple[1], budgetCategoryId: fitness },
    ]);

    const rows = await children(appleId);
    expect(rows.find((row) => row.amount === "-13.78")?.categoryId).toBe(software);
  });

  it("will not split a transfer leg or a child, and will not re-split a parent", async () => {
    await splitTransaction(userId, appleId, [
      { ...apple[0], budgetCategoryId: software },
      { ...apple[1], budgetCategoryId: fitness },
    ]);
    await expect(
      splitTransaction(userId, appleId, [
        { amountCents: -3497, budgetCategoryId: software },
      ]),
    ).rejects.toThrow(/already split/);

    const [child] = await children(appleId);
    await expect(
      splitTransaction(userId, child.id, [
        {
          amountCents: numericStringToCents(child.amount) ?? 0,
          budgetCategoryId: software,
        },
      ]),
    ).rejects.toThrow(/cannot itself be split/);

    const [leg] = await db
      .insert(financeTransactions)
      .values({
        userId,
        accountId,
        transactionDate: "2026-05-04",
        description: "Payment Thank You",
        amount: "-100.00",
        transferGroupId: crypto.randomUUID(),
      })
      .returning({ id: financeTransactions.id });
    await expect(
      splitTransaction(userId, leg.id, [
        { amountCents: -10000, budgetCategoryId: software },
      ]),
    ).rejects.toThrow(/transfer cannot be split/);
  });

  it("rewrites children in place, keeping the ids it was given", async () => {
    await splitTransaction(userId, appleId, [
      { ...apple[0], budgetCategoryId: software },
      { ...apple[1], budgetCategoryId: fitness },
    ]);
    const before = await children(appleId);
    const keep = before.find((row) => row.amount === "-13.78")!;

    await updateSplitChildren(userId, appleId, [
      { id: keep.id, amountCents: -1500, budgetCategoryId: software, notes: "Copilot" },
      { amountCents: -1997, budgetCategoryId: fitness },
    ]);

    const after = await children(appleId);
    expect(after).toHaveLength(2);
    expect(after.find((row) => row.id === keep.id)?.amount).toBe("-15.00");
    // The child that was not named was replaced, not orphaned.
    expect(
      after.some((row) => row.id === before.find((r) => r.id !== keep.id)!.id),
    ).toBe(false);
  });

  it("unsplits when the last child is removed, and directly", async () => {
    await splitTransaction(userId, appleId, [
      { ...apple[0], budgetCategoryId: software },
      { ...apple[1], budgetCategoryId: fitness },
    ]);
    await updateSplitChildren(userId, appleId, []);

    expect(await children(appleId)).toEqual([]);
    const [parent] = await db
      .select({
        isParent: financeTransactions.isParent,
        categoryId: financeTransactions.budgetCategoryId,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, appleId));
    expect(parent).toMatchObject({ isParent: false, categoryId: null });

    await splitTransaction(userId, appleId, [
      { amountCents: -3497, budgetCategoryId: software },
    ]);
    await unsplitTransaction(userId, appleId);
    expect(await children(appleId)).toEqual([]);
  });

  it("takes the children with the parent when the parent is deleted", async () => {
    await splitTransaction(userId, appleId, [
      { ...apple[0], budgetCategoryId: software },
      { ...apple[1], budgetCategoryId: fitness },
    ]);
    await deleteTransaction(userId, appleId);

    expect(await children(appleId)).toEqual([]);
    const remaining = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, userId));
    expect(remaining).toEqual([]);
  });

  it("survives a re-import of the source file without duplicating anything", async () => {
    await splitTransaction(userId, appleId, [
      { ...apple[0], budgetCategoryId: software },
      { ...apple[1], budgetCategoryId: fitness },
    ]);
    await importFinanceCsvFiles({ userId, files: [chaseFile] });
    await importFinanceCsvFiles({ userId, files: [chaseFile] });

    expect(await children(appleId)).toHaveLength(2);
    const apples = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(eq(financeTransactions.description, "PP*APPLE.COM/BILL"));
    expect(apples.filter((row) => row.id === appleId)).toHaveLength(1);
  });

  it("keeps a second user out of every part of a split", async () => {
    const intruderId = await makeUser();
    const theirEnvelope = await createBudgetCategory(intruderId, { name: "Theirs" });

    await expect(
      splitTransaction(intruderId, appleId, [
        { amountCents: -3497, budgetCategoryId: theirEnvelope },
      ]),
    ).rejects.toThrow(/not found/i);

    await splitTransaction(userId, appleId, [
      { ...apple[0], budgetCategoryId: software },
      { ...apple[1], budgetCategoryId: fitness },
    ]);
    const rows = await children(appleId);

    await expect(
      updateSplitChildren(intruderId, appleId, [
        { amountCents: -3497, budgetCategoryId: theirEnvelope },
      ]),
    ).rejects.toThrow(/not found/i);
    await expect(unsplitTransaction(intruderId, appleId)).rejects.toThrow(/not found/i);
    await expect(deleteTransaction(intruderId, appleId)).rejects.toThrow(/not found/i);
    await deleteTransactions(intruderId, [appleId, ...rows.map((row) => row.id)]);
    expect(await children(appleId)).toHaveLength(2);

    // The novel hole this schema opens: the child rows are ours to write, so a userId on the
    // insert proves nothing about the envelope ids the caller chose to put in them.
    await expect(
      updateSplitChildren(userId, appleId, [
        { amountCents: -3497, budgetCategoryId: theirEnvelope },
      ]),
    ).rejects.toThrow(/envelope not found/i);
    expect((await children(appleId)).map((row) => row.categoryId).sort()).toEqual(
      [software, fitness].sort(),
    );
  });
});
