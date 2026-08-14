import { describe, expect, it } from "vitest";
import {
  looksLikeCapitalOneCardStatement,
  normalizeCapitalOneCardMerchant,
  parseCapitalOneCardStatement,
} from "./capitalOneCardStatement";

function ok(fileName: string, text: string) {
  const result = parseCapitalOneCardStatement(fileName, text);
  if (!result.ok) throw new Error(`expected a parse, got: ${result.error}`);
  return result.parsed;
}

/**
 * Invented VentureOne extract — same visual dump shape as the later PDFs, no real
 * name, address, or PAN.
 */
function modernStatement(body: string, extras = ""): string {
  return [
    "Account Summary",
    "Previous Balance $10.00",
    "Payments - $20.00",
    "Other Credits $0.00",
    "Transactions + $60.00",
    "Cash Advances + $0.00",
    "Fees Charged + $0.00",
    "Interest Charged + $0.00",
    "New Balance = $50.00",
    "Credit Limit $16,500.00",
    "Available Credit (as of Jan 21, 2026) $16,450.00",
    "Payment Information",
    "Payment Due Date",
    "Feb 15, 2026",
    "New Balance",
    "$50.00",
    "Minimum Payment Due",
    "$25.00",
    "Page 1 of 3",
    "VentureOne Credit Card | Visa Signature ending in 1797",
    "Dec 22, 2025 - Jan 21, 2026 | 31 days in Billing Cycle",
    "Pay or manage your account at capitalone.com Customer Service: 800-227-4825",
    "Rewards Summary Rewards as of: 01/21/2026",
    "Rewards Balance",
    "1,200 Track and redeem your rewards with our",
    "LEE M EXAMPLE #1797: Payments, Credits and Adjustments",
    "Trans Date Post Date Description Amount",
    "Dec 27 Dec 27 CAPITAL ONE MOBILE PYMT - $20.00",
    "LEE M EXAMPLE #1797: Transactions",
    "Trans Date Post Date Description Amount",
    body,
    extras,
    "LEE M EXAMPLE #1797: Total Transactions $60.00",
    "Total Transactions for This Period $60.00",
    "Fees",
    "Trans Date Post Date Description Amount",
    "Total Fees for This Period $0.00",
    "Interest Charged",
    "Interest Charge on Purchases $0.00",
    "Interest Charge on Cash Advances $0.00",
    "Interest Charge on Other Balances $0.00",
    "Total Interest for This Period $0.00",
    "Totals Year-to-Date",
    "Total Fees charged $0.00",
    "Total Interest charged $0.00",
    "Interest Charge Calculation",
    "Purchases 25.49% P $0.00 $0.00",
    "Cash Advances 29.99% P $0.00 $0.00",
    "",
  ].join("\n");
}

function earlyStatement(body: string): string {
  return [
    "Account Notifications",
    "Account Summary",
    "Previous Balance $434.72",
    "Payments - $434.72",
    "Other Credits $0.00",
    "Transactions + $25.16",
    "Cash Advances + $0.00",
    "Fees Charged + $0.00",
    "Interest Charged + $0.00",
    "New Balance = $25.16",
    "Credit Limit $1,000.00",
    "www.capitalone.com. Customer Service: 1-800-955-7070",
    "Payment Due Date",
    "Feb. 15, 2021",
    "Minimum Payment Due",
    "$25.00",
    "Visa Platinum Account Ending in 1797",
    "Dec. 22, 2020 - Jan. 21, 2021 | 31 days in Billing Cycle",
    "Visit www.capitalone.com to see detailed transactions.",
    "Date Description Amount",
    "Dec 22 CAPITAL ONE ONLINE PYMTAuthDate",
    "22-Dec",
    "- $434.72",
    "Date Description Amount",
    body,
    "Total Transactions for This Period $25.16",
    "Interest Charge on Purchases $0.00",
    "Total Fees charged $0.00",
    "Total Interest charged $0.00",
    "",
  ].join("\n");
}

