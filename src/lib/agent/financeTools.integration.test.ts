import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { importFinanceCsvFiles, type ImportFile } from "@/lib/finances/import";
import {
  reclassifyTransactions,
  updateTransaction,
  upsertRecurringBill,
} from "@/lib/finances/mutations";
import { listTransactions } from "@/lib/finances/queries";
import { dispatchAgentTool } from "./tools";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("finance agent tools");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `finance-agent-${crypto.randomUUID()}@localhost`,
      name: "Finance Agent Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

const cardFile: ImportFile = {
  name: "Chase9910_Activity_20260812.csv",
  text: [
    "Transaction Date,Post Date,Description,Category,Type,Amount,Memo",
    "03/02/2026,03/03/2026,WM SUPERCENTER #1981,Groceries,Sale,-84.12,",
    "03/09/2026,03/10/2026,SIMPLISAFE 8888957880,Bills & Utilities,Sale,-34.71,",
    "04/09/2026,04/10/2026,SIMPLISAFE 8888957880,Bills & Utilities,Sale,-34.71,",
    "03/15/2026,03/15/2026,ZEELLE FAMILY GIFT,Income,Adjustment,500.00,",
    "",
  ].join("\n"),
};

const statementFile: ImportFile = {
  name: "20260318-statements-9910.pdf",
  text: [
    "Manage your account online:",
    "Payment Due Date: 04/15/26",
    "New Balance: $118.83",
    "Minimum Payment Due: $35.00",
    "www.chase.com/cardhelp",
    "Account Number: XXXX XXXX XXXX 9910",
    "New Balance $118.83",
    "Past Due Amount $0.00",
    "Balance over the Credit Access Line $0.00",
    "Previous Balance $10.00",
    "Payment, Credits -$20.00",
    "Purchases +$118.83",
    "Cash Advances $0.00",
    "Balance Transfers $0.00",
    "Fees Charged $29.00",
    "Interest Charged $12.45",
    "Opening/Closing Date 02/19/26 - 03/18/26",
    "Credit Access Line $6,000",
    "Available Credit $5,881",
    "ACCOUNT ACTIVITY",
    "Page 2 of 3 Statement Date: 03/18/26",
    "Date of",
    "Transaction Merchant Name or Transaction Description $ Amount",
    "03/02 WM SUPERCENTER #1981 84.12",
    "Total fees charged in 2026 $29.00",
    "Total interest charged in 2026 $12.45",
    "Purchases 24.99%(v)(d) - 0 - - 0 -",
    "Cash Advances 29.99%(v)(d) - 0 - - 0 -",
    "",
  ].join("\n"),
};

async function seed(userId: string): Promise<void> {
  await importFinanceCsvFiles({ userId, files: [cardFile, statementFile] });
  await reclassifyTransactions(userId);
  const gift = (await listTransactions(userId)).find((row) =>
    row.description.includes("GIFT"),
  );
  if (gift) {
    await updateTransaction(userId, gift.id, { flowOverride: "income" });
  }
  await upsertRecurringBill(userId, {
    merchant: "SimpliSafe",
    cadenceMonths: 1,
    expectedCents: 3471,
  });
}

