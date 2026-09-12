/**
 * The database half of payee category learning.
 *
 * `autoCategory.test.ts` already pins the decisions — 2-of-latest-3, the first-default
 * wait, claimed/fixed/off never learning. What it cannot see is how `learn.ts` builds the
 * list those decisions are handed: which stored rows count as history at all, and in what
 * order. That is a join against accounts and a `categoryAssignableIds` filter, and a
 * mistake in either produces a perfectly plausible wrong default — an off-budget card's
 * categories teaching an on-budget envelope, or "the latest three" reading the oldest
 * three.
 */

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
import { learnFromCategoryEdit, relearnPayeeDefault } from "./learn";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("payee category learning");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `learn-${crypto.randomUUID()}@localhost`,
      name: "Learn Test",
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

async function makeAccount(
  userId: string,
  options: { offBudget?: boolean } = {},
): Promise<string> {
  const [account] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: options.offBudget ? "Brokerage" : "Checking",
      // `finance_accounts_core_on_budget` refuses an off-budget checking, savings, cash or
      // card account, so the off-budget fixture has to be a kind that may sit outside the
      // budget at all.
      kind: options.offBudget ? "investment" : "checking",
      externalSource: "test",
      externalKey: `chk-${crypto.randomUUID()}`,
      offBudget: options.offBudget ?? false,
    })
    .returning({ id: financeAccounts.id });
  return account.id;
}

async function makeEnvelope(userId: string, name: string): Promise<string> {
  const [group] = await db
    .insert(financeCategoryGroups)
    .values({
      userId,
      name: `${name} group ${crypto.randomUUID()}`,
      kind: "spending",
      sortKey: "a0",
    })
    .returning({ id: financeCategoryGroups.id });
  const [row] = await db
    .insert(financeBudgetCategories)
    .values({
      userId,
      groupId: group.id,
      name: `${name} ${crypto.randomUUID()}`,
      sortKey: "a0",
      kind: "spending",
    })
    .returning({ id: financeBudgetCategories.id });
  return row.id;
}

async function makePayee(
  userId: string,
  values: {
    mode?: "learn" | "fixed" | "off";
    defaultId?: string | null;
    claimId?: string | null;
  } = {},
): Promise<string> {
  const [payee] = await db
    .insert(financePayees)
    .values({
      userId,
      name: `Merchant ${crypto.randomUUID()}`,
      autoCategoryMode: values.mode ?? "learn",
      defaultBudgetCategoryId: values.defaultId ?? null,
      claimedBudgetCategoryId: values.claimId ?? null,
    })
    .returning({ id: financePayees.id });
  return payee.id;
}

async function addCharge(
  userId: string,
  accountId: string,
  values: {
    payeeId: string;
    categoryId?: string | null;
    date?: string;
    flowOverride?: "internal_transfer";
  },
): Promise<string> {
  const [row] = await db
    .insert(financeTransactions)
    .values({
      userId,
      accountId,
      transactionDate: values.date ?? "2026-08-05",
      description: "MERCHANT CHARGE",
      amount: "-12.00",
      payeeId: values.payeeId,
      budgetCategoryId: values.categoryId ?? null,
      flowOverride: values.flowOverride ?? null,
    })
    .returning({ id: financeTransactions.id });
  return row.id;
}

async function defaultOf(payeeId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: financePayees.defaultBudgetCategoryId })
    .from(financePayees)
    .where(eq(financePayees.id, payeeId));
  return row?.id ?? null;
}

async function setCategory(txId: string, categoryId: string): Promise<void> {
  await db
    .update(financeTransactions)
    .set({ budgetCategoryId: categoryId })
    .where(eq(financeTransactions.id, txId));
}

