import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { financeBudgetCategories, financeTransactions, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { importFinanceCsvFiles, type ImportFile } from "./import";
import { updateAccount, updateTransaction } from "./mutations";
import { listAccounts, listStatements, listTransactions } from "./queries";
import { createPayee } from "./payees/mutations";
import { createSchedule } from "./schedules/mutations";
import { seedBudget } from "./budget/mutations";
import { createRule } from "./rules/mutations";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("finance import");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `finance-test-${crypto.randomUUID()}@localhost`,
      name: "Finance Test",
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

const CHASE_HEADER = "Transaction Date,Post Date,Description,Category,Type,Amount,Memo";
const CAPONE_CARD_HEADER =
  "Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit";
const CAPONE_BANK_HEADER =
  "Account Number,Transaction Description,Transaction Date,Transaction Type,Transaction Amount,Balance";

const chaseFile: ImportFile = {
  name: "Chase9910_Activity_20260812.csv",
  text: [
    CHASE_HEADER,
    "08/10/2026,08/11/2026,AMAZON MKTPL*5H1YV8C82,Shopping,Sale,-10.59,",
    "08/06/2026,08/07/2026,Payment Thank You-Mobile,,Payment,481.20,",
    "",
  ].join("\n"),
};

/** Includes the byte-identical SBARRO pair the real Capital One export contains. */
const caponeCardFile: ImportFile = {
  name: "2026-08-12_transaction_download.csv",
  text: [
    CAPONE_CARD_HEADER,
    "2026-07-01,2026-07-02,3448,SBARRO,Dining,6.59,",
    "2026-07-01,2026-07-02,3448,SBARRO,Dining,6.59,",
    '2026-01-16,2026-01-17,3448,"CURSOR, AI POWERED IDE",Merchandise,63.60,',
    "2026-08-05,2026-08-05,3448,CAPITAL ONE MOBILE PYMT,Payment/Credit,,1429.66",
    "",
  ].join("\n"),
};

const caponeBankFile: ImportFile = {
  name: "2026-08-12_360Checking...2322.csv",
  text: [
    CAPONE_BANK_HEADER,
    "2322,Withdrawal from CHASE CREDIT CRD EPAY,08/10/26,Debit,481.2,471.45",
    "2322,Deposit from GA8248 TRUSTEDQA PAYROLL,08/05/26,Credit,2311.21,3075.67",
    "",
  ].join("\n"),
};

const allFiles = [chaseFile, caponeCardFile, caponeBankFile];

describeDb("finance CSV import", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("imports every format in one upload and auto-creates their accounts", async () => {
    const result = await importFinanceCsvFiles({ userId, files: allFiles });

    expect(result).toMatchObject({ created: 8, skipped: 0, accountsCreated: 3 });
    expect(result.warnings).toEqual([]);

    const accounts = await listAccounts(userId);
    expect(accounts.map((a) => [a.name, a.kind, a.transactionCount])).toEqual([
      ["360 Checking •••2322", "checking", 2],
      ["Capital One •••3448", "credit_card", 4],
      ["Chase •••9910", "credit_card", 2],
    ]);
  });

  it("normalises every feed onto positive-is-money-in", async () => {
    await importFinanceCsvFiles({ userId, files: allFiles });
    const rows = await listTransactions(userId);
    const byDescription = new Map(rows.map((r) => [r.description, r.amountCents]));

    // Chase signs its own amounts; a purchase is out, a card payment is in.
    expect(byDescription.get("AMAZON MKTPL*5H1YV8C82")).toBe(-1059);
    expect(byDescription.get("Payment Thank You-Mobile")).toBe(48120);
    // Capital One's card splits across Debit and Credit columns.
    expect(byDescription.get("CURSOR, AI POWERED IDE")).toBe(-6360);
    expect(byDescription.get("CAPITAL ONE MOBILE PYMT")).toBe(142966);
    // Capital One's bank puts the direction in a Type column.
    expect(byDescription.get("Withdrawal from CHASE CREDIT CRD EPAY")).toBe(-48120);
    expect(byDescription.get("Deposit from GA8248 TRUSTEDQA PAYROLL")).toBe(231121);
  });

  it("applies a Category rule to a newly imported transaction", async () => {
    await seedBudget(userId, {
      preset: "minimal",
      startMonth: "2026-08-01",
      todayKey: "2026-08-23",
    });
    const [category] = await db
      .select({ id: financeBudgetCategories.id })
      .from(financeBudgetCategories)
      .where(
        and(
          eq(financeBudgetCategories.userId, userId),
          eq(financeBudgetCategories.name, "Discretionary"),
        ),
      );
    await createRule(userId, {
      name: "Local cafe",
      conditions: [{ field: "merchant", op: "is", value: "LOCAL CAFE" }],
      actions: [{ op: "set", field: "category", value: category.id }],
    });

    await importFinanceCsvFiles({
      userId,
      files: [
        {
          name: "Chase9910_Activity_20260812.csv",
          text: [
            CHASE_HEADER,
            "08/10/2026,08/11/2026,LOCAL CAFE,Dining,Sale,-12.34,",
            "",
          ].join("\n"),
        },
      ],
    });

    const [row] = await listTransactions(userId);
    expect(row.budgetCategoryName).toBe("Discretionary");
  });

  it("classifies and routes a newly imported schedule match into its envelope", async () => {
    await seedBudget(userId, {
      preset: "minimal",
      startMonth: "2026-09-01",
      todayKey: "2026-08-23",
    });
    const [envelope] = await db
      .select({ id: financeBudgetCategories.id })
      .from(financeBudgetCategories)
      .where(eq(financeBudgetCategories.userId, userId))
      .limit(1);
    const payeeId = await createPayee(userId, {
      name: "Netflix",
      aliases: ["NETFLIX"],
    });
    const scheduleId = await createSchedule(
      userId,
      {
        name: "Netflix",
        conditions: [
          {
            field: "date",
            op: "isapprox",
            value: { frequency: "monthly", start: "2026-01-15" },
          },
          { field: "payee", op: "is", value: payeeId },
          { field: "amount", op: "isapprox", value: -1599 },
        ],
        budgetCategoryId: envelope.id,
      },
      "2026-08-23",
    );

    await importFinanceCsvFiles({
      userId,
      files: [
        {
          name: "Chase9910_Activity_20260916.csv",
          text: [
            CHASE_HEADER,
            "09/15/2026,09/16/2026,NETFLIX,Shopping,Sale,-15.99,",
            "",
          ].join("\n"),
        },
      ],
    });

    const [row] = await db
      .select({
        scheduleId: financeTransactions.scheduleId,
        categoryId: financeTransactions.budgetCategoryId,
        payeeId: financeTransactions.payeeId,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, userId));
    expect(row).toEqual({
      scheduleId,
      categoryId: envelope.id,
      payeeId,
    });
  });

  it("keeps both identical rows and stores the balance the bank reported", async () => {
    await importFinanceCsvFiles({ userId, files: allFiles });
    const rows = await listTransactions(userId);

    expect(rows.filter((r) => r.description === "SBARRO")).toHaveLength(2);
    const withdrawal = rows.find(
      (r) => r.description === "Withdrawal from CHASE CREDIT CRD EPAY",
    );
    expect(withdrawal?.balanceAfterCents).toBe(47145);
    // Only the bank feed reports a running balance.
    expect(rows.find((r) => r.description === "SBARRO")?.balanceAfterCents).toBeNull();
  });

  it("seeds the note from the bank's memo without inventing a description", async () => {
    await importFinanceCsvFiles({
      userId,
      files: [
        {
          name: "Chase9910_Activity.csv",
          text: `${CHASE_HEADER}\n04/01/2026,04/01/2026,AMAZON MKTPL*BG6AP9ML1,Shopping,Sale,-229.83,baby stuff\n`,
        },
      ],
    });
    const [row] = await listTransactions(userId);
    expect(row.description).toBe("AMAZON MKTPL*BG6AP9ML1");
    expect(row.notes).toBe("baby stuff");
  });

  it("skips everything on a re-import instead of duplicating it", async () => {
    await importFinanceCsvFiles({ userId, files: allFiles });
    const again = await importFinanceCsvFiles({ userId, files: allFiles });

    expect(again).toMatchObject({ created: 0, skipped: 8, accountsCreated: 0 });
    expect(await listTransactions(userId)).toHaveLength(8);
    // Still two, not one and not four: the occurrence ordinal survives the round trip.
    const sbarro = (await listTransactions(userId)).filter(
      (r) => r.description === "SBARRO",
    );
    expect(sbarro).toHaveLength(2);
  });

  it("adds only the new rows when a later export overlaps an earlier one", async () => {
    // The normal case: you download the last N days each time, so most of the file is
    // already stored.
    await importFinanceCsvFiles({ userId, files: [caponeBankFile] });
    const overlapping: ImportFile = {
      name: "2026-08-12_360Checking...2322.csv",
      text: [
        CAPONE_BANK_HEADER,
        "2322,Monthly Interest Paid,08/11/26,Credit,0.10,471.55",
        "2322,Withdrawal from CHASE CREDIT CRD EPAY,08/10/26,Debit,481.2,471.45",
        "2322,Deposit from GA8248 TRUSTEDQA PAYROLL,08/05/26,Credit,2311.21,3075.67",
        "",
      ].join("\n"),
    };

    const result = await importFinanceCsvFiles({ userId, files: [overlapping] });
    expect(result).toMatchObject({ created: 1, skipped: 2, accountsCreated: 0 });
    expect(await listTransactions(userId)).toHaveLength(3);
  });

  it("builds the same register from overlapping downloads as from one big one", async () => {
    // This is the workflow the module exists for: download a window from the bank every so
    // often, each one reaching back over ground the last one already covered, and import it.
    // The invariant is that N overlapping imports land exactly where one full import would.
    const day = (d: string, desc: string, amount: string) =>
      `2026-${d},2026-${d},3448,${desc},Dining,${amount},`;
    const rows = [
      day("07-01", "SBARRO", "6.59"),
      // The identical pair, deliberately sitting inside the overlap.
      day("07-01", "SBARRO", "6.59"),
      day("07-10", "POTBELLY", "24.55"),
      day("07-20", "WAL-MART", "158.24"),
      day("07-28", "PIZZA HUT", "33.07"),
    ];
    const window = (from: number, to: number): ImportFile => ({
      name: "2026-08-12_transaction_download.csv",
      text: [CAPONE_CARD_HEADER, ...rows.slice(from, to), ""].join("\n"),
    });

    // Three pulls that overlap each other, the middle one re-covering the identical pair.
    await importFinanceCsvFiles({ userId, files: [window(0, 3)] });
    const second = await importFinanceCsvFiles({ userId, files: [window(0, 4)] });
    const third = await importFinanceCsvFiles({ userId, files: [window(2, 5)] });

    expect(second).toMatchObject({ created: 1, skipped: 3 });
    expect(third).toMatchObject({ created: 1, skipped: 2 });

    const got = await listTransactions(userId);
    expect(got).toHaveLength(rows.length);
    // Both SBARROs survived every overlap — not collapsed to one, not multiplied to four.
    expect(got.filter((r) => r.description === "SBARRO")).toHaveLength(2);
  });

  it("does not care what order the bank listed the rows in", async () => {
    // Ordinals are assigned by position in the file, so a feed that changes its sort order
    // between downloads must not start looking like a set of new transactions.
    const rows = [
      "2026-07-01,2026-07-02,3448,SBARRO,Dining,6.59,",
      "2026-07-01,2026-07-02,3448,SBARRO,Dining,6.59,",
      "2026-07-10,2026-07-11,3448,POTBELLY,Dining,24.55,",
    ];
    const file = (order: string[]): ImportFile => ({
      name: "2026-08-12_transaction_download.csv",
      text: [CAPONE_CARD_HEADER, ...order, ""].join("\n"),
    });

    await importFinanceCsvFiles({ userId, files: [file(rows)] });
    const reversed = await importFinanceCsvFiles({
      userId,
      files: [file([...rows].reverse())],
    });

    expect(reversed).toMatchObject({ created: 0, skipped: 3 });
    expect(await listTransactions(userId)).toHaveLength(3);
  });

  it("imports a restated transaction twice — the one case overlap cannot absorb", async () => {
    // Pinning the known limitation rather than pretending it is not there. If a bank
    // revises an already-posted row (a tip settling into a different amount, a merchant
    // name normalised), the fingerprint changes and the row arrives as a new one.
    //
    // It does not bite these four feeds: their exports are posted-only — every card row
    // carries a posted date, and the 360 exports are a settled ledger with running
    // balances — so a transaction first appears only once its values are final. The
    // register's row delete is the fix if a feed ever does restate one.
    const posted: ImportFile = {
      name: "2026-08-12_transaction_download.csv",
      text: `${CAPONE_CARD_HEADER}\n2026-08-09,2026-08-10,3448,POTBELLY,Dining,24.55,\n`,
    };
    const restated: ImportFile = {
      name: "2026-08-12_transaction_download.csv",
      text: `${CAPONE_CARD_HEADER}\n2026-08-09,2026-08-10,3448,POTBELLY,Dining,29.55,\n`,
    };

    await importFinanceCsvFiles({ userId, files: [posted] });
    const after = await importFinanceCsvFiles({ userId, files: [restated] });

    expect(after).toMatchObject({ created: 1, skipped: 0 });
    expect(await listTransactions(userId)).toHaveLength(2);
  });

  it("does not overwrite an edited category or note on re-import", async () => {
    await importFinanceCsvFiles({ userId, files: [chaseFile] });
    const [row] = await listTransactions(userId);
    await updateTransaction(userId, row.id, {
      category: "Household",
      notes: "nappies",
    });

    await importFinanceCsvFiles({ userId, files: [chaseFile] });

    const [after] = await listTransactions(userId);
    expect(after.category).toBe("Household");
    expect(after.notes).toBe("nappies");
    // The bank's own category is still the bank's.
    expect(after.sourceCategory).toBe("Shopping");
  });

  it("matches an account by its key after it has been renamed", async () => {
    // Account identity is (externalSource, externalKey), never the name — otherwise
    // renaming an account would silently split its history across two of them.
    await importFinanceCsvFiles({ userId, files: [chaseFile] });
    const [account] = await listAccounts(userId);
    await updateAccount(userId, account.id, { name: "Sapphire Reserve" });

    const second = await importFinanceCsvFiles({ userId, files: [chaseFile] });

    expect(second).toMatchObject({ created: 0, skipped: 2, accountsCreated: 0 });
    const after = await listAccounts(userId);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: account.id, name: "Sapphire Reserve" });
  });

  it("reports a balance that is the sum of the account's transactions", async () => {
    await importFinanceCsvFiles({ userId, files: [caponeBankFile] });
    const [account] = await listAccounts(userId);
    expect(account.ledgerBalanceCents).toBe(-48120 + 231121);
    expect(account.balanceCents).toBe(account.ledgerBalanceCents);
    expect(account.balanceMismatchCents).toBe(0);
  });

  it("warns about an unreadable file but still imports the others", async () => {
    const result = await importFinanceCsvFiles({
      userId,
      files: [
        chaseFile,
        { name: "budget.csv", text: "Date,Note,Value\n2026-01-05,hi,1\n" },
      ],
    });

    expect(result.created).toBe(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("budget.csv");
    expect(await listTransactions(userId)).toHaveLength(2);
  });

  it("warns per bad row and imports the rest of the file", async () => {
    const result = await importFinanceCsvFiles({
      userId,
      files: [
        {
          name: "2026-08-12_transaction_download.csv",
          text: [
            CAPONE_CARD_HEADER,
            "2026-08-10,2026-08-11,3448,GOOD,Dining,10.00,",
            "2026-08-10,2026-08-11,3448,BROKEN,Dining,,",
            "",
          ].join("\n"),
        },
      ],
    });

    expect(result.created).toBe(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("row 3");
  });

  it("filters by account and by date window", async () => {
    await importFinanceCsvFiles({ userId, files: allFiles });
    const accounts = await listAccounts(userId);
    const chase = accounts.find((a) => a.name === "Chase •••9910");

    expect(await listTransactions(userId, { accountId: chase?.id })).toHaveLength(2);
    // August 2026: two Chase rows, the card payment, and both bank rows.
    expect(
      await listTransactions(userId, { from: "2026-08-01", to: "2026-08-31" }),
    ).toHaveLength(5);
    // Bounds are inclusive; only the January CURSOR charge is on or before the 31st.
    expect(await listTransactions(userId, { to: "2026-01-31" })).toHaveLength(1);
    expect(
      await listTransactions(userId, { from: "2026-01-16", to: "2026-01-16" }),
    ).toHaveLength(1);
  });
});

