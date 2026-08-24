import { afterAll, describe, expect, it } from "vitest";
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
import { setTransactionBudgetCategory } from "./budget/mutations";
import { listRules } from "./rules/queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("finance category learning");

describeDb("category learning", () => {
  let userId = "";

  afterAll(async () => {
    if (userId) await db.delete(users).where(eq(users.id, userId));
  });

  it("creates an exact-payee Category rule after 3 of the latest 5 choices", async () => {
    const [user] = await db
      .insert(users)
      .values({
        name: "Category Learning Test",
        email: `category-learning-${crypto.randomUUID()}@example.com`,
      })
      .returning({ id: users.id });
    userId = user.id;
    const [account] = await db
      .insert(financeAccounts)
      .values({
        userId,
        name: "Checking",
        kind: "checking",
        externalSource: "test",
        externalKey: crypto.randomUUID(),
      })
      .returning({ id: financeAccounts.id });
    const [payee] = await db
      .insert(financePayees)
      .values({ userId, name: "Corner Cafe" })
      .returning({ id: financePayees.id });
    const [group] = await db
      .insert(financeCategoryGroups)
      .values({ userId, name: "Everyday", sortKey: "a0" })
      .returning({ id: financeCategoryGroups.id });
    const [category] = await db
      .insert(financeBudgetCategories)
      .values({ userId, groupId: group.id, name: "Dining", sortKey: "a0" })
      .returning({ id: financeBudgetCategories.id });
    const transactions = await db
      .insert(financeTransactions)
      .values(
        Array.from({ length: 5 }, (_, index) => ({
          userId,
          accountId: account.id,
          payeeId: payee.id,
          transactionDate: `2026-08-${String(20 - index).padStart(2, "0")}`,
          description: "CORNER CAFE",
          amount: "-10.00",
          externalSource: "test",
          externalId: crypto.randomUUID(),
        })),
      )
      .returning({ id: financeTransactions.id });

    await setTransactionBudgetCategory(userId, transactions[0].id, category.id);
    await setTransactionBudgetCategory(userId, transactions[1].id, category.id);
    const notice = await setTransactionBudgetCategory(
      userId,
      transactions[2].id,
      category.id,
    );

    expect(notice).toContain("Future Corner Cafe transactions");
    const learned = (await listRules(userId)).find((rule) =>
      Array.isArray(rule.conditions)
        ? rule.conditions.some(
            (condition) =>
              (condition as { field?: string; value?: string }).field === "payee" &&
              (condition as { value?: string }).value === payee.id,
          )
        : false,
    );
    expect(learned?.actions).toEqual([
      { op: "set", field: "category", value: category.id },
    ]);
  });
});
