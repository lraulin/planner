import { describe, expect, it } from "vitest";
import {
  looksLikeChaseCreditStatement,
  normalizeChaseMerchant,
  parseChaseCreditStatement,
} from "./chaseStatement";

function ok(fileName: string, text: string) {
  const result = parseChaseCreditStatement(fileName, text);
  if (!result.ok) throw new Error(`expected a parse, got: ${result.error}`);
  return result.parsed;
}

/**
 * Invented Prime Visa extract — same visual dump shape as the real PDFs, no real
 * name, address, or PAN.
 */
function statement(body: string, extras = ""): string {
  return [
    "Manage your account online:",
    "Payment Due Date: 02/15/24",
    "New Balance: $50.00",
    "Minimum Payment Due: $35.00",
    "www.chase.com/cardhelp",
    "Account Number: XXXX XXXX XXXX 4903",
    "New Balance $50.00",
    "Past Due Amount $0.00",
    "Balance over the Credit Access Line $0.00",
    "Previous Balance $10.00",
    "Payment, Credits -$20.00",
    "Purchases +$60.00",
    "Cash Advances $0.00",
    "Balance Transfers $0.00",
    "Fees Charged $0.00",
    "Interest Charged $0.00",
    "Opening/Closing Date 12/19/23 - 01/18/24",
    "Credit Access Line $6,000",
    "Available Credit $5,950",
    "YOUR PRIME VISA POINTS",
    "Total points available for",
    "redemption 1,200",
    "ACCOUNT ACTIVITY",
    "Page 2 of 3 Statement Date: 01/18/24",
    "Date of",
    "Transaction Merchant Name or Transaction Description $ Amount",
    body,
    extras,
    "Total fees charged in 2024 $0.00",
    "Total interest charged in 2024 $0.00",
    "Purchases 24.99%(v)(d) - 0 - - 0 -",
    "Cash Advances 29.99%(v)(d) - 0 - - 0 -",
    "Balance Transfers 24.99%(v)(d) - 0 - - 0 -",
    "",
  ].join("\n");
}

describe("normalizeChaseMerchant", () => {
  it("strips the Amazon bill suffix and state the CSV does not have", () => {
    expect(normalizeChaseMerchant("AMAZON MKTPL*0W88L1N43 Amzn.com/bill WA")).toBe(
      "AMAZON MKTPL*0W88L1N43",
    );
    expect(normalizeChaseMerchant("Prime Video *3936J6023 888-802-3080 WA")).toBe(
      "Prime Video *3936J6023",
    );
  });
});