describeDb("finance import user isolation", () => {
  let ownerId: string;
  let intruderId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    await importFinanceCsvFiles({ userId: ownerId, files: allFiles });
  });

  it("does not let a second user read another user's accounts or transactions", async () => {
    expect(await listAccounts(intruderId)).toEqual([]);
    expect(await listTransactions(intruderId)).toEqual([]);
  });

  it("gives each user their own account for the same bank file", async () => {
    // The dedup key is scoped per user, so two people importing the same statement each get
    // a full copy rather than the second one being skipped as a duplicate.
    const result = await importFinanceCsvFiles({ userId: intruderId, files: allFiles });
    expect(result).toMatchObject({ created: 8, skipped: 0, accountsCreated: 3 });
    expect(await listTransactions(ownerId)).toHaveLength(8);
    expect(await listTransactions(intruderId)).toHaveLength(8);
  });
});

/** Invented 360 statement text — same last-four as the bank CSV fixture, so they meet. */
function checkingStatement(rows: string[]): ImportFile {
  return {
    name: "Statement_2026-08.pdf",
    text: [
      "Here's your bank statement.August 2026 STATEMENT PERIOD",
      "Aug 1 - Aug 31, 2026",
      "360 Checking - 111111112322",
      "DATE DESCRIPTION CATEGORY AMOUNT BALANCE",
      "Aug 1 Opening Balance $0.00",
      ...rows,
      "If anything in your statement looks incorrect, please let us know immediately.",
    ].join("\n"),
  };
}

