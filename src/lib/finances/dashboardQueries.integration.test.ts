import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financeTransactions, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { effectiveCategory, effectiveFlow } from "./analytics";
import {
  loadCarryingCost,
  loadDashboard,
  loadInsightsRows,
  unclassifiedCount,
} from "./dashboardQueries";
import { importFinanceCsvFiles, type ImportFile } from "./import";
import { createCategoryGroup } from "./budget/mutations";
import { reclassifyTransactions, setOneOff, upsertBillEnvelope } from "./mutations";
import { listTransactions } from "./queries";
import { renamePayee } from "./payees/mutations";
import { listPayees } from "./payees/queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("finance dashboard queries");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `finance-dashboard-${crypto.randomUUID()}@localhost`,
      name: "Finance Dashboard Test",
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

const cardFile: ImportFile = {
  name: "Chase9910_Activity_20260812.csv",
  text: [
    "Transaction Date,Post Date,Description,Category,Type,Amount,Memo",
    "03/02/2026,03/03/2026,WM SUPERCENTER #1981,Groceries,Sale,-84.12,",
    "03/09/2026,03/10/2026,SIMPLISAFE 8888957880,Bills & Utilities,Sale,-34.71,",
    "04/09/2026,04/10/2026,SIMPLISAFE 8888957880,Bills & Utilities,Sale,-34.71,",
    "",
  ].join("\n"),
};

/** Invented Prime Visa extract in the shape the parser reads. No real card or person. */
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
}

describeDb("loadInsightsRows", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
    await seed(userId);
  });

  it("hands back rows the analytics layer can classify without another query", async () => {
    await reclassifyTransactions(userId);
    const rows = await loadInsightsRows(userId);

    expect(rows).toHaveLength(3);
    // Oldest first, so a running balance does not need a second sort.
    expect(rows.map((row) => row.transactionDate)).toEqual([
      "2026-03-02",
      "2026-03-09",
      "2026-04-09",
    ]);
    expect(rows.every((row) => row.accountName === "Chase •••9910")).toBe(true);
    expect(effectiveFlow(rows[0])).toBe("spend");
    expect(effectiveCategory(rows[0])).toBe("Uncategorized");
    expect(rows.every((row) => row.payeeId !== null && row.payeeName !== null)).toBe(
      true,
    );
  });

  it("carries the user-owned fields the panels split baseline from one-off with", async () => {
    const [first] = await listTransactions(userId);
    await setOneOff(userId, [first.id], {
      excludeFromBaseline: true,
      eventLabel: "House move",
    });

    const rows = await loadInsightsRows(userId);
    const flagged = rows.find((row) => row.id === first.id);
    expect(flagged).toMatchObject({
      excludeFromBaseline: true,
      eventLabel: "House move",
    });
  });

  it("windows on the date when asked", async () => {
    const rows = await loadInsightsRows(userId, {
      from: "2026-03-01",
      to: "2026-03-31",
    });
    expect(rows).toHaveLength(2);
  });
});

describeDb("unclassifiedCount", () => {
  it("counts what a reclassify has never seen, and then stops", async () => {
    const userId = await makeUser();
    await seed(userId);

    // Import classifies as it writes, so a finished ingest is fully classified.
    expect(await unclassifiedCount(userId)).toBe(0);

    const [existing] = await listTransactions(userId);
    await db.insert(financeTransactions).values({
      userId,
      accountId: existing.accountId,
      transactionDate: "2026-05-01",
      description: "UNSEEN MERCHANT",
      amount: "-12.00",
    });

    expect(await unclassifiedCount(userId)).toBe(1);
    await reclassifyTransactions(userId);
    expect(await unclassifiedCount(userId)).toBe(0);
  });
});

