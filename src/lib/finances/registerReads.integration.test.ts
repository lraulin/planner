import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financeTransactions, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { optionsFilter } from "@/lib/grid/customFilter";
import { createBudgetCategory } from "./budget/mutations";
import { loadRegisterFacets, loadRegisterPrepared } from "./queries";
import type { RegisterQueryContext } from "./registerQuery";

const reachable = await databaseReachable();
const describeDb = reachable ? describe : describe.skip;
if (!reachable) warnDatabaseSkipped("register reads");

const created: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `register-reads-${crypto.randomUUID()}@localhost`,
      name: "Register reads test",
    })
    .returning({ id: users.id });
  created.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of created) await db.delete(users).where(eq(users.id, id));
});

async function makeAccount(
  userId: string,
  name: string,
  offBudget = false,
): Promise<string> {
  const [account] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name,
      kind: "checking",
      offBudget,
      externalSource: "test",
      externalKey: crypto.randomUUID(),
    })
    .returning({ id: financeAccounts.id });
  return account.id;
}

async function makeRow(
  userId: string,
  accountId: string,
  values: Partial<typeof financeTransactions.$inferInsert>,
): Promise<string> {
  const [row] = await db
    .insert(financeTransactions)
    .values({
      userId,
      accountId,
      transactionDate: "2026-05-03",
      description: "ROW",
      amount: "-10.00",
      derivedFlow: "spend",
      ...values,
    })
    .returning({ id: financeTransactions.id });
  return row.id;
}

const CTX: RegisterQueryContext = {
  offBudgetAccountIds: new Set(),
  budgetStartMonth: null,
};

describeDb("register facets", () => {
  let ownerId: string;
  let intruderId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    const checking = await makeAccount(ownerId, "Owner Checking");
    const savings = await makeAccount(ownerId, "Owner Savings");
    const groceries = await createBudgetCategory(ownerId, {
      name: "Owner Groceries",
      kind: "spending",
    });
    await makeRow(ownerId, checking, {
      transactionDate: "2025-01-15",
      description: "OLD ROW",
      budgetCategoryId: groceries,
    });
    await makeRow(ownerId, savings, {
      transactionDate: "2026-10-02",
      description: "RECENT ROW",
    });
  });

  it("lists every value the view holds, whatever the query filters or searches", async () => {
    const narrowed = {
      viewId: "all",
      today: "2026-10-13",
      search: "RECENT",
      filters: { date: optionsFilter(["this-month"]) },
    };
    const facets = await loadRegisterFacets(ownerId, narrowed, CTX);

    // The filter keeps one row and the list still offers both accounts and both
    // categories, so ticking a value does not shrink the list it was ticked from.
    expect([...facets.account].sort()).toEqual(["Owner Checking", "Owner Savings"]);
    expect([...facets.category].sort()).toEqual(["Owner Groceries", "Uncategorized"]);

    // And it is the same answer with no filter at all.
    expect(
      await loadRegisterFacets(ownerId, { viewId: "all", filters: {} }, CTX),
    ).toEqual(facets);
  });

  it("reads the values of the rows the view holds, not another view's", async () => {
    const uncategorized = await loadRegisterFacets(
      ownerId,
      { viewId: "uncategorized", filters: {} },
      { ...CTX, budgetStartMonth: "2025-01-01" },
    );
    expect(uncategorized.account).toEqual(["Owner Savings"]);
  });

  it("hands a second user none of the first user's values", async () => {
    const intruder = await loadRegisterFacets(
      intruderId,
      { viewId: "all", filters: {} },
      CTX,
    );
    for (const values of Object.values(intruder)) expect(values).toEqual([]);
    expect(JSON.stringify(intruder)).not.toContain("Owner");

    // The prepared index is no way round it either.
    const prepared = await loadRegisterPrepared(
      intruderId,
      { viewId: "all", filters: {} },
      CTX,
    );
    expect(prepared.index.total).toBe(0);
    expect(prepared.block.rows).toEqual([]);
  });
});