const cdStatement: ImportFile = {
  name: "Statement_2024-07.pdf",
  text: [
    "Here's your bank statement.July 2024 STATEMENT PERIOD",
    "Jul 1 - Jul 31, 2024",
    "CD - 111111112957",
    "DATE DESCRIPTION CATEGORY AMOUNT BALANCE",
    "Jul 1 Opening Balance $100.00",
    "Jul 25 Interest Paid Credit + $1.00 $101.00",
    "Jul 25 CD Close-Out to 360 Performance Savings XXXXXXX2603 Debit - $101.00 $0.00",
    "Jul 25 Closing Balance $0.00",
    "If anything in your statement looks incorrect, please let us know immediately.",
  ].join("\n"),
};

describeDb("finance statement import", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("lands statement rows on the account the bank CSV already created", async () => {
    await importFinanceCsvFiles({ userId, files: [caponeBankFile] });
    const before = await listAccounts(userId);
    expect(before).toHaveLength(1);

    const result = await importFinanceCsvFiles({
      userId,
      files: [
        checkingStatement([
          "Aug 5 Deposit from GA8248 TRUSTEDQA PAYROLL Credit + $2,311.21 $2,311.21",
          "Aug 12 Deposit from OLD TRANSFER Credit + $50.00 $2,361.21",
          "Aug 31 Closing Balance $2,361.21",
        ]),
      ],
    });

    // Payroll is the same identity as the CSV row; the Aug 12 transfer is new.
    expect(result).toMatchObject({ created: 1, skipped: 1, accountsCreated: 0 });
    expect(await listAccounts(userId)).toHaveLength(1);
    expect(await listAccounts(userId)).toEqual([
      expect.objectContaining({ id: before[0].id, externalKey: "2322" }),
    ]);
    expect(await listTransactions(userId)).toHaveLength(3);
  });

  it("skips every row when the same statement is imported again", async () => {
    const file = checkingStatement([
      "Aug 12 Deposit from OLD TRANSFER Credit + $50.00 $50.00",
      "Aug 31 Closing Balance $50.00",
    ]);
    await importFinanceCsvFiles({ userId, files: [file] });
    const again = await importFinanceCsvFiles({ userId, files: [file] });
    expect(again).toMatchObject({ created: 0, skipped: 1, accountsCreated: 0 });
    expect(await listTransactions(userId)).toHaveLength(1);
  });

  it("creates the matured CD as a closed investment account", async () => {
    const result = await importFinanceCsvFiles({ userId, files: [cdStatement] });
    expect(result).toMatchObject({ created: 2, skipped: 0, accountsCreated: 1 });

    const accounts = await listAccounts(userId);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      name: "CD •••2957",
      kind: "investment",
      externalKey: "2957",
    });
    expect(accounts[0].closedAt).not.toBeNull();
  });

  it("does not overwrite a category on a CSV row that a later statement also contains", async () => {
    await importFinanceCsvFiles({ userId, files: [caponeBankFile] });
    const payroll = (await listTransactions(userId)).find((r) =>
      r.description.includes("TRUSTEDQA"),
    );
    if (!payroll) throw new Error("expected the CSV payroll row");
    await updateTransaction(userId, payroll.id, { category: "Pay" });

    await importFinanceCsvFiles({
      userId,
      files: [
        checkingStatement([
          "Aug 5 Deposit from GA8248 TRUSTEDQA PAYROLL Credit + $2,311.21 $2,311.21",
          "Aug 31 Closing Balance $2,311.21",
        ]),
      ],
    });

    const after = (await listTransactions(userId)).find((r) => r.id === payroll.id);
    expect(after?.category).toBe("Pay");
  });
});