describe("normalizeCapitalOneCardMerchant", () => {
  it("strips mashed location, phone, bill suffix, and AuthDate", () => {
    expect(normalizeCapitalOneCardMerchant("SBARRO WASHINGTON DC")).toBe(
      "SBARRO WASHINGTON DC",
    );
    expect(normalizeCapitalOneCardMerchant("PIZZA HUT 036874 https://ipcha MD")).toBe(
      "PIZZA HUT 036874",
    );
    expect(normalizeCapitalOneCardMerchant("PP*APPLE.COM/BILL402-935-7733CA")).toBe(
      "PP*APPLE.COM/BILL",
    );
    expect(
      normalizeCapitalOneCardMerchant("AMZN Mktp US*CB1JE9PS3Amzn.com/billWA"),
    ).toBe("AMZN Mktp US*CB1JE9PS3");
    expect(
      normalizeCapitalOneCardMerchant("CAPITAL ONE MOBILE PYMTAuthDate 20-Jun"),
    ).toBe("CAPITAL ONE MOBILE PYMT");
    expect(normalizeCapitalOneCardMerchant("CURSOR, AI POWERED IDECURSOR.COMNY")).toBe(
      "CURSOR, AI POWERED",
    );
    expect(normalizeCapitalOneCardMerchant("METLIFE PETPETFIRST.COMIN")).toBe(
      "METLIFE",
    );
    expect(
      normalizeCapitalOneCardMerchant("FIREHOUSE SUBS 0938 ECOMM LEXINGTON PAR MD"),
    ).toBe("FIREHOUSE SUBS 0938 ECOMM LEXINGTON PAR");
    expect(
      normalizeCapitalOneCardMerchant("CHIPOTLE MEX GR ONLINE TEAM-BANKING@ CA"),
    ).toBe("CHIPOTLE MEX GR ONLINE");
  });

  it("keeps store numbers, mashed ExtraCare ids, and a location the CSV keeps", () => {
    expect(normalizeCapitalOneCardMerchant("WAL-MART #1981")).toBe("WAL-MART #1981");
    expect(normalizeCapitalOneCardMerchant("CVSExtraCare 8007467287RI")).toBe(
      "CVSExtraCare 8007467287RI",
    );
    expect(
      normalizeCapitalOneCardMerchant("SMARTRIP WASHINGTON DC WASHINGTON DC"),
    ).toBe("SMARTRIP WASHINGTON DC");
  });
});

