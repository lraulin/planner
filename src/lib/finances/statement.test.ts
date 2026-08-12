import { describe, expect, it } from "vitest";
import { parseCapitalOne360Statement } from "./statement";

function ok(fileName: string, text: string) {
  const result = parseCapitalOne360Statement(fileName, text);
  if (!result.ok) throw new Error(`expected a parse, got: ${result.error}`);
  return result.parsed;
}

/** Cover + one checking ledger. Names and account numbers are invented. */
function statement(body: string): string {
  return [
    "Page 1 of 2",
    "capitalone.com 1-888-464-0727 P.O. Box 85123, Richmond, VA 23285",
    "Pat Example",
    "Here's your bank statement.January 2024 STATEMENT PERIOD",
    "Jan 1 - Jan 31, 2024",
    "$100.00 TOTAL ENDING BALANCE",
    "IN ALL ACCOUNTS",
    "360 Checking - 111111112322",
    "0.10% $0.00 31",
    "ANNUAL PERCENTAGE YIELD",
    "(APY) EARNED YTD INTEREST AND BONUSES DAYS IN STATEMENT",
    "CYCLE",
    "STATEMENT PERIOD",
    "Jan 1 - Jan 31, 2024",
    "Pat Example",
    "Page 2 of 2",
    "capitalone.com 1-888-464-0727 P.O. Box 85123, Richmond, VA 23285",
    "DATE DESCRIPTION CATEGORY AMOUNT BALANCE",
    body,
    "If anything in your statement looks incorrect, please let us know immediately.",
    "",
  ].join("\n");
}