describeDb("finance statement import user isolation", () => {
  let ownerId: string;
  let intruderId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    await importFinanceCsvFiles({ userId: ownerId, files: [cdStatement] });
  });

  it("does not let a second user read the first user's CD", async () => {
    expect(await listAccounts(intruderId)).toEqual([]);
    expect(await listTransactions(intruderId)).toEqual([]);
    expect(await listStatements(intruderId)).toEqual([]);
  });
});

const caponeCardStatement: ImportFile = {
  name: "Statement_072026_3448.pdf",
  text: [
    "Account Summary",
    "Previous Balance $0.00",
    "Payments $0.00",
    "Other Credits $0.00",
    "Transactions + $23.18",
    "Cash Advances + $0.00",
    "Fees Charged + $0.00",
    "Interest Charged + $0.00",
    "New Balance = $23.18",
    "Credit Limit $16,500.00",
    "Available Credit (as of Jul 21, 2026) $16,476.82",
    "Payment Due Date",
    "Aug 15, 2026",
    "Minimum Payment Due",
    "$25.00",
    "VentureOne Credit Card | Visa Signature ending in 1797",
    "Jun 21, 2026 - Jul 21, 2026 | 31 days in Billing Cycle",
    "Pay or manage your account at capitalone.com",
    "Rewards Balance",
    "100 Track and redeem",
    "LEE M EXAMPLE #1797: Payments, Credits and Adjustments",
    "Trans Date Post Date Description Amount",
    "LEE M EXAMPLE #1797: Transactions",
    "Trans Date Post Date Description Amount",
    "Jul 1 Jul 2 SBARRO WASHINGTON DC $6.59",
    "Jul 1 Jul 2 SBARRO WASHINGTON DC $6.59",
    "Jun 20 Jun 22 WAL-MART #1981CALIFORNIAMD $10.00",
    "Total Transactions for This Period $23.18",
    "Interest Charge on Purchases $0.00",
    "Purchases 25.49% P $0.00 $0.00",
  ].join("\n"),
};

