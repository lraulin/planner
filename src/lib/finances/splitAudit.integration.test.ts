import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financeTransactions, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createBudgetCategory, seedBudget } from "./budget/mutations";
import { loadBudget } from "./budget/queries";
import { listAccounts, listTransactions, transactionTotalCents } from "./queries";
import { splitTransaction, unsplitTransaction } from "./mutations";
import { reconcileAccounts } from "./reconcile";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("split reader audit");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `split-audit-${crypto.randomUUID()}@localhost`,
      name: "Split Audit Test",
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

const MONTH = "2026-05-01";
const TODAY = "2026-05-20";

/**
 * Splitting a row divides an existing charge; it moves no money. Every reader that is not
 * *about* the split therefore has to give the same answer afterwards, and the ones that are
 * have to move by exactly the children's amounts. That is the whole reader audit
 * (`agent-os/specs/2026-08-26-2022-split-transactions/` D2) stated as one test.
 */
describeDb("split reader audit", () => {
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

    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    software = await createBudgetCategory(userId, { name: "Software" });
    fitness = await createBudgetCategory(userId, { name: "Fitness" });

    const [row] = await db
      .insert(financeTransactions)
      .values({
        userId,
        accountId,
        transactionDate: "2026-05-03",
        description: "PP*APPLE.COM/BILL",
        amount: "-34.97",
        derivedFlow: "spend",
        externalSource: "csv:chase-credit",
        externalId: `apple-${crypto.randomUUID()}`,
      })
      .returning({ id: financeTransactions.id });
    appleId = row.id;
  });

  async function snapshot() {
    const [accounts, budget, ledger, total] = await Promise.all([
      listAccounts(userId),
      loadBudget(userId, MONTH),
      listTransactions(userId),
      transactionTotalCents(userId),
    ]);
    const account = accounts.find((row) => row.id === accountId)!;
    const reconciled = reconcileAccounts(
      [],
      ledger.map((row) => ({
        id: row.id,
        accountId: row.accountId,
        accountName: row.accountName,
        transactionDate: row.transactionDate,
        amountCents: row.amountCents,
        description: row.description,
        transferGroupId: row.transferGroupId,
        derivedFlow: row.derivedFlow,
        flowOverride: row.flowOverride,
      })),
    );
    return {
      balanceCents: account.balanceCents,
      transactionCount: account.transactionCount,
      ledgerIds: ledger.map((row) => row.id),
      totalCents: total,
      uncategorizedCount: budget.uncategorizedCount,
      uncategorizedCents: budget.uncategorizedCents,
      readyToAssignCents: budget.months.find((m) => m.month === MONTH)
        ?.readyToAssignCents,
      accountPoolCents: budget.accountPoolCents,
      reconciled,
    };
  }

  function activityFor(
    budget: Awaited<ReturnType<typeof loadBudget>>,
    categoryId: string,
  ): number {
    const month = budget.months.find((row) => row.month === MONTH)!;
    return month.categories[categoryId]?.activityCents ?? 0;
  }

  it("leaves every number that is not about the split exactly where it was", async () => {
    const before = await snapshot();
    expect(before.balanceCents).toBe(-3497);
    expect(before.transactionCount).toBe(1);
    expect(before.uncategorizedCount).toBe(1);

    await splitTransaction(userId, appleId, [
      { amountCents: -1378, budgetCategoryId: software },
      { amountCents: -2119, budgetCategoryId: fitness },
    ]);
    const after = await snapshot();

    // Money sums: unchanged, because the children sum to the parent.
    expect(after.balanceCents).toBe(before.balanceCents);
    expect(after.totalCents).toBe(before.totalCents);
    expect(after.accountPoolCents).toBe(before.accountPoolCents);
    expect(after.readyToAssignCents).toBe(before.readyToAssignCents);
    // Row sets: unchanged, because the bank still moved money once.
    expect(after.transactionCount).toBe(before.transactionCount);
    expect(after.ledgerIds).toEqual(before.ledgerIds);
    expect(after.reconciled).toEqual(before.reconciled);
    // The backlog: the charge left it, and the parent's null envelope did not re-enter it.
    expect(after.uncategorizedCount).toBe(0);
    expect(after.uncategorizedCents).toBe(0);
  });

  it("moves both envelopes by exactly the children's amounts", async () => {
    await splitTransaction(userId, appleId, [
      { amountCents: -1378, budgetCategoryId: software },
      { amountCents: -2119, budgetCategoryId: fitness },
    ]);
    const budget = await loadBudget(userId, MONTH);

    expect(activityFor(budget, software)).toBe(-1378);
    expect(activityFor(budget, fitness)).toBe(-2119);
    // And exactly once each — a parent counted beside its children would double this.
    expect(activityFor(budget, software) + activityFor(budget, fitness)).toBe(-3497);
  });

  it("puts the charge back in the backlog when it is unsplit", async () => {
    await splitTransaction(userId, appleId, [
      { amountCents: -1378, budgetCategoryId: software },
      { amountCents: -2119, budgetCategoryId: fitness },
    ]);
    await unsplitTransaction(userId, appleId);

    const budget = await loadBudget(userId, MONTH);
    expect(budget.uncategorizedCount).toBe(1);
    expect(budget.uncategorizedCents).toBe(-3497);
    expect(activityFor(budget, software)).toBe(0);
    expect(activityFor(budget, fitness)).toBe(0);
    expect(
      (await listAccounts(userId)).find((row) => row.id === accountId),
    ).toMatchObject({
      balanceCents: -3497,
      transactionCount: 1,
    });
  });

  it("refuses to put an envelope on the parent instead of its children", async () => {
    const { setTransactionBudgetCategory } = await import("./budget/mutations");
    await splitTransaction(userId, appleId, [
      { amountCents: -1378, budgetCategoryId: software },
      { amountCents: -2119, budgetCategoryId: fitness },
    ]);

    await expect(
      setTransactionBudgetCategory(userId, appleId, software),
    ).rejects.toThrow(/takes its Categories from its children/);
    await expect(setTransactionBudgetCategory(userId, appleId, null)).rejects.toThrow(
      /takes its Categories from its children|does not exist/,
    );

    const [parent] = await db
      .select({ categoryId: financeTransactions.budgetCategoryId })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, appleId));
    expect(parent.categoryId).toBeNull();
  });
});
