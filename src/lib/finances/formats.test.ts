import { describe, expect, it } from "vitest";
import { detectFeed, parseCsvDate, parseFinanceCsv } from "./formats";

/** Header rows copied verbatim from the four real exports. */
const CHASE_HEADER = "Transaction Date,Post Date,Description,Category,Type,Amount,Memo";
const CAPONE_CARD_HEADER =
  "Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit";
const CAPONE_BANK_HEADER =
  "Account Number,Transaction Description,Transaction Date,Transaction Type,Transaction Amount,Balance";

function chase(...rows: string[]): string {
  return [CHASE_HEADER, ...rows].join("\n") + "\n";
}
function caponeCard(...rows: string[]): string {
  return [CAPONE_CARD_HEADER, ...rows].join("\n") + "\n";
}
function caponeBank(...rows: string[]): string {
  return [CAPONE_BANK_HEADER, ...rows].join("\n") + "\n";
}

function ok(fileName: string, text: string) {
  const result = parseFinanceCsv(fileName, text);
  if (!result.ok) throw new Error(`expected a parse, got: ${result.error}`);
  return result.parsed;
}

describe("detectFeed", () => {
  it("tells the three formats apart by their header alone", () => {
    expect(detectFeed(CHASE_HEADER.split(","))).toBe("csv:chase-credit");
    expect(detectFeed(CAPONE_CARD_HEADER.split(","))).toBe("csv:capitalone-card");
    expect(detectFeed(CAPONE_BANK_HEADER.split(","))).toBe("csv:capitalone-bank");
  });

  it("does not confuse the two card formats", () => {
    // Their only structural difference in the first two columns is Post Date vs Posted
    // Date, so a substring match here would pick the wrong parser and mis-sign everything.
    expect(detectFeed(CHASE_HEADER.split(","))).not.toBe("csv:capitalone-card");
    expect(detectFeed(CAPONE_CARD_HEADER.split(","))).not.toBe("csv:chase-credit");
  });

  it("returns null for something else entirely", () => {
    expect(detectFeed(["Date", "Note", "Value"])).toBeNull();
    expect(detectFeed([])).toBeNull();
  });
});

describe("parseCsvDate", () => {
  it("reads all three shapes these exports use", () => {
    expect(parseCsvDate("08/10/2026")).toBe("2026-08-10"); // Chase
    expect(parseCsvDate("08/10/26")).toBe("2026-08-10"); // Capital One bank
    expect(parseCsvDate("2026-08-10")).toBe("2026-08-10"); // Capital One card
  });

  it("expands two-digit years on the POSIX pivot", () => {
    expect(parseCsvDate("08/12/24")).toBe("2024-08-12");
    expect(parseCsvDate("01/01/68")).toBe("2068-01-01");
    expect(parseCsvDate("01/01/69")).toBe("1969-01-01");
  });

  it("rejects impossible days rather than rolling them over", () => {
    // new Date(2026, 1, 30) would silently become March 2nd.
    expect(parseCsvDate("02/30/2026")).toBeNull();
    expect(parseCsvDate("13/01/2026")).toBeNull();
    expect(parseCsvDate("2026-02-30")).toBeNull();
    expect(parseCsvDate("")).toBeNull();
    expect(parseCsvDate("not a date")).toBeNull();
  });

  it("keeps the first of a month as the first of that month", () => {
    // The bug this guards is the classic one: parsing a calendar day as a local-midnight
    // instant and losing a day to the timezone offset. Tests run pinned to America/New_York.
    expect(parseCsvDate("08/01/2026")).toBe("2026-08-01");
    expect(parseCsvDate("2026-01-01")).toBe("2026-01-01");
  });
});

