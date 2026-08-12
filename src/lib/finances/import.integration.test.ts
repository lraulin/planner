import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { importFinanceCsvFiles, type ImportFile } from "./import";
import { updateAccount, updateTransaction } from "./mutations";
import { listAccounts, listTransactions } from "./queries";

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
