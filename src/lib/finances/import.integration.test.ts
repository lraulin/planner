import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { importFinanceCsvFiles, type ImportFile } from "./import";
import { updateAccount, updateTransaction } from "./mutations";
import { listAccounts, listStatements, listTransactions } from "./queries";

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
    expect(account.balanceCents).toBe(-48120 + 231121);
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

  it("rejects an unknown PDF without sending it through the 360 parser", async () => {
    const result = await importFinanceCsvFiles({
      userId,
      files: [{ name: "taxes.pdf", text: "Form 1040\nDepartment of the Treasury\n" }],
    });
    expect(result.created).toBe(0);
    expect(result.warnings.join(" ")).toMatch(/not a recognised statement/);
    expect(result.warnings.join(" ")).toMatch(/Chase Prime Visa/);
  });
});

describeDb("finance 360 statement snapshots", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
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