function chaseCardStatement(rows: string[], newBalance = "$60.59"): ImportFile {
  return {
    name: "20260818-statements-9910-.pdf",
    text: [
      "Payment Due Date: 09/15/26",
      `New Balance: ${newBalance}`,
      "Minimum Payment Due: $35.00",
      "www.chase.com/cardhelp",
      "Previous Balance $0.00",
      "Payment, Credits $0.00",
      "Purchases +$60.59",
      "Cash Advances $0.00",
      "Balance Transfers $0.00",
      "Fees Charged $0.00",
      "Interest Charged $0.00",
      "Opening/Closing Date 07/19/26 - 08/18/26",
      "Credit Access Line $7,900",
      "Available Credit $7,839",
      "Total points available for",
      "redemption 400",
      "ACCOUNT ACTIVITY",
      "Page 2 of 2 Statement Date: 08/18/26",
      ...rows,
      "Purchases 23.24%(v)(d) - 0 - - 0 -",
    ].join("\n"),
  };
}

const chaseOverlapStatement = chaseCardStatement([
  "07/20 AMAZON MKTPL*BACKFILL Amzn.com/bill WA 50.00",
  "08/10 AMAZON MKTPL*5H1YV8C82 Amzn.com/bill WA 10.59",
]);

describeDb("finance Chase card statement import", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("lands on the existing Chase CSV account and skips overlap", async () => {
    await importFinanceCsvFiles({ userId, files: [chaseFile] });
    const before = await listAccounts(userId);
    expect(before).toHaveLength(1);

    const result = await importFinanceCsvFiles({
      userId,
      files: [chaseOverlapStatement],
    });

    expect(result).toMatchObject({
      created: 1,
      skipped: 1,
      accountsCreated: 0,
      statementsCreated: 1,
    });
    expect(await listAccounts(userId)).toEqual([
      expect.objectContaining({ id: before[0].id, externalKey: "9910" }),
    ]);
    const rows = await listTransactions(userId);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.description)).toEqual(
      expect.arrayContaining([
        "AMAZON MKTPL*5H1YV8C82",
        "Payment Thank You-Mobile",
        "AMAZON MKTPL*BACKFILL",
      ]),
    );
    const snapshots = await listStatements(userId);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toEqual(
      expect.objectContaining({
        periodStart: "2026-07-19",
        periodEnd: "2026-08-18",
        closingBalanceCents: -6059,
        creditLimitCents: 790000,
        rewardsPoints: 400,
      }),
    );
    expect(snapshots[0].rates[0]).toEqual(
      expect.objectContaining({ balanceType: "Purchases", aprPercent: 23.24 }),
    );
    const [card] = await listAccounts(userId);
    const laterCents = rows
      .filter((row) => row.transactionDate > "2026-08-18")
      .reduce((total, row) => total + row.amountCents, 0);
    expect(card.statementPeriodEnd).toBe("2026-08-18");
    expect(card.statementClosingCents).toBe(-6059);
    expect(card.balanceCents).toBe(-6059 + laterCents);
    expect(card.ledgerBalanceCents).toBe(
      rows.reduce((total, row) => total + row.amountCents, 0),
    );
  });

  it("skips the CSV row when the statement landed first", async () => {
    await importFinanceCsvFiles({ userId, files: [chaseOverlapStatement] });
    const result = await importFinanceCsvFiles({ userId, files: [chaseFile] });
    expect(result).toMatchObject({ created: 1, skipped: 1, accountsCreated: 0 });
    expect(await listTransactions(userId)).toHaveLength(3);
  });

  it("creates no transactions or statements on re-import", async () => {
    await importFinanceCsvFiles({ userId, files: [chaseOverlapStatement] });
    const again = await importFinanceCsvFiles({
      userId,
      files: [chaseOverlapStatement],
    });
    expect(again).toMatchObject({
      created: 0,
      skipped: 2,
      statementsCreated: 0,
      statementsSkipped: 1,
    });
    expect(await listTransactions(userId)).toHaveLength(2);
    expect(await listStatements(userId)).toHaveLength(1);
  });

  it("does not overwrite a category on a CSV row a later statement also contains", async () => {
    await importFinanceCsvFiles({ userId, files: [chaseFile] });
    const amazon = (await listTransactions(userId)).find((r) =>
      r.description.includes("5H1YV8C82"),
    );
    if (!amazon) throw new Error("expected the CSV Amazon row");
    await updateTransaction(userId, amazon.id, { category: "Household" });

    await importFinanceCsvFiles({ userId, files: [chaseOverlapStatement] });
    const after = (await listTransactions(userId)).find((r) => r.id === amazon.id);
    expect(after?.category).toBe("Household");
  });

  it("lands a Capital One card statement on the existing 3448 account and skips overlap", async () => {
    await importFinanceCsvFiles({ userId, files: [caponeCardFile] });
    const before = await listAccounts(userId);
    expect(before).toHaveLength(1);

    const result = await importFinanceCsvFiles({
      userId,
      files: [caponeCardStatement],
    });

    expect(result).toMatchObject({
      created: 1,
      skipped: 2,
      accountsCreated: 0,
      statementsCreated: 1,
    });
    expect(await listAccounts(userId)).toEqual([
      expect.objectContaining({ id: before[0].id, externalKey: "3448" }),
    ]);
    const rows = await listTransactions(userId);
    expect(rows.map((r) => r.description)).toEqual(
      expect.arrayContaining([
        "SBARRO",
        "CURSOR, AI POWERED IDE",
        "CAPITAL ONE MOBILE PYMT",
        "WAL-MART #1981",
      ]),
    );
    expect(rows.filter((r) => r.description === "SBARRO")).toHaveLength(2);
    const snapshots = await listStatements(userId);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toEqual(
      expect.objectContaining({
        periodStart: "2026-06-21",
        periodEnd: "2026-07-21",
        closingBalanceCents: -2318,
      }),
    );
  });

  it("skips the Capital One card CSV row when the statement landed first", async () => {
    await importFinanceCsvFiles({ userId, files: [caponeCardStatement] });
    const result = await importFinanceCsvFiles({ userId, files: [caponeCardFile] });
    expect(result).toMatchObject({ created: 2, skipped: 2, accountsCreated: 0 });
    expect(await listAccounts(userId)).toHaveLength(1);
  });

  it("creates no Capital One card rows or statements on re-import", async () => {
    await importFinanceCsvFiles({ userId, files: [caponeCardStatement] });
    const again = await importFinanceCsvFiles({
      userId,
      files: [caponeCardStatement],
    });
    expect(again).toMatchObject({
      created: 0,
      statementsCreated: 0,
      statementsSkipped: 1,
    });
    expect(again.skipped).toBeGreaterThan(0);
  });

  it("rejects an unknown PDF without sending it through the 360 parser", async () => {
    const result = await importFinanceCsvFiles({
      userId,
      files: [{ name: "taxes.pdf", text: "Form 1040\nDepartment of the Treasury\n" }],
    });
    expect(result.created).toBe(0);
    expect(result.warnings.join(" ")).toMatch(/not a recognised statement/);
    expect(result.warnings.join(" ")).toMatch(/Chase Prime Visa/);
    expect(result.warnings.join(" ")).toMatch(/Capital One card/);
  });
});

