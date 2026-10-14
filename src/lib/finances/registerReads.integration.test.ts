import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financeTransactions, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { optionsFilter } from "@/lib/grid/customFilter";
import { createBudgetCategory } from "./budget/mutations";
import {
  listTransactions,
  loadRegisterFacets,
  loadRegisterInitial,
  loadRegisterPrepared,
} from "./queries";
import {
  parseRegisterQuery,
  prepareRegister,
  type RegisterQueryContext,
} from "./registerQuery";
import { collapsedYearGroupIds } from "./grouping";
import { THIS_MONTH_DATE_FILTER } from "./registerFields";

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
      kind: offBudget ? "loan" : "checking",
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

describeDb("the Register's windowed read", () => {
  let ownerId: string;
  let intruderId: string;
  let offBudgetId: string;
  const TODAY = "2026-10-13";

  async function seedLedger() {
    const checking = await makeAccount(ownerId, "Checking");
    const card = await makeAccount(ownerId, "Card");
    offBudgetId = await makeAccount(ownerId, "Mortgage", true);
    // A transfer whose legs fall either side of the This Month window.
    await makeRow(ownerId, checking, {
      transactionDate: "2026-10-02",
      description: "PAYMENT TO CARD",
      derivedFlow: "internal_transfer",
      transferGroupId: crypto.randomUUID().slice(0, 36),
    });
    const group = crypto.randomUUID();
    await makeRow(ownerId, checking, {
      transactionDate: "2026-10-01",
      description: "CARD PAYMENT OUT",
      derivedFlow: "internal_transfer",
      transferGroupId: group,
    });
    await makeRow(ownerId, card, {
      transactionDate: "2026-09-30",
      description: "CARD PAYMENT IN",
      amount: "10.00",
      derivedFlow: "internal_transfer",
      transferGroupId: group,
    });
    // A pair the classifier grouped but flowed as ordinary spend: only the group id says it
    // is a transfer, so only the group rule refuses both legs.
    const spendPair = crypto.randomUUID();
    await makeRow(ownerId, checking, {
      transactionDate: "2026-10-03",
      description: "GROUPED OUT",
      derivedFlow: "spend",
      transferGroupId: spendPair,
    });
    await makeRow(ownerId, card, {
      transactionDate: "2026-08-14",
      description: "GROUPED IN",
      amount: "10.00",
      derivedFlow: "spend",
      transferGroupId: spendPair,
    });
    // Off budget, in and out of the window.
    await makeRow(ownerId, offBudgetId, { transactionDate: "2026-10-05" });
    await makeRow(ownerId, offBudgetId, { transactionDate: "2024-02-05" });
    // An internal transfer by override alone, with no partner.
    await makeRow(ownerId, checking, {
      transactionDate: "2026-10-06",
      derivedFlow: "spend",
      flowOverride: "internal_transfer",
    });
    // Ordinary rows on both sides, and on the window's edges.
    for (const date of [
      "2026-10-13",
      "2026-10-01",
      "2026-09-30",
      "2025-12-31",
      "2020-02-01",
    ]) {
      await makeRow(ownerId, checking, {
        transactionDate: date,
        description: `ROW ${date}`,
      });
    }
  }

  function context(): RegisterQueryContext {
    return {
      offBudgetAccountIds: new Set([offBudgetId]),
      budgetStartMonth: "2026-01-01",
    };
  }

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    await seedLedger();
  });

  const base = {
    today: TODAY,
    sorts: [{ columnId: "date", direction: "desc" }],
    groupBy: ["year", "month"],
  };

  it("answers every bounded Date query as a whole-ledger read would", async () => {
    const ctx = context();
    const ledger = await listTransactions(ownerId);
    const custom = {
      mode: "custom",
      join: "and",
      conditions: [
        { op: "gte", value: "2025-12-31" },
        { op: "lte", value: "2026-09-30" },
      ],
    };
    const queries = [
      { ...base, filters: { date: THIS_MONTH_DATE_FILTER } },
      { ...base, filters: { date: { mode: "options", ids: ["last-month"] } } },
      { ...base, filters: { date: { mode: "options", ids: ["last-30-days"] } } },
      { ...base, filters: { date: { mode: "options", ids: ["this-year"] } } },
      { ...base, filters: { date: custom } },
      { ...base, search: "ROW", filters: { date: THIS_MONTH_DATE_FILTER } },
      {
        ...base,
        sorts: [{ columnId: "amount", direction: "asc" }],
        filters: { date: THIS_MONTH_DATE_FILTER },
      },
    ];
    for (const raw of queries) {
      const expected = prepareRegister(ledger, parseRegisterQuery(raw), ctx);
      const actual = await loadRegisterPrepared(ownerId, raw, ctx);
      expect(actual).toEqual(expected);
    }

    // Not vacuous: the window excludes rows, and the leg across its edge is refused a Category.
    const month = await loadRegisterPrepared(ownerId, queries[0], ctx);
    expect(month.index.shown).toBeLessThan(month.index.total);
    expect(month.index.total).toBe(ledger.length);
    expect(month.index.notBudgetedIds.length).toBeGreaterThanOrEqual(7);
  });

  it("reads the whole ledger for Date = All and for the derived views, with the same answer", async () => {
    const ctx = context();
    const ledger = await listTransactions(ownerId);
    for (const raw of [
      { ...base, filters: {} },
      { ...base, viewId: "uncategorized", filters: { date: THIS_MONTH_DATE_FILTER } },
      { ...base, filters: { date: THIS_MONTH_DATE_FILTER }, today: null },
    ]) {
      expect(await loadRegisterPrepared(ownerId, raw, ctx)).toEqual(
        prepareRegister(ledger, parseRegisterQuery(raw), ctx),
      );
    }
  });

  it("paints the first load from the window, with the same index and the ledger's prior years", async () => {
    const ctx = context();
    const ledger = await listTransactions(ownerId);
    const years = collapsedYearGroupIds(
      ledger.map((row) => row.transactionDate),
      TODAY.slice(0, 4),
    );
    const expected = prepareRegister(
      ledger,
      parseRegisterQuery({
        ...base,
        collapsedGroups: years,
        filters: { date: THIS_MONTH_DATE_FILTER },
      }),
      ctx,
    );

    const initial = await loadRegisterInitial(
      ownerId,
      TODAY,
      Promise.resolve(ctx.budgetStartMonth),
    );
    expect(initial.defaultCollapsedGroups).toEqual(years);
    expect(years.length).toBeGreaterThan(1);
    expect(initial.prepared).toEqual(expected);
  });

  it("hands a second user an empty window and none of the first user's flags", async () => {
    const ctx = context();
    const prepared = await loadRegisterPrepared(
      intruderId,
      { ...base, filters: { date: THIS_MONTH_DATE_FILTER } },
      // The intruder naming the owner's off-budget account id changes nothing: the subset
      // read is scoped by user on its own rows.
      ctx,
    );
    expect(prepared.index.total).toBe(0);
    expect(prepared.index.notBudgetedIds).toEqual([]);
    expect(prepared.block.rows).toEqual([]);

    const initial = await loadRegisterInitial(intruderId, TODAY, Promise.resolve(null));
    expect(initial.prepared.index.total).toBe(0);
    expect(initial.prepared.index.notBudgetedIds).toEqual([]);
    expect(initial.defaultCollapsedGroups).toEqual([]);
  });
});