describeDb("finance agent tools", () => {
  let ownerId: string;
  let intruderId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    await seed(ownerId);
  });

  it("reads the same accounts, coverage and carrying cost the dashboard would", async () => {
    const overview = (await dispatchAgentTool("get_finance_overview", {}, ownerId)) as {
      accounts: { name: string; balanceCents: number }[];
      history: { transactionCount: number };
      coverage: { completeFrom: string | null };
      carryingCost: { interestCents: number; feesCents: number };
    };
    expect(overview.accounts).toHaveLength(1);
    expect(overview.accounts[0].name).toBe("Chase •••9910");
    expect(overview.history.transactionCount).toBe(4);
    expect(overview.coverage.completeFrom).toBeNull();
    expect(overview.carryingCost).toMatchObject({
      interestCents: 1245,
      feesCents: 2900,
    });
  });

  it("returns cash-flow points and keeps baseline vs one-off as two numbers", async () => {
    const flow = (await dispatchAgentTool(
      "get_cash_flow",
      { window: "all" },
      ownerId,
    )) as {
      range: { startKey: string; endKey: string };
      totals: { spendCents: number; incomeCents: number };
      baseline: { baselineCents: number; oneOffCents: number };
    };
    expect(flow.range).toEqual({ startKey: "2026-03-02", endKey: "2026-04-09" });
    expect(flow.totals.incomeCents).toBe(50000);
    expect(flow.totals.spendCents).toBe(8412 + 3471 + 3471);
    expect(flow.baseline.oneOffCents).toBe(0);
    expect(flow.baseline.baselineCents).toBe(8412 + 3471 + 3471);
  });

  it("ranks spend and totals the whole search match, not the page", async () => {
    const spend = (await dispatchAgentTool(
      "get_spending_breakdown",
      { window: "all", by: "merchant", limit: 1 },
      ownerId,
    )) as {
      items: { name: string; cents: number }[];
      otherCents: number;
      returned: number;
      total: number;
    };
    expect(spend.returned).toBe(1);
    expect(spend.total).toBeGreaterThan(1);
    expect(spend.otherCents).toBeGreaterThan(0);

    const found = (await dispatchAgentTool(
      "search_transactions",
      { query: "simplisafe", limit: 1 },
      ownerId,
    )) as {
      transactions: { description: string }[];
      pageInfo: { total: number; hasMore: boolean };
      matchedSpendCents: number;
    };
    expect(found.transactions).toHaveLength(1);
    expect(found.pageInfo).toMatchObject({ total: 2, hasMore: true });
    expect(found.matchedSpendCents).toBe(3471 + 3471);
  });

  it("lists the declared bill and the statement carrying cost", async () => {
    const bills = (await dispatchAgentTool(
      "list_recurring_bills",
      { window: "all" },
      ownerId,
    )) as { bills: { merchant: string; declared: boolean }[] };
    expect(
      bills.bills.some((bill) => bill.declared && bill.merchant === "SimpliSafe"),
    ).toBe(true);

    const debt = (await dispatchAgentTool(
      "get_debt_summary",
      { window: "all" },
      ownerId,
    )) as {
      carryingCost: { interestCents: number; byAccount: { statementCount: number }[] };
    };
    expect(debt.carryingCost.interestCents).toBe(1245);
    expect(debt.carryingCost.byAccount[0].statementCount).toBe(1);
  });

  it("does not let a second user read the first user's finances", async () => {
    const overview = (await dispatchAgentTool(
      "get_finance_overview",
      {},
      intruderId,
    )) as { accounts: unknown[]; history: { transactionCount: number } };
    expect(overview.accounts).toEqual([]);
    expect(overview.history.transactionCount).toBe(0);

    const flow = (await dispatchAgentTool(
      "get_cash_flow",
      { window: "all" },
      intruderId,
    )) as { points: unknown[]; totals: { spendCents: number } };
    expect(flow.points).toEqual([]);
    expect(flow.totals.spendCents).toBe(0);

    const spend = (await dispatchAgentTool(
      "get_spending_breakdown",
      {},
      intruderId,
    )) as { items: unknown[]; totalSpendCents: number };
    expect(spend.items).toEqual([]);
    expect(spend.totalSpendCents).toBe(0);

    const bills = (await dispatchAgentTool("list_recurring_bills", {}, intruderId)) as {
      bills: unknown[];
    };
    expect(bills.bills).toEqual([]);

    const debt = (await dispatchAgentTool("get_debt_summary", {}, intruderId)) as {
      series: unknown[];
      carryingCost: { interestCents: number };
    };
    expect(debt.series).toEqual([]);
    expect(debt.carryingCost.interestCents).toBe(0);

    const found = (await dispatchAgentTool(
      "search_transactions",
      { query: "gift" },
      intruderId,
    )) as { transactions: unknown[]; matchedIncomeCents: number };
    expect(found.transactions).toEqual([]);
    expect(found.matchedIncomeCents).toBe(0);

    const snaps = (await dispatchAgentTool("list_statements", {}, intruderId)) as {
      statements: unknown[];
      holes: unknown[];
    };
    expect(snaps.statements).toEqual([]);
    expect(snaps.holes).toEqual([]);

    // Owner still sees the seed, so the empties above are isolation, not a failed import.
    const ownerSearch = (await dispatchAgentTool(
      "search_transactions",
      { query: "gift" },
      ownerId,
    )) as { matchedIncomeCents: number };
    expect(ownerSearch.matchedIncomeCents).toBe(50000);
  });

  it("rejects an unknown field by name", async () => {
    await expect(
      dispatchAgentTool("get_cash_flow", { window: "12m", surprise: true }, ownerId),
    ).rejects.toMatchObject({
      code: "validation",
      message: expect.stringContaining("Unknown field surprise"),
    });
  });
});