describeDb("finance 360 statement snapshots", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("writes a snapshot per account on a combined 360 statement", async () => {
    const file: ImportFile = {
      name: "Statement_2024-07.pdf",
      text: [
        "Here's your bank statement.July 2024 STATEMENT PERIOD",
        "Jul 1 - Jul 31, 2024",
        "360 Checking - 111111112322",
        "DATE DESCRIPTION CATEGORY AMOUNT BALANCE",
        "Jul 1 Opening Balance $10.00",
        "Jul 31 Monthly Interest Paid Credit + $0.10 $10.10",
        "Jul 31 Closing Balance $10.10",
        "360 Performance Savings - 111111112603",
        "DATE DESCRIPTION CATEGORY AMOUNT BALANCE",
        "Jul 1 Opening Balance $20.00",
        "Jul 31 Closing Balance $20.00",
        "If anything in your statement looks incorrect, please let us know immediately.",
      ].join("\n"),
    };
    const result = await importFinanceCsvFiles({ userId, files: [file] });
    expect(result.statementsCreated).toBe(2);
    const snapshots = await listStatements(userId);
    expect(snapshots).toHaveLength(2);
    expect(snapshots.map((s) => s.accountName).sort()).toEqual([
      "360 Checking •••2322",
      "360 Performance Savings •••2603",
    ]);
  });

  it("writes a snapshot on first import and skips it on the second", async () => {
    const file = checkingStatement([
      "Aug 12 Deposit from OLD TRANSFER Credit + $50.00 $50.00",
      "Aug 31 Closing Balance $50.00",
    ]);
    const first = await importFinanceCsvFiles({ userId, files: [file] });
    expect(first).toMatchObject({
      created: 1,
      statementsCreated: 1,
      statementsSkipped: 0,
    });
    const again = await importFinanceCsvFiles({ userId, files: [file] });
    expect(again).toMatchObject({
      created: 0,
      skipped: 1,
      statementsCreated: 0,
      statementsSkipped: 1,
    });
    expect(await listStatements(userId)).toEqual([
      expect.objectContaining({
        openingBalanceCents: 0,
        closingBalanceCents: 5000,
        paymentDueDate: null,
        rates: [],
      }),
    ]);
  });
});

