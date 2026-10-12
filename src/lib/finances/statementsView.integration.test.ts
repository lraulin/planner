import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financeStatements, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { importFinanceCsvFiles } from "./import";
import { splitTransaction } from "./mutations";
import {
  listAccounts,
  listStatementPeriodRows,
  listTransactions,
  loadStatementsView,
} from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("statements view");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `statements-view-${crypto.randomUUID()}@localhost`,
      name: "Statements View Test",
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

const HEADER = "Transaction Date,Post Date,Description,Category,Type,Amount,Memo";

/**
 * One card statement, 2026-07-19 to 2026-08-18, with a row on each end of the period, one
 * a day outside each end, one split in two, and one on another card inside the dates.
 */
async function seed(userId: string): Promise<{ statementId: string }> {
  await importFinanceCsvFiles({
    userId,
    files: [
      {
        name: "Chase9910_Activity_20260820.csv",
        text: [
          HEADER,
          "08/19/2026,08/20/2026,DAY AFTER CLOSE,Shopping,Sale,-8.00,",
          "08/18/2026,08/19/2026,ON THE CLOSE,Shopping,Sale,-4.00,",
          "08/10/2026,08/11/2026,SPLIT IN TWO,Shopping,Sale,-10.59,",
          "07/19/2026,07/20/2026,ON THE OPEN,Shopping,Sale,-2.00,",
          "07/18/2026,07/19/2026,DAY BEFORE OPEN,Shopping,Sale,-1.00,",
          "",
        ].join("\n"),
      },
      {
        name: "Chase1234_Activity_20260820.csv",
        text: [
          HEADER,
          "08/05/2026,08/06/2026,OTHER CARD,Shopping,Sale,-16.00,",
          "",
        ].join("\n"),
      },
    ],
  });
  const account = (await listAccounts(userId)).find((row) => row.name.includes("9910"));
  const split = (await listTransactions(userId)).find(
    (row) => row.description === "SPLIT IN TWO",
  );
  if (!account || !split) throw new Error("expected the import to create the card");
  await splitTransaction(userId, split.id, [
    { amountCents: -1000, budgetCategoryId: null },
    { amountCents: -59, budgetCategoryId: null },
  ]);
  const [statement] = await db
    .insert(financeStatements)
    .values({
      userId,
      accountId: account.id,
      periodStart: "2026-07-19",
      periodEnd: "2026-08-18",
      openingBalance: "0.00",
      closingBalance: "-16.59",
    })
    .returning({ id: financeStatements.id });
  return { statementId: statement.id };
}

describeDb("statements view", () => {
  it("counts both period ends, one account, and a split once", async () => {
    const userId = await makeUser();
    await seed(userId);

    const view = await loadStatementsView(userId);

    // −2.00 on the open, −10.59 split in two, −4.00 on the close. The days either side and
    // the other card are not this statement's; the split is one bank row, not two or three.
    expect(view.rows).toEqual([
      expect.objectContaining({
        registerSumCents: -1659,
        registerDeltaCents: 0,
        rowCount: 3,
      }),
    ]);
    expect(view.holes).toEqual([]);
  });

  it("lists exactly the rows the period total was summed from, newest first", async () => {
    const userId = await makeUser();
    const { statementId } = await seed(userId);

    const [check] = (await loadStatementsView(userId)).rows;
    const period = await listStatementPeriodRows(userId, statementId);

    expect(period.map((row) => [row.transactionDate, row.description])).toEqual([
      ["2026-08-18", "ON THE CLOSE"],
      ["2026-08-10", "SPLIT IN TWO"],
      ["2026-07-19", "ON THE OPEN"],
    ]);
    // The panel and the grid are two reads of one rule. If they drift, the list under a
    // statement stops adding up to the figure printed above it.
    expect(period.reduce((total, row) => total + row.amountCents, 0)).toBe(
      check.registerSumCents,
    );
    expect(period).toHaveLength(check.rowCount);
  });

  it("does not show a second user the first user's statements or period rows", async () => {
    const owner = await makeUser();
    const { statementId } = await seed(owner);
    // The intruder holds the same card and dates, so a read that dropped either user scope
    // would have rows to return rather than failing empty by accident.
    const intruder = await makeUser();
    const theirs = await seed(intruder);

    expect(await listStatementPeriodRows(intruder, statementId)).toEqual([]);
    expect(await listStatementPeriodRows(owner, theirs.statementId)).toEqual([]);

    const ownerView = await loadStatementsView(owner);
    expect(ownerView.rows.map((row) => row.id)).toEqual([statementId]);
    expect(ownerView.rows[0].rowCount).toBe(3);
    expect(await loadStatementsView(await makeUser())).toEqual({ rows: [], holes: [] });
  });
});