describe("parseFinanceCsv — Chase credit", () => {
  it("passes the already-signed amount through and takes the account from the filename", () => {
    const parsed = ok(
      "Chase9910_Activity_20260812.csv",
      chase(
        "08/10/2026,08/11/2026,AMAZON MKTPL*5H1YV8C82,Shopping,Sale,-10.59,",
        "08/06/2026,08/07/2026,Payment Thank You-Mobile,,Payment,481.20,",
      ),
    );

    expect(parsed.feed).toBe("csv:chase-credit");
    expect(parsed.accounts).toHaveLength(1);
    const account = parsed.accounts[0];
    expect(account.externalKey).toBe("9910");
    expect(account.name).toBe("Chase •••9910");
    expect(account.kind).toBe("credit_card");
    expect(account.institution).toBe("Chase");

    // A purchase is money out; a payment onto the card is money in.
    expect(account.transactions[0].amountCents).toBe(-1059);
    expect(account.transactions[1].amountCents).toBe(48120);
    expect(account.transactions[0].postedDate).toBe("2026-08-11");
    expect(account.transactions[0].sourceCategory).toBe("Shopping");
  });

  it("keeps the memo out of the description", () => {
    // Folding it in would make editing a memo at the bank look like a new transaction.
    const parsed = ok(
      "Chase9910_Activity.csv",
      chase(
        "04/01/2026,04/01/2026,AMAZON MKTPL*BG6AP9ML1,Shopping,Sale,-229.83,baby stuff",
      ),
    );
    const row = parsed.accounts[0].transactions[0];
    expect(row.description).toBe("AMAZON MKTPL*BG6AP9ML1");
    expect(row.memo).toBe("baby stuff");
  });

  it("refuses a Chase export whose filename lost the account number", () => {
    // Chase writes the number nowhere inside the file, so this cannot be recovered — the
    // error has to say what to do about it.
    const result = parseFinanceCsv(
      "activity.csv",
      chase("08/10/2026,08/11/2026,X,,Sale,-1.00,"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Chase");
    expect(result.error).toContain("last four digits");
  });
});

describe("parseFinanceCsv — Capital One card", () => {
  it("signs Debit negative and Credit positive", () => {
    const parsed = ok(
      "2026-08-12_transaction_download.csv",
      caponeCard(
        "2026-08-10,2026-08-11,3448,PP*APPLE.COM/BILL,Entertainment,3.08,",
        "2026-08-05,2026-08-05,3448,CAPITAL ONE MOBILE PYMT,Payment/Credit,,1429.66",
      ),
    );

    const account = parsed.accounts[0];
    expect(account.externalKey).toBe("3448");
    expect(account.name).toBe("Capital One •••3448");
    expect(account.kind).toBe("credit_card");
    expect(account.transactions[0].amountCents).toBe(-308);
    expect(account.transactions[1].amountCents).toBe(142966);
    // This feed reports both dates.
    expect(account.transactions[0].postedDate).toBe("2026-08-11");
  });

  it("keeps a quoted comma inside the description", () => {
    const parsed = ok(
      "2026-08-12_transaction_download.csv",
      caponeCard(
        '2026-01-16,2026-01-17,3448,"CURSOR, AI POWERED IDE",Merchandise,63.60,',
      ),
    );
    expect(parsed.accounts[0].transactions[0].description).toBe(
      "CURSOR, AI POWERED IDE",
    );
    expect(parsed.accounts[0].transactions[0].amountCents).toBe(-6360);
  });

  it("flags a row with neither or both amount columns instead of guessing", () => {
    const parsed = ok(
      "2026-08-12_transaction_download.csv",
      caponeCard(
        "2026-08-10,2026-08-11,3448,GOOD,Dining,10.00,",
        "2026-08-10,2026-08-11,3448,NEITHER,Dining,,",
        "2026-08-10,2026-08-11,3448,BOTH,Dining,5.00,5.00",
      ),
    );
    expect(parsed.accounts[0].transactions).toHaveLength(1);
    expect(parsed.errors).toHaveLength(2);
    // Header is row 1, so the bad rows are 3 and 4 — the numbers a spreadsheet would show.
    expect(parsed.errors.map((e) => e.row)).toEqual([3, 4]);
  });

  it("ignores the trailing blank line the real file ends with", () => {
    const text = caponeCard("2026-08-10,2026-08-11,3448,POTBELLY,Dining,24.55,") + "\n";
    const parsed = ok("2026-08-12_transaction_download.csv", text);
    expect(parsed.accounts[0].transactions).toHaveLength(1);
    expect(parsed.errors).toEqual([]);
  });
});

describe("parseFinanceCsv — Capital One 360 bank", () => {
  it("signs from the Type column and keeps the running balance", () => {
    const parsed = ok(
      "2026-08-12_360Checking...2322.csv",
      caponeBank(
        "2322,Withdrawal from CHASE CREDIT CRD EPAY,08/10/26,Debit,481.2,471.45",
        "2322,Deposit from GA8248 TRUSTEDQA PAYROLL,08/05/26,Credit,2311.21,3075.67",
      ),
    );

    const account = parsed.accounts[0];
    expect(account.externalKey).toBe("2322");
    expect(account.name).toBe("360 Checking •••2322");
    expect(account.kind).toBe("checking");

    expect(account.transactions[0].amountCents).toBe(-48120);
    expect(account.transactions[1].amountCents).toBe(231121);
    expect(account.transactions[0].balanceAfterCents).toBe(47145);
    // This feed reports one date only.
    expect(account.transactions[0].postedDate).toBeNull();
  });

  it("reads the savings product name and kind out of the filename", () => {
    const parsed = ok(
      "2026-08-12_360PerformanceSavings...2603.csv",
      caponeBank("2603,Monthly Interest Paid,07/31/26,Credit,1.2,1098.98"),
    );
    expect(parsed.accounts[0].name).toBe("360 Performance Savings •••2603");
    expect(parsed.accounts[0].kind).toBe("savings");
    expect(parsed.accounts[0].transactions[0].amountCents).toBe(120);
  });

  it("keeps a quoted comma in the description", () => {
    const parsed = ok(
      "2026-08-12_360Checking...2322.csv",
      caponeBank(
        '2322,"Deposit from MBI ACCTVERIFY RAULIN,LEE",02/11/26,Credit,0.19,631.72',
      ),
    );
    expect(parsed.accounts[0].transactions[0].description).toBe(
      "Deposit from MBI ACCTVERIFY RAULIN,LEE",
    );
    expect(parsed.accounts[0].transactions[0].amountCents).toBe(19);
  });

  it("groups by account number rather than assuming one account per file", () => {
    const parsed = ok(
      "2026-08-12_360Checking...2322.csv",
      caponeBank(
        "2322,A,08/10/26,Debit,1.00,10.00",
        "2603,B,08/10/26,Credit,2.00,20.00",
        "2322,C,08/09/26,Debit,3.00,7.00",
      ),
    );
    expect(parsed.accounts.map((a) => a.externalKey)).toEqual(["2322", "2603"]);
    expect(parsed.accounts[0].transactions).toHaveLength(2);
    expect(parsed.accounts[1].transactions).toHaveLength(1);
  });

  it("signs amounts so they reconcile against the bank's own running balance", () => {
    // The strongest available check that Debit/Credit are the right way round, and it uses
    // a column the fingerprint ignores: walking the balances backwards from any row must
    // land on the balance the previous row reported. Getting a sign backwards breaks this
    // by twice the amount, which no amount of eyeballing a register would reliably catch.
    const parsed = ok(
      "2026-08-12_360Checking...2322.csv",
      caponeBank(
        "2322,Withdrawal from CHASE CREDIT CRD EPAY,08/10/26,Debit,481.2,471.45",
        "2322,Withdrawal from CAPITAL ONE MOBILE PMT,08/06/26,Debit,1429.66,952.65",
        "2322,Paycheck Percentage Transfer,08/06/26,Debit,693.36,2382.31",
        "2322,Deposit from GA8248 TRUSTEDQA PAYROLL,08/05/26,Credit,2311.21,3075.67",
      ),
    );

    // Rows run newest first, so each row's balance plus its own amount, negated, is the
    // balance the next (older) row should report.
    const rows = parsed.accounts[0].transactions;
    const balances = rows.map((row) => row.balanceAfterCents ?? Number.NaN);
    expect(balances).toEqual([47145, 95265, 238231, 307567]);
    for (let i = 0; i < rows.length - 1; i++) {
      expect(balances[i] - rows[i].amountCents).toBe(balances[i + 1]);
    }
  });

  it("flags an unknown transaction type", () => {
    const parsed = ok(
      "2026-08-12_360Checking...2322.csv",
      caponeBank("2322,MYSTERY,08/10/26,Reversal,1.00,10.00"),
    );
    expect(parsed.accounts).toHaveLength(0);
    expect(parsed.errors[0].message).toContain("reversal");
  });
});

describe("parseFinanceCsv — file-level failures", () => {
  it("names the file when the format is unrecognised", () => {
    const result = parseFinanceCsv("budget.csv", "Date,Note,Value\n2026-01-05,hi,1\n");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("budget.csv");
  });

  it("reports an empty file", () => {
    const result = parseFinanceCsv("empty.csv", "");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("empty");
  });

  it("survives a header with no data rows", () => {
    const parsed = ok("Chase9910_Activity.csv", CHASE_HEADER + "\n");
    expect(parsed.accounts).toEqual([]);
    expect(parsed.errors).toEqual([]);
  });
});