describeDb("finance Chase statement user isolation", () => {
  let ownerId: string;
  let intruderId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    await importFinanceCsvFiles({ userId: ownerId, files: [chaseOverlapStatement] });
  });

  it("does not let a second user read the first user's statements or rates", async () => {
    expect(await listStatements(ownerId)).toHaveLength(1);
    expect(await listStatements(intruderId)).toEqual([]);
    expect(
      await listStatements(intruderId, {
        accountId: (await listAccounts(ownerId))[0]?.id,
      }),
    ).toEqual([]);
  });
});

const COINBASE_FILE: ImportFile = {
  name: "coinbase.csv",
  text: `
Transactions
User,Lee Raulin,0b7043a7-af9a-5c5c-bb18-6e15b4e0267e
ID,Timestamp,Transaction Type,Asset,Quantity Transacted,Price Currency,Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes,Sender Address,Recipient Address
698242c1ff3a8c113e3fa72f,2026-02-03 18:47:29 UTC,Withdrawal,USD,-1517,USD,$1.00,$1517.00,$1517.00,$0.00,Withdrawal to Capital One - 360 Chec... ****2322,,
698242730d7d7d5fcce96cb7,2026-02-03 18:46:11 UTC,Sell,BTC,-0.02126381,USD,$73455.055,$1546.42,$1517.42,-15.62,Sold 0.02126381 BTC for 1517.42 USD,,
63854c7b3aea980001a75d2a,2022-11-29 00:04:11 UTC,Buy,BTC,0.00202835,USD,$16194.665,$32.84845,$35.00,0.16155124725,Bought 0.00202835 BTC for 35 USD using bank account PenFed Credit Union - ... ******2021,,
`,
};

