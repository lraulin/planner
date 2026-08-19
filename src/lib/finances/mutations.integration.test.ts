import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { importFinanceCsvFiles, type ImportFile } from "./import";
import { loadRecurringBills, loadRecurringSpend } from "./dashboardQueries";
import {
  deleteAccount,
  deleteCommitment,
  deleteRecurringBill,
  deleteRecurringSpend,
  deleteTransaction,
  renameRecurringBill,
  setSubscriptionStatus,
  updateAccount,
  updateTransaction,
  upsertRecurringBill,
  upsertRecurringSpend,
} from "./mutations";
import { toDateKey } from "@/lib/schedule/geometry";
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

describeDb("declared recurring bills", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("declares a cadence and reads it back", async () => {
    await upsertRecurringBill(userId, {
      name: "Geico",
      cadenceMonths: 6,
      expectedCents: 141_260,
    });

    expect(await loadRecurringBills(userId)).toMatchObject([
      {
        name: "Geico",
        // Declared with no matchers, so the name is its own: exactly the single-merchant
        // behaviour every pre-existing declaration had before identity split from matching.
        matchers: ["Geico"],
        status: "active",
        cancelledOn: null,
        cancelUrl: "",
        cadenceMonths: 6,
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
    await upsertRecurringBill(userId, { name: "Geico", cadenceMonths: 6 });
    await upsertRecurringBill(userId, {
      name: "Geico",
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
      name: "Geico",
      cadenceMonths: 6,
      expectedCents: 141_260,
      anchorDate: "2026-03-03",
    });
    await upsertRecurringBill(userId, { name: "Geico", cadenceMonths: 12 });

    expect((await loadRecurringBills(userId))[0]).toMatchObject({
      name: "Geico",
      cadenceMonths: 12,
      expectedCents: 141_260,
      anchorDate: "2026-03-03",
      scheduled: true,
      dueDay: null,
    });
  });

  it("clears the amount when null is passed explicitly", async () => {
    await upsertRecurringBill(userId, {
      name: "Geico",
      cadenceMonths: 6,
      expectedCents: 141_260,
    });
    await upsertRecurringBill(userId, {
      name: "Geico",
      cadenceMonths: 6,
      expectedCents: null,
    });

    expect((await loadRecurringBills(userId))[0].expectedCents).toBeNull();
  });

  it("refuses a cadence the column would reject with a database error", async () => {
    await expect(
      upsertRecurringBill(userId, { name: "Geico", cadenceMonths: 0 }),
    ).rejects.toThrow("A cadence must be a whole number of months");
    await expect(
      upsertRecurringBill(userId, { name: "Geico", cadenceMonths: 36 }),
    ).rejects.toThrow("A cadence must be a whole number of months");
    await expect(
      upsertRecurringBill(userId, { name: "  ", cadenceMonths: 6 }),
    ).rejects.toThrow("A bill needs a name.");
    expect(await loadRecurringBills(userId)).toEqual([]);
  });

  it("declares a bill that recurs on no schedule", async () => {
    await upsertRecurringBill(userId, {
      name: "Taylor Gas",
      cadenceMonths: 12,
      expectedCents: 50_000,
      scheduled: false,
    });

    expect((await loadRecurringBills(userId))[0]).toMatchObject({
      name: "Taylor Gas",
      cadenceMonths: 12,
      expectedCents: 50_000,
      scheduled: false,
    });
  });

  it("refuses an unscheduled bill with no stated cost", async () => {
    // It has no cadence to infer an amount from and no forecast to fall back on, so a
    // declaration without a number would contribute nothing to the baseline while still
    // suppressing its own charges from the review list — strictly worse than not declaring.
    await expect(
      upsertRecurringBill(userId, {
        name: "Taylor Gas",
        cadenceMonths: 12,
        scheduled: false,
      }),
    ).rejects.toThrow("needs its cost for the period");
    expect(await loadRecurringBills(userId)).toEqual([]);
  });

  it("keeps the amount and due day when only the cadence is corrected", async () => {
    // The grid sends one field at a time, and a blanket write would silently stop deducting
    // rent from the headline by clearing the figure the accrual runs on.
    await upsertRecurringBill(userId, {
      name: "RENT:RAULIN",
      cadenceMonths: 1,
      expectedCents: 210_000,
      dueDay: 1,
    });
    await upsertRecurringBill(userId, { name: "RENT:RAULIN", cadenceMonths: 1 });

    expect((await loadRecurringBills(userId))[0]).toMatchObject({
      dueDay: 1,
      expectedCents: 210_000,
    });
  });

  it("refuses a due day the column would reject with a database error", async () => {
    await expect(
      upsertRecurringBill(userId, { name: "Geico", cadenceMonths: 6, dueDay: 0 }),
    ).rejects.toThrow("A due day must be a whole number from 1 to 31.");
    await expect(
      upsertRecurringBill(userId, { name: "Geico", cadenceMonths: 6, dueDay: 32 }),
    ).rejects.toThrow("A due day must be a whole number from 1 to 31.");
    expect(await loadRecurringBills(userId)).toEqual([]);
  });

  it("undeclares a bill", async () => {
    await upsertRecurringBill(userId, { name: "Geico", cadenceMonths: 6 });
    await deleteRecurringBill(userId, "Geico");
    expect(await loadRecurringBills(userId)).toEqual([]);
  });

  it("renames a bill without dropping its matchers", async () => {
    await upsertRecurringBill(userId, {
      name: "1PASSWORDTORONTOON",
      matchers: ["1PASSWORDTORONTOON"],
      cadenceMonths: 12,
      expectedCents: 7188,
      anchorDate: "2027-03-30",
    });
    await renameRecurringBill(userId, "1PASSWORDTORONTOON", "1Password");
    expect((await loadRecurringBills(userId))[0]).toMatchObject({
      name: "1Password",
      matchers: ["1PASSWORDTORONTOON"],
      expectedCents: 7188,
      anchorDate: "2027-03-30",
    });
  });
});

describeDb("declared recurring bill isolation", () => {
  let ownerId: string;
  let intruderId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    await upsertRecurringBill(ownerId, {
      name: "Geico",
      cadenceMonths: 6,
      expectedCents: 141_260,
      dueDay: 3,
    });
  });

  it("does not let a second user read another user's declared bills", async () => {
    expect(await loadRecurringBills(intruderId)).toEqual([]);
  });

  it("does not let a second user change another user's declared amount", async () => {
    // Rewriting someone else's cost would silently change the number they budget by, since
    // every active bill with an amount is held back from their headline.
    await upsertRecurringBill(intruderId, {
      name: "Geico",
      cadenceMonths: 6,
      expectedCents: 1,
      dueDay: 28,
    });

    expect((await loadRecurringBills(ownerId))[0]).toMatchObject({
      expectedCents: 141_260,
      dueDay: 3,
    });
  });

  it("does not let a second user change another user's declaration", async () => {
    // The uniqueness is per user, so this must create the intruder's own row and leave the
    // owner's untouched — the failure mode a shared-key upsert would have.
    await upsertRecurringBill(intruderId, { name: "Geico", cadenceMonths: 1 });

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

describeDb("commitment matchers", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("covers several bank spellings with one declaration", async () => {
    // The Taylor Gas case. Before identity split from matching this needed a code change in
    // classify/rules.ts to collapse two descriptions the bank happens to send.
    await upsertRecurringBill(userId, {
      name: "Taylor Gas",
      matchers: ["TAYLOR GAS COMPANY INC.", "TAYLOR GAS HEATING AIR"],
      cadenceMonths: 12,
      expectedCents: 50_000,
      scheduled: false,
    });

    expect((await loadRecurringBills(userId))[0].matchers).toEqual([
      "TAYLOR GAS COMPANY INC.",
      "TAYLOR GAS HEATING AIR",
    ]);
  });

  it("keeps the matchers when only the cadence is corrected", async () => {
    // Same reasoning as the declared amount: the recurring table sends a cadence and nothing
    // else, and a blanket write would silently unclaim the merchants the bill was built on.
    await upsertRecurringBill(userId, {
      name: "Pizza night",
      matchers: ["PIZZA HUT"],
      cadenceMonths: 1,
    });
    await upsertRecurringBill(userId, { name: "Pizza night", cadenceMonths: 3 });

    expect((await loadRecurringBills(userId))[0]).toMatchObject({
      cadenceMonths: 3,
      matchers: ["PIZZA HUT"],
    });
  });

  it("refuses a merchant another commitment already holds, naming the holder", async () => {
    /*
     * The invariant no SQL constraint can express, because it spans two tables. A merchant
     * claimed twice is counted twice — in the bill's accrual and again in the spend rate —
     * and every figure downstream is wrong while looking entirely reasonable.
     */
    await upsertRecurringSpend(userId, {
      name: "Pizza",
      matchers: ["PIZZA HUT", "DOMINOS"],
    });

    await expect(
      upsertRecurringBill(userId, {
        name: "Pizza Hut Sub",
        matchers: ["PIZZA HUT"],
        cadenceMonths: 1,
      }),
    ).rejects.toThrow('"PIZZA HUT" already belongs to the commitment "Pizza".');

    // And in the other direction, so neither table is the privileged one.
    await upsertRecurringBill(userId, {
      name: "Netflix",
      matchers: ["NETFLIX.COM"],
      cadenceMonths: 1,
    });
    await expect(
      upsertRecurringSpend(userId, { name: "Streaming", matchers: ["NETFLIX.COM"] }),
    ).rejects.toThrow('"NETFLIX.COM" already belongs to the commitment "Netflix".');
  });

  it("lets a commitment keep its own matchers when it is edited", async () => {
    // The self-collision that a naive check would raise on every single update.
    await upsertRecurringSpend(userId, { name: "Pizza", matchers: ["PIZZA HUT"] });
    await upsertRecurringSpend(userId, {
      name: "Pizza",
      matchers: ["PIZZA HUT", "DOMINOS"],
    });

    expect((await loadRecurringSpend(userId))[0].matchers).toEqual([
      "PIZZA HUT",
      "DOMINOS",
    ]);
  });

  it("does not see another user's claims", async () => {
    // Two people can both shop at Walmart. Scoping the check by user is what allows that.
    const otherId = await makeUser();
    await upsertRecurringSpend(otherId, {
      name: "Groceries",
      matchers: ["WM SUPERCENTER"],
    });

    await expect(
      upsertRecurringSpend(userId, { name: "Food", matchers: ["WM SUPERCENTER"] }),
    ).resolves.toBeUndefined();
  });
});

describeDb("recurring spend", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("defaults to an auto rate that is held back", async () => {
    // The opposite defaults from a bill: deducting it is the whole reason the row exists.
    await upsertRecurringSpend(userId, { name: "Pizza", matchers: ["PIZZA HUT"] });

    expect((await loadRecurringSpend(userId))[0]).toMatchObject({
      name: "Pizza",
      period: "week",
      amountSource: "auto",
      expectedCents: null,
      active: true,
    });
  });

  it("pins an amount and keeps it through an unrelated edit", async () => {
    await upsertRecurringSpend(userId, {
      name: "Groceries",
      matchers: ["WM SUPERCENTER"],
      amountSource: "pinned",
      expectedCents: 21_500,
    });
    await upsertRecurringSpend(userId, { name: "Groceries", period: "month" });

    expect((await loadRecurringSpend(userId))[0]).toMatchObject({
      period: "month",
      amountSource: "pinned",
      expectedCents: 21_500,
    });
  });

  it("refuses a pinned amount with no figure behind it", async () => {
    // Same rule as a set-aside bill: this is subtracted from money about to be spent, so
    // "pinned to nothing" would deduct zero while claiming to be deliberate.
    await expect(
      upsertRecurringSpend(userId, { name: "Pizza", amountSource: "pinned" }),
    ).rejects.toThrow("A pinned amount needs a figure above zero.");
    await expect(upsertRecurringSpend(userId, { name: "  " })).rejects.toThrow(
      "A recurring spend needs a name.",
    );

    expect(await loadRecurringSpend(userId)).toEqual([]);
  });
});

describeDb("recurring spend isolation", () => {
  let ownerId: string;
  let intruderId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    await upsertRecurringSpend(ownerId, {
      name: "Pizza",
      matchers: ["PIZZA HUT"],
      amountSource: "pinned",
      expectedCents: 6000,
    });
  });

  it("does not let a second user read another user's entries", async () => {
    expect(await loadRecurringSpend(intruderId)).toEqual([]);
  });

  it("does not let a second user change another user's entry", async () => {
    await upsertRecurringSpend(intruderId, {
      name: "Pizza",
      amountSource: "pinned",
      expectedCents: 99_900,
    });

    expect((await loadRecurringSpend(ownerId))[0].expectedCents).toBe(6000);
    expect((await loadRecurringSpend(intruderId))[0].expectedCents).toBe(99_900);
  });

  it("does not let a second user delete another user's entry", async () => {
    await deleteRecurringSpend(intruderId, "Pizza");
    expect(await loadRecurringSpend(ownerId)).toHaveLength(1);
  });
});