describeDb("loadCarryingCost", () => {
  it("reads interest, fees and the APR off the statements as positive costs", async () => {
    const userId = await makeUser();
    await seed(userId);

    const cost = await loadCarryingCost(userId);

    expect(cost.interestCents).toBe(1245);
    expect(cost.feesCents).toBe(2900);
    expect(cost.byAccount).toHaveLength(1);
    expect(cost.byAccount[0]).toMatchObject({
      accountName: "Chase •••9910",
      interestCents: 1245,
      feesCents: 2900,
      latestAprPercent: 29.99,
      latestCreditLimitCents: 600000,
      statementCount: 1,
    });
  });

  it("windows on the statement period", async () => {
    const userId = await makeUser();
    await seed(userId);

    const cost = await loadCarryingCost(userId, { from: "2026-04-01" });
    expect(cost).toMatchObject({ interestCents: 0, feesCents: 0, byAccount: [] });
  });
});

describeDb("insights user isolation", () => {
  let ownerId: string;
  let intruderId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    await seed(ownerId);
    await reclassifyTransactions(ownerId);
  });

  it("does not hand a second user another user's rows, counts or statements", async () => {
    expect(await loadInsightsRows(intruderId)).toEqual([]);
    expect(await unclassifiedCount(intruderId)).toBe(0);
    expect(await loadCarryingCost(intruderId)).toMatchObject({
      interestCents: 0,
      feesCents: 0,
      byAccount: [],
    });

    // And the owner still sees everything, so the assertions above are not passing because
    // the seed silently failed.
    expect((await loadInsightsRows(ownerId)).length).toBe(3);
    expect((await loadCarryingCost(ownerId)).interestCents).toBe(1245);
  });
});

describeDb("loadDashboard", () => {
  it("returns the accounts, bills and bill charges the headline is built from", async () => {
    const userId = await makeUser();
    await seed(userId);
    await reclassifyTransactions(userId);
    const alarmPayee = (await listPayees(userId)).find(
      (payee) => payee.name === "SimpliSafe",
    );
    if (!alarmPayee) throw new Error("SimpliSafe payee was not seeded");
    await createCategoryGroup(userId, { name: "Household" });
    await upsertBillEnvelope(userId, {
      name: "SimpliSafe",
      payeeIds: [alarmPayee.id],
      cadence: { unit: "month", n: 1 },
      expectedCents: 3_471,
      dueDay: 9,
    });
    await renamePayee(userId, alarmPayee.id, "Home Alarm");

    const data = await loadDashboard(userId);

    expect(data.accounts).toHaveLength(1);
    expect(data.accounts[0]).toMatchObject({
      name: "Chase •••9910",
      kind: "credit_card",
    });
    expect(data.bills[0]).toMatchObject({ dueDay: 9 });
    expect(data.bills[0].payees).toEqual([{ id: alarmPayee.id, name: "Home Alarm" }]);
    // Only charges against a declared merchant — the Walmart row is not one.
    expect(data.billCharges).toEqual([
      { name: "SimpliSafe", dateKey: "2026-03-09", costCents: 3471 },
      { name: "SimpliSafe", dateKey: "2026-04-09", costCents: 3471 },
    ]);
  });

  it("reports no pending rows for a register built from files", async () => {
    // Pending only ever arrives from a live feed. An import that produced pending rows would
    // mean the CSV path had started writing a column only the sync is allowed to own.
    const userId = await makeUser();
    await seed(userId);

    expect((await loadDashboard(userId)).pending).toEqual([]);
  });

  it("does not hand a second user another user's dashboard", async () => {
    const ownerId = await makeUser();
    const intruderId = await makeUser();
    await seed(ownerId);
    await reclassifyTransactions(ownerId);
    await createCategoryGroup(ownerId, { name: "Household" });
    await upsertBillEnvelope(ownerId, {
      name: "SimpliSafe",
      cadence: { unit: "month", n: 1 },
      expectedCents: 3_471,
    });

    const intruder = await loadDashboard(intruderId);
    expect(intruder.accounts).toEqual([]);
    expect(intruder.bills).toEqual([]);
    expect(intruder.review).toEqual([]);
    expect(intruder.billCharges).toEqual([]);
    expect(intruder.pending).toEqual([]);
    expect(intruder.paydays).toEqual([]);
    expect(intruder.connections).toEqual([]);

    // And the owner still sees theirs, so the assertions above are not passing on an empty
    // seed.
    expect((await loadDashboard(ownerId)).accounts).toHaveLength(1);
  });
});