describeDb("finance Coinbase import", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("creates an investment account and stores Coinbase's own ids", async () => {
    const result = await importFinanceCsvFiles({ userId, files: [COINBASE_FILE] });
    expect(result).toMatchObject({ created: 3, skipped: 0, accountsCreated: 1 });
    expect(result.warnings).toEqual([]);

    const accounts = await listAccounts(userId);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      name: "Coinbase",
      kind: "investment",
      institution: "Coinbase",
      transactionCount: 3,
    });

    const rows = await listTransactions(userId);
    const sell = rows.find((row) => row.description.includes("Sell"));
    const withdrawal = rows.find((row) => row.description.includes("Withdrawal"));
    const buy = rows.find((row) => row.description.includes("Buy"));
    expect(sell?.amountCents).toBe(151700);
    expect(withdrawal?.amountCents).toBe(-151700);
    expect(buy?.amountCents).toBe(0);

    const stored = await db
      .select({
        externalSource: financeTransactions.externalSource,
        externalId: financeTransactions.externalId,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, userId));
    expect(stored).toEqual(
      expect.arrayContaining([
        { externalSource: "csv:coinbase", externalId: "698242c1ff3a8c113e3fa72f" },
        { externalSource: "csv:coinbase", externalId: "698242730d7d7d5fcce96cb7" },
        { externalSource: "csv:coinbase", externalId: "63854c7b3aea980001a75d2a" },
      ]),
    );
  });

  it("skips a re-import even after the description is edited", async () => {
    await importFinanceCsvFiles({ userId, files: [COINBASE_FILE] });
    const [row] = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, userId))
      .limit(1);
    await db
      .update(financeTransactions)
      .set({ description: "edited by hand" })
      .where(eq(financeTransactions.id, row.id));

    const again = await importFinanceCsvFiles({ userId, files: [COINBASE_FILE] });
    expect(again).toMatchObject({ created: 0, skipped: 3, accountsCreated: 0 });
    expect(await listTransactions(userId)).toHaveLength(3);
    expect(
      (await listTransactions(userId)).some(
        (entry) => entry.description === "edited by hand",
      ),
    ).toBe(true);
  });
});

describeDb("finance Coinbase import user isolation", () => {
  it("does not let a second user see the first user's Coinbase rows", async () => {
    const ownerId = await makeUser();
    const intruderId = await makeUser();
    await importFinanceCsvFiles({ userId: ownerId, files: [COINBASE_FILE] });

    expect(await listAccounts(intruderId)).toEqual([]);
    expect(await listTransactions(intruderId)).toEqual([]);

    const result = await importFinanceCsvFiles({
      userId: intruderId,
      files: [COINBASE_FILE],
    });
    expect(result).toMatchObject({ created: 3, skipped: 0, accountsCreated: 1 });
    expect(await listTransactions(ownerId)).toHaveLength(3);
    expect(await listTransactions(intruderId)).toHaveLength(3);
  });
});

describeDb("importing a statement after a live sync", () => {
  /**
   * The direction that bites weeks later. A sync runs daily and writes rows carrying the
   * aggregator's date; the bank's own statement arrives afterwards dating the same
   * transactions a day later. Under exact matching every one imported twice.
   */
  async function seedSyncedRow(userId: string, accountId: string) {
    await db.insert(financeTransactions).values({
      userId,
      accountId,
      // The aggregator's date. Chase's CSV below calls the same purchase 08/10.
      transactionDate: "2026-08-09",
      description: "AMAZON MKTPL*5H1YV8C82",
      amount: "-10.59",
      externalSource: "api:simplefin",
      externalId: "sfin-1",
    });
  }

  it("does not re-import a transaction the sync already wrote", async () => {
    const userId = await makeUser();
    await importFinanceCsvFiles({ userId, files: [chaseFile] });
    const [account] = await listAccounts(userId);

    // Clear what the file wrote, then stand in for a sync having run first.
    await db.delete(financeTransactions).where(eq(financeTransactions.userId, userId));
    await seedSyncedRow(userId, account.id);

    const result = await importFinanceCsvFiles({ userId, files: [chaseFile] });

    const rows = await listTransactions(userId);
    const amazon = rows.filter((row) => row.description.includes("5H1YV8C82"));
    // One row, not two — and it is the synced one, since import never updates.
    expect(amazon).toHaveLength(1);
    expect(amazon[0].transactionDate).toBe("2026-08-09");
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it("finds a synced row dated outside the file's own range", async () => {
    // The boundary case. This file's rows span 08/06..08/10, and the sync dated the same
    // payment 08/05 — outside it. Looking only within the file's range hides that row, and
    // every transaction on the edge of an import duplicates.
    const userId = await makeUser();
    await importFinanceCsvFiles({ userId, files: [chaseFile] });
    const [account] = await listAccounts(userId);
    await db.delete(financeTransactions).where(eq(financeTransactions.userId, userId));
    await db.insert(financeTransactions).values({
      userId,
      accountId: account.id,
      transactionDate: "2026-08-05",
      description: "Payment Thank You-Mobile",
      amount: "481.20",
      externalSource: "api:simplefin",
      externalId: "sfin-payment",
    });

    await importFinanceCsvFiles({ userId, files: [chaseFile] });

    const rows = await listTransactions(userId);
    const payments = rows.filter((row) =>
      row.description.includes("Payment Thank You"),
    );
    expect(payments).toHaveLength(1);
    expect(payments[0].transactionDate).toBe("2026-08-05");
  });

  it("still imports the statement rows the sync never saw", async () => {
    const userId = await makeUser();
    await importFinanceCsvFiles({ userId, files: [chaseFile] });
    const [account] = await listAccounts(userId);
    await db.delete(financeTransactions).where(eq(financeTransactions.userId, userId));
    await seedSyncedRow(userId, account.id);

    await importFinanceCsvFiles({ userId, files: [chaseFile] });

    const rows = await listTransactions(userId);
    // The payment row was never synced, so the file is still the way it arrives.
    expect(rows.some((row) => row.description.includes("Payment Thank You"))).toBe(
      true,
    );
  });
});