describeDb("subscription status", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
    await upsertRecurringBill(userId, {
      name: "Paramount+",
      cadenceMonths: 1,
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
    // The D8 prompt: the charge never arrived, the user says it is still live, so the walk
    // starts again from today rather than staying overdue forever.
    await setSubscriptionStatus(userId, "Paramount+", "active", {
      reanchorOn: "2026-08-16",
    });

    expect((await loadRecurringBills(userId))[0]).toMatchObject({
      status: "active",
      anchorDate: "2026-08-16",
      expectedCents: 1299,
    });
  });

  it("does not let a second user change another user's status", async () => {
    const intruderId = await makeUser();
    await expect(
      setSubscriptionStatus(intruderId, "Paramount+", "cancelled"),
    ).rejects.toThrow("Bill not found.");
    expect((await loadRecurringBills(userId))[0].status).toBe("active");
  });

  it("deleteCommitment removes the named row of the named kind only", async () => {
    await upsertRecurringSpend(userId, { name: "Paramount+", matchers: ["PPLUS"] });
    await deleteCommitment(userId, { kind: "bill", name: "Paramount+" });
    expect(await loadRecurringBills(userId)).toEqual([]);
    expect(await loadRecurringSpend(userId)).toHaveLength(1);
    await deleteCommitment(userId, { kind: "spend", name: "Paramount+" });
    expect(await loadRecurringSpend(userId)).toEqual([]);
  });
});