describeDb("learnFromCategoryEdit", () => {
  let userId: string;
  let accountId: string;
  let groceries: string;
  let dining: string;

  beforeEach(async () => {
    userId = await makeUser();
    accountId = await makeAccount(userId);
    groceries = await makeEnvelope(userId, "Groceries");
    dining = await makeEnvelope(userId, "Dining");
  });

  it("waits for the payee's last uncategorised charge before learning a first default", async () => {
    const payeeId = await makePayee(userId);
    const older = await addCharge(userId, accountId, {
      payeeId,
      date: "2026-08-01",
    });
    const newer = await addCharge(userId, accountId, {
      payeeId,
      date: "2026-08-02",
    });

    await setCategory(newer, groceries);
    await learnFromCategoryEdit(userId, payeeId, newer);

    // One eligible charge is still uncategorised, so filing this one by hand says nothing
    // about the merchant yet.
    expect(await defaultOf(payeeId)).toBeNull();

    await setCategory(older, groceries);
    await learnFromCategoryEdit(userId, payeeId, older);

    expect(await defaultOf(payeeId)).toBe(groceries);
  });

  it("treats an off-budget charge as neither evidence nor a reason to wait", async () => {
    const offBudget = await makeAccount(userId, { offBudget: true });
    const payeeId = await makePayee(userId);
    const onBudget = await addCharge(userId, accountId, {
      payeeId,
      date: "2026-08-02",
    });
    // Uncategorised, and on an account outside the budget. Counting it would hold the
    // first default back forever, since it can never be given a Category.
    await addCharge(userId, offBudget, { payeeId, date: "2026-08-03" });

    await setCategory(onBudget, groceries);
    await learnFromCategoryEdit(userId, payeeId, onBudget);

    expect(await defaultOf(payeeId)).toBe(groceries);
  });

  it("does not count an internal transfer as history", async () => {
    const payeeId = await makePayee(userId);
    const charge = await addCharge(userId, accountId, {
      payeeId,
      date: "2026-08-02",
    });
    await addCharge(userId, accountId, {
      payeeId,
      date: "2026-08-03",
      flowOverride: "internal_transfer",
    });

    await setCategory(charge, groceries);
    await learnFromCategoryEdit(userId, payeeId, charge);

    expect(await defaultOf(payeeId)).toBe(groceries);
  });

  it("reads the latest three by date, not the earliest three", async () => {
    const payeeId = await makePayee(userId, { defaultId: groceries });
    for (const date of ["2026-08-01", "2026-08-02", "2026-08-03"]) {
      const old = await addCharge(userId, accountId, { payeeId, date });
      await setCategory(old, groceries);
    }
    const first = await addCharge(userId, accountId, {
      payeeId,
      date: "2026-08-10",
    });
    const second = await addCharge(userId, accountId, {
      payeeId,
      date: "2026-08-11",
    });
    await setCategory(first, dining);
    await setCategory(second, dining);

    await learnFromCategoryEdit(userId, payeeId, second);

    // Newest three are dining, dining, groceries — two of three, so the default moves.
    // Ordered the other way the window is three groceries rows and nothing changes, which
    // is why there are five charges here rather than three.
    expect(await defaultOf(payeeId)).toBe(dining);
  });

  it("ignores an edit older than the latest three", async () => {
    const payeeId = await makePayee(userId, { defaultId: groceries });
    const stale = await addCharge(userId, accountId, {
      payeeId,
      date: "2026-08-01",
    });
    for (const date of ["2026-08-10", "2026-08-11", "2026-08-12"]) {
      const recent = await addCharge(userId, accountId, { payeeId, date });
      await setCategory(recent, groceries);
    }

    await setCategory(stale, dining);
    await learnFromCategoryEdit(userId, payeeId, stale);

    expect(await defaultOf(payeeId)).toBe(groceries);
  });

  it("does not let a second user change the first user's learned default", async () => {
    const payeeId = await makePayee(userId, { defaultId: groceries });
    const charge = await addCharge(userId, accountId, {
      payeeId,
      date: "2026-08-10",
    });
    await setCategory(charge, dining);

    const otherId = await makeUser();
    await learnFromCategoryEdit(otherId, payeeId, charge);
    await relearnPayeeDefault(otherId, payeeId);

    expect(await defaultOf(payeeId)).toBe(groceries);
  });
});

describeDb("relearnPayeeDefault", () => {
  let userId: string;
  let accountId: string;
  let groceries: string;
  let dining: string;

  beforeEach(async () => {
    userId = await makeUser();
    accountId = await makeAccount(userId);
    groceries = await makeEnvelope(userId, "Groceries");
    dining = await makeEnvelope(userId, "Dining");
  });

  async function addHistory(payeeId: string): Promise<void> {
    const rows: [string, string][] = [
      ["2026-08-01", groceries],
      ["2026-08-10", dining],
      ["2026-08-11", dining],
    ];
    for (const [date, categoryId] of rows) {
      await addCharge(userId, accountId, { payeeId, categoryId, date });
    }
  }

  it("recomputes the default from the combined history", async () => {
    const payeeId = await makePayee(userId, { defaultId: groceries });
    await addHistory(payeeId);

    await relearnPayeeDefault(userId, payeeId);

    expect(await defaultOf(payeeId)).toBe(dining);
  });

  it("leaves a claimed payee's default alone", async () => {
    // A claim is the stronger fact, and releasing it should hand back the default the
    // payee had — not one a merge quietly rewrote underneath it.
    const payeeId = await makePayee(userId, {
      defaultId: groceries,
      claimId: dining,
    });
    await addHistory(payeeId);

    await relearnPayeeDefault(userId, payeeId);

    expect(await defaultOf(payeeId)).toBe(groceries);
  });

  it("leaves a fixed payee's default alone", async () => {
    const payeeId = await makePayee(userId, {
      mode: "fixed",
      defaultId: groceries,
    });
    await addHistory(payeeId);

    await relearnPayeeDefault(userId, payeeId);

    expect(await defaultOf(payeeId)).toBe(groceries);
  });
});