describe("parseChaseCreditStatement", () => {
  it("rejects a PDF that is not a Chase card statement", () => {
    const result = parseChaseCreditStatement(
      "taxes.pdf",
      "Form 1040\nDepartment of the Treasury\n",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("taxes.pdf");
    expect(result.error).toContain("Chase Prime Visa");
  });

  it("does not treat a 360 bank statement as Chase", () => {
    expect(
      looksLikeChaseCreditStatement(
        "Here's your bank statement. STATEMENT PERIOD\n360 Checking - 111111112322\n",
      ),
    ).toBe(false);
  });

  it("requires the last four in the filename, not the printed PAN", () => {
    const result = parseChaseCreditStatement(
      "monthly.pdf",
      statement(
        "01/02 Payment Thank You-Mobile -20.00\n01/05 AMAZON MKTPL*AA1 Amzn.com/bill WA 60.00\n",
      ),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("filename");
  });

  it("flips signs, drops order-number wraps, and lands on the filename key", () => {
    const parsed = ok(
      "20240118-statements-9910-.pdf",
      statement(
        [
          "01/02 Payment Thank You-Mobile -20.00",
          "12/21 Prime Video *3936J6023 888-802-3080 WA 4.55",
          "Order Number D01-0359202-8809829",
          "01/05 AMAZON MKTPL*AA1 Amzn.com/bill WA 55.45",
        ].join("\n"),
      ),
    );

    expect(parsed.feed).toBe("csv:chase-credit");
    expect(parsed.accounts).toHaveLength(1);
    expect(parsed.accounts[0].externalKey).toBe("9910");
    expect(parsed.accounts[0].kind).toBe("credit_card");
    expect(parsed.accounts[0].transactions).toEqual([
      expect.objectContaining({
        transactionDate: "2024-01-02",
        postedDate: null,
        description: "Payment Thank You-Mobile",
        amountCents: 2000,
        sourceCategory: "Payment",
      }),
      expect.objectContaining({
        transactionDate: "2023-12-21",
        description: "Prime Video *3936J6023",
        amountCents: -455,
        sourceCategory: "Purchase",
      }),
      expect.objectContaining({
        transactionDate: "2024-01-05",
        description: "AMAZON MKTPL*AA1",
        amountCents: -5545,
      }),
    ]);
    expect(
      parsed.accounts[0].transactions.some((row) =>
        /Order Number/i.test(row.description),
      ),
    ).toBe(false);
  });

  it("does not create an account from the printed 4903 PAN", () => {
    const parsed = ok(
      "20240118-statements-9910-.pdf",
      statement(
        "01/02 Payment Thank You-Mobile -20.00\n01/05 AMAZON MKTPL*AA1 Amzn.com/bill WA 60.00\n",
      ),
    );
    expect(parsed.accounts[0].externalKey).toBe("9910");
    expect(parsed.accounts.map((a) => a.externalKey)).not.toContain("4903");
  });

  it("skips Shop-with-Points restatement rows and still imports LATE FEE", () => {
    const parsed = ok(
      "20241218-statements-9910-.pdf",
      statement(
        [
          "01/02 Payment Thank You-Mobile -20.00",
          "01/05 AMAZON MKTPL*AA1 Amzn.com/bill WA 31.42",
          "12/15 LATE FEE 28.00",
          "12/18 PURCHASE INTEREST CHARGE 0.58",
        ].join("\n"),
        [
          "Split Transaction",
          "Date of",
          "Transaction Merchant Name or Transaction Description $ Amount Rewards",
          "11/23 AMAZON DIGITAL SVCS 866-216-1072 WA 4.23 423",
          "SHOP WITH POINTS ACTIVITY",
        ].join("\n"),
      ),
    );

    const descriptions = parsed.accounts[0].transactions.map((row) => row.description);
    expect(descriptions).toContain("LATE FEE");
    expect(descriptions).toContain("PURCHASE INTEREST CHARGE");
    expect(descriptions.some((d) => /DIGITAL SVCS/i.test(d))).toBe(false);
    expect(
      parsed.accounts[0].transactions.find((row) => row.description === "LATE FEE"),
    ).toEqual(
      expect.objectContaining({
        amountCents: -2800,
        sourceCategory: "Fee",
        transactionDate: "2023-12-15",
      }),
    );
  });

  it("parses a leading-dot amount so a $0.10 purchase is not dropped", () => {
    const parsed = ok(
      "20241218-statements-9910-.pdf",
      statement(
        [
          "01/02 Payment Thank You-Mobile -20.00",
          "12/01 Amazon.com*ZL06K1J30 Amzn.com/bill WA .10",
          "01/05 AMAZON MKTPL*AA1 Amzn.com/bill WA 59.90",
        ].join("\n"),
      ),
    );
    expect(parsed.accounts[0].transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "Amazon.com*ZL06K1J30",
          amountCents: -10,
        }),
      ]),
    );
    expect(parsed.errors.filter((e) => /does not equal/.test(e.message))).toEqual([]);
  });

  it("stores opening and closing in the module sign and fills card fields", () => {
    const parsed = ok(
      "20240118-statements-9910-.pdf",
      statement(
        "01/02 Payment Thank You-Mobile -20.00\n01/05 AMAZON MKTPL*AA1 Amzn.com/bill WA 60.00\n",
      ),
    );
    expect(parsed.statements).toHaveLength(1);
    expect(parsed.statements[0]).toEqual(
      expect.objectContaining({
        externalKey: "9910",
        periodStart: "2023-12-19",
        periodEnd: "2024-01-18",
        statementDate: "2024-01-18",
        openingBalanceCents: -1000,
        closingBalanceCents: -5000,
        paymentDueDate: "2024-02-15",
        minimumPaymentCents: 3500,
        pastDueAmountCents: 0,
        creditLimitCents: 600000,
        availableCreditCents: 595000,
        paymentsCreditsCents: 2000,
        purchasesCents: -6000,
        rewardsPoints: 1200,
      }),
    );
    expect(parsed.statements[0].creditLimitCents).not.toBe(0);
    expect(parsed.statements[0].rates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ balanceType: "Purchases", aprPercent: 24.99 }),
      ]),
    );
  });

  it("keeps two purchase APRs when the rate changed mid-cycle", () => {
    const parsed = ok(
      "20250718-statements-9910-.pdf",
      statement(
        "01/02 Payment Thank You-Mobile -20.00\n01/05 AMAZON MKTPL*AA1 Amzn.com/bill WA 60.00\n",
        [
          "Purchases prior to 07/09/2025 23.99%(v)(d) - 0 - - 0 -",
          "Purchases 27.24%(v)(d) - 0 - - 0 -",
        ].join("\n"),
      ),
    );
    const purchaseRates = parsed.statements[0].rates.filter((r) =>
      r.balanceType.startsWith("Purchases"),
    );
    expect(purchaseRates.map((r) => r.aprPercent).sort()).toEqual([
      23.99, 24.99, 27.24,
    ]);
  });

  it("warns when opening plus activity does not equal closing", () => {
    const parsed = ok(
      "20240118-statements-9910-.pdf",
      statement("01/05 AMAZON MKTPL*AA1 Amzn.com/bill WA 10.00\n"),
    );
    expect(parsed.errors.some((e) => /does not equal/.test(e.message))).toBe(true);
  });
});