describe("parseCapitalOne360Statement", () => {
  it("rejects a PDF that is not a 360 monthly statement", () => {
    const result = parseCapitalOne360Statement(
      "taxes.pdf",
      "Form 1040\nDepartment of the Treasury\n",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("taxes.pdf");
    expect(result.error).toContain("360 monthly statement");
  });

  it("joins a wrapped description and keeps Credit/Debit out of sourceCategory", () => {
    const parsed = ok(
      "Statement_2024-01.pdf",
      statement(
        [
          "Jan 1 Opening Balance $10.00",
          "Jan 12 Deposit from PENTAGON FEDERAL TRNSFR CR",
          "000005440453016 Credit + $133.02 $143.02",
          "Jan 31 Monthly Interest Paid Credit + $0.04 $143.06",
          "Jan 31 Closing Balance $143.06",
        ].join("\n"),
      ),
    );

    expect(parsed.feed).toBe("csv:capitalone-bank");
    expect(parsed.accounts).toHaveLength(1);
    expect(parsed.accounts[0]).toMatchObject({
      externalKey: "2322",
      kind: "checking",
      name: "360 Checking •••2322",
    });
    expect(parsed.accounts[0].transactions).toEqual([
      expect.objectContaining({
        transactionDate: "2024-01-12",
        postedDate: null,
        description: "Deposit from PENTAGON FEDERAL TRNSFR CR 000005440453016",
        amountCents: 13302,
        sourceCategory: "",
        balanceAfterCents: 14302,
      }),
      expect.objectContaining({
        transactionDate: "2024-01-31",
        description: "Monthly Interest Paid",
        amountCents: 4,
      }),
    ]);
    expect(parsed.errors).toEqual([]);
  });

  it("skips opening, closing, rejected withdrawals, and rate-change notes", () => {
    const parsed = ok(
      "Statement_2024-01.pdf",
      statement(
        [
          "Jan 1 Opening Balance $100.00",
          "Jan 3 Withdrawal for $1207.4 was Rejected $100.00",
          "Jan 6 Interest Rate Change from 4.218% to 4.266% $100.00",
          "Jan 10 Withdrawal from CHASE CREDIT CRD EPAY Debit - $20.00 $80.00",
          "Jan 31 Closing Balance $80.00",
        ].join("\n"),
      ),
    );

    expect(parsed.accounts[0].transactions).toHaveLength(1);
    expect(parsed.accounts[0].transactions[0].amountCents).toBe(-2000);
    expect(parsed.errors.map((e) => e.message)).toEqual([
      'Skipped informational row "Withdrawal for $1207.4 was Rejected".',
      'Skipped informational row "Interest Rate Change from 4.218% to 4.266%".',
    ]);
  });

  it("continues a table across a reprinted page header", () => {
    const parsed = ok(
      "Statement_2024-01.pdf",
      statement(
        [
          "Jan 1 Opening Balance $50.00",
          "Jan 8 Withdrawal from CAPITAL ONE MOBILE PMT Debit - $10.00 $40.00",
          "STATEMENT PERIOD",
          "Jan 1 - Jan 31, 2024",
          "Pat Example",
          "Page 3 of 4",
          "capitalone.com 1-888-464-0727 P.O. Box 85123, Richmond, VA 23285",
          "DATE DESCRIPTION CATEGORY AMOUNT BALANCE",
          "Jan 9 Deposit from PAYROLL Credit + $30.00 $70.00",
          "Jan 31 Closing Balance $70.00",
        ].join("\n"),
      ),
    );

    expect(parsed.accounts[0].transactions.map((t) => t.description)).toEqual([
      "Withdrawal from CAPITAL ONE MOBILE PMT",
      "Deposit from PAYROLL",
    ]);
    expect(parsed.errors).toEqual([]);
  });

  it("reads a negative running balance and a three-line reversal wrap", () => {
    const parsed = ok(
      "Statement_2024-07.pdf",
      statement(
        [
          "Jan 1 Opening Balance $10.00",
          "Jan 23 Withdrawal from PAYPAL Debit - $15.00 - $5.00",
          "Jan 28 Preauthorized Deposit from PENTAGON FEDERAL CREDIT",
          "UNION checking account XXXXXX2021 Reversal",
          "Effective: 12/26/2023 Debit - $5.10 - $10.10",
          "Jan 31 Closing Balance - $10.10",
        ].join("\n"),
      ),
    );

    expect(parsed.accounts[0].transactions).toEqual([
      expect.objectContaining({
        description: "Withdrawal from PAYPAL",
        amountCents: -1500,
        balanceAfterCents: -500,
      }),
      expect.objectContaining({
        description:
          "Preauthorized Deposit from PENTAGON FEDERAL CREDIT UNION checking account XXXXXX2021 Reversal Effective: 12/26/2023",
        amountCents: -510,
        balanceAfterCents: -1010,
      }),
    ]);
    expect(parsed.errors).toEqual([]);
  });

  it("parses every account on a combined statement and marks a CD close-out", () => {
    const text = [
      "Page 1 of 3",
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
      "Jul 25 Deposit from CD XXXXXXX2957 Credit + $100.00 $120.00",
      "Jul 31 Closing Balance $120.00",
      "CD - 111111112957",
      "DATE DESCRIPTION CATEGORY AMOUNT BALANCE",
      "Jul 1 Opening Balance $99.00",
      "Jul 25 Interest Paid Credit + $1.00 $100.00",
      "Jul 25 CD Close-Out to 360 Performance Savings XXXXXXX2603 Debit - $100.00 $0.00",
      "Jul 25 Closing Balance $0.00",
      "If anything in your statement looks incorrect, please let us know immediately.",
    ].join("\n");

    const parsed = ok("Statement_2024-07.pdf", text);
    expect(parsed.accounts.map((a) => [a.kind, a.externalKey, a.closedOn])).toEqual([
      ["checking", "2322", null],
      ["savings", "2603", null],
      ["investment", "2957", "2024-07-25"],
    ]);
    expect(parsed.accounts[2].transactions[1].description).toContain("CD Close-Out");
    expect(parsed.errors).toEqual([]);
    expect(parsed.statements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalKey: "2322",
          openingBalanceCents: 1000,
          closingBalanceCents: 1010,
          rates: [],
        }),
        expect.objectContaining({
          externalKey: "2957",
          closingBalanceCents: 0,
        }),
      ]),
    );
  });

  it("uses the period year so Jul 8 is not a Date-parsed local midnight", () => {
    const parsed = ok(
      "Statement_2023-07.pdf",
      [
        "Here's your bank statement.July 2023 STATEMENT PERIOD",
        "Jul 22 - Jul 31, 2023",
        "360 Checking - 111111112322",
        "DATE DESCRIPTION CATEGORY AMOUNT BALANCE",
        "Jul 22 Opening Balance $0.00",
        "Jul 24 Deposit from TRANSFER Credit + $2,000.00 $2,000.00",
        "Jul 31 Closing Balance $2,000.00",
        "If anything in your statement looks incorrect, please let us know immediately.",
      ].join("\n"),
    );
    expect(parsed.accounts[0].transactions[0].transactionDate).toBe("2023-07-24");
  });

  it("warns when a section does not reconcile instead of failing the file", () => {
    const parsed = ok(
      "Statement_2024-01.pdf",
      statement(
        [
          "Jan 1 Opening Balance $10.00",
          "Jan 10 Deposit from PAYROLL Credit + $5.00 $15.00",
          "Jan 31 Closing Balance $99.00",
        ].join("\n"),
      ),
    );
    expect(parsed.accounts[0].transactions).toHaveLength(1);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0].message).toContain("does not equal");
    expect(parsed.errors[0].message).toContain("360 Checking •••2322");
  });
});