describe("parseCapitalOneCardStatement", () => {
  it("rejects a PDF that is not a Capital One card statement", () => {
    const result = parseCapitalOneCardStatement(
      "taxes.pdf",
      "Form 1040\nDepartment of the Treasury\n",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("taxes.pdf");
    expect(result.error).toContain("Capital One card");
  });

  it("does not treat a 360 bank statement as a card statement", () => {
    expect(
      looksLikeCapitalOneCardStatement(
        "Here's your bank statement. STATEMENT PERIOD\n360 Checking - 111111112322\ncapitalone.com\n",
      ),
    ).toBe(false);
  });

  it("requires the last four in the filename, not the printed PAN", () => {
    const result = parseCapitalOneCardStatement(
      "monthly.pdf",
      modernStatement("Jan 5 Jan 6 WAL-MART #1981CALIFORNIAMD $60.00\n"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("filename");
  });

  it("flips signs, normalizes merchants, and lands on the filename key", () => {
    const parsed = ok(
      "Statement_012026_3448.pdf",
      modernStatement(
        [
          "Jan 5 Jan 6 WAL-MART #1981CALIFORNIAMD $50.00",
          "Jan 6 Jan 7 PP*APPLE.COM/BILL402-935-7733CA $10.00",
          "Jan 4 Jan 6 AEROMEXI AER7910584135HOUSTONTX $0.00",
          "PSGR: EXAMPLE/PAT",
          "ORIG: 139, DEST: 13, S/O: X, CARRIER: AM, SVC: V",
        ].join("\n"),
      ),
    );

    expect(parsed.feed).toBe("csv:capitalone-card");
    expect(parsed.accounts).toHaveLength(1);
    expect(parsed.accounts[0].externalKey).toBe("3448");
    expect(parsed.accounts[0].kind).toBe("credit_card");
    expect(parsed.accounts[0].transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transactionDate: "2025-12-27",
          postedDate: "2025-12-27",
          description: "CAPITAL ONE MOBILE PYMT",
          amountCents: 2000,
          sourceCategory: "Payment/Credit",
        }),
        expect.objectContaining({
          transactionDate: "2026-01-05",
          postedDate: "2026-01-06",
          description: "WAL-MART #1981",
          amountCents: -5000,
        }),
        expect.objectContaining({
          transactionDate: "2026-01-06",
          description: "PP*APPLE.COM/BILL",
          amountCents: -1000,
        }),
      ]),
    );
    expect(
      parsed.accounts[0].transactions.some((row) =>
        /PSGR:|ORIG:/.test(row.description),
      ),
    ).toBe(false);
  });

  it("does not create an account from the printed 1797 PAN", () => {
    const parsed = ok(
      "Statement_012026_3448.pdf",
      modernStatement("Jan 5 Jan 6 WAL-MART #1981 $60.00\n"),
    );
    expect(parsed.accounts[0].externalKey).toBe("3448");
    expect(parsed.accounts.map((a) => a.externalKey)).not.toContain("1797");
  });

  it("joins early wrapped Amazon lines and AuthDate payments", () => {
    const parsed = ok(
      "Statement_012021_3448.pdf",
      earlyStatement(
        ["Jan 16 AMZN Mktp", "US*CB1JE9PS3Amzn.com/billWA", "$25.16"].join("\n"),
      ),
    );

    expect(parsed.accounts[0].transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transactionDate: "2020-12-22",
          description: "CAPITAL ONE ONLINE PYMT",
          amountCents: 43472,
          sourceCategory: "Payment/Credit",
        }),
        expect.objectContaining({
          transactionDate: "2021-01-16",
          postedDate: null,
          description: "AMZN Mktp US*CB1JE9PS3",
          amountCents: -2516,
        }),
      ]),
    );
  });

  it("emits INTEREST CHARGE:PURCHASES on the closing date so the CSV row skips", () => {
    const parsed = ok(
      "Statement_012026_3448.pdf",
      modernStatement("Jan 5 Jan 6 WAL-MART #1981 $60.00\n")
        .replace("Interest Charged + $0.00", "Interest Charged + $5.00")
        .replace("New Balance = $50.00", "New Balance = $55.00")
        .replace(
          "Interest Charge on Purchases $0.00",
          "Interest Charge on Purchases $5.00",
        ),
    );

    expect(parsed.accounts[0].transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transactionDate: "2026-01-21",
          description: "INTEREST CHARGE:PURCHASES",
          amountCents: -500,
          sourceCategory: "Fee/Interest Charge",
        }),
      ]),
    );
  });

  it("skips the original-currency restatement on a foreign charge", () => {
    const parsed = ok(
      "Statement_072026_3448.pdf",
      modernStatement(
        [
          "Dec 22 Dec 23 LOTUSEATERS.COM SWINDON $60.00",
          "$5.00",
          "GBP",
          "0.746268657 Exchange Rate",
        ].join("\n"),
      ),
    );
    const lotus = parsed.accounts[0].transactions.filter((row) =>
      row.description.startsWith("LOTUSEATERS"),
    );
    expect(lotus).toEqual([
      expect.objectContaining({
        description: "LOTUSEATERS.COM SWINDON",
        amountCents: -6000,
      }),
    ]);
  });

  it("keeps both identical SBARRO rows", () => {
    const parsed = ok(
      "Statement_072026_3448.pdf",
      modernStatement(
        [
          "Jul 1 Jul 2 SBARRO WASHINGTON DC $30.00",
          "Jul 1 Jul 2 SBARRO WASHINGTON DC $30.00",
        ].join("\n"),
      ),
    );
    expect(
      parsed.accounts[0].transactions.filter((row) =>
        row.description.startsWith("SBARRO"),
      ),
    ).toHaveLength(2);
  });

  it("stores opening and closing in the module sign and fills card fields", () => {
    const parsed = ok(
      "Statement_012026_3448.pdf",
      modernStatement("Jan 5 Jan 6 WAL-MART #1981 $60.00\n"),
    );
    expect(parsed.statements).toHaveLength(1);
    expect(parsed.statements[0]).toEqual(
      expect.objectContaining({
        externalKey: "3448",
        periodStart: "2025-12-22",
        periodEnd: "2026-01-21",
        statementDate: "2026-01-21",
        openingBalanceCents: -1000,
        closingBalanceCents: -5000,
        paymentDueDate: "2026-02-15",
        minimumPaymentCents: 2500,
        creditLimitCents: 1650000,
        availableCreditCents: 1645000,
        paymentsCreditsCents: 2000,
        purchasesCents: -6000,
        rewardsPoints: 1200,
      }),
    );
    expect(parsed.statements[0].rates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ balanceType: "Purchases", aprPercent: 25.49 }),
      ]),
    );
  });

  it("still writes a snapshot when the cycle has no purchases", () => {
    const parsed = ok(
      "Statement_082019_3448.pdf",
      [
        "Account Summary",
        "Previous Balance $0.00",
        "Payments $0.00",
        "Other Credits $0.00",
        "Transactions + $0.00",
        "Cash Advances + $0.00",
        "Fees Charged + $0.00",
        "Interest Charged + $0.00",
        "New Balance = $0.00",
        "Credit Limit $1,000.00",
        "www.capitalone.com.",
        "Payment Due Date",
        "Sep. 15, 2019",
        "Minimum Payment Due",
        "$0.00",
        "Visa Platinum Account Ending in 1750",
        "Aug. 07, 2019 - Aug. 18, 2019 | 12 days in Billing Cycle",
        "LEE M EXAMPLE #1750: Payments, Credits and Adjustments",
        "LEE M EXAMPLE #1750: Transactions",
      ].join("\n"),
    );
    expect(parsed.accounts[0].transactions).toEqual([]);
    expect(parsed.statements[0]).toEqual(
      expect.objectContaining({
        periodStart: "2019-08-07",
        periodEnd: "2019-08-18",
        openingBalanceCents: 0,
        closingBalanceCents: 0,
      }),
    );
    expect(parsed.errors.filter((e) => /does not equal/.test(e.message))).toEqual([]);
  });

  it("warns when opening plus activity does not equal closing", () => {
    const parsed = ok(
      "Statement_012026_3448.pdf",
      modernStatement("Jan 5 Jan 6 WAL-MART #1981 $10.00\n"),
    );
    expect(parsed.errors.some((e) => /does not equal/.test(e.message))).toBe(true);
  });
});
