import { describe, expect, it } from "vitest";
import { parsePaypalStatement } from "./paypalStatement";

/**
 * Every string below is lifted from the extracted text of a real statement, including the
 * page furniture and the mid-token line breaks. Both failures this module exists to prevent
 * — counting each payment twice, and skipping the ones whose date wrapped — are invisible to
 * a fixture that has been tidied up first.
 */

/** March 2025: a wrapped date, an FX charge, a bank-funded payment, and a page break. */
const MARCH = `Statement Period PayPal Account ID
Mar 1, 2025 - Mar 31,
2025
leeraulin@gmail.com
This document contains two statements
PAYPAL ACCOUNT
ACCOUNT ACTIVITY
DATE DESCRIPTION CURRENCY AMOUNT FEES TOTAL*
03/04/202
5 PreApproved Payment Bill User Payment:
Apple Services
ID: 71190486UY7787711
USD -13.78 0.00 -13.78
03/04/202
5 General Credit Card Deposit
ID: 3D3404036K7127158
Ref ID: 71190486UY7787711
USD 13.78 0.00 13.78
03/13/2025 PreApproved Payment Bill User Payment:
Spotify USA Inc
ID: 01J29346U2703072N
USD -18.01 0.00 -18.01
03/14/2025 PreApproved Payment Bill User Payment:
Paddle.com Market Limited
9.56 USD X 0.7397 (Exchange Rate) 7.07
GBP
ID: 86E59173M7857924P
GBP -7.07 0.00 -7.07
ACCOUNT STATEMENTS
Raulin, Lee
Page 1
*For each transaction in your Account Activity, the Total equals the amount sent or received, plus or minus any Fees.
Statement Period PayPal Account ID
Mar 1, 2025 - Mar 31,
2025
leeraulin@gmail.com
PAYPAL ACCOUNT
ACCOUNT ACTIVITY
DATE DESCRIPTION CURRENCY AMOUNT FEES TOTAL*
03/14/2025 PreApproved Payment Bill User Payment:
Pluralsight, LLC
CAPITAL ONE N.A. - Checking x-2322
237.44 USD
ID: 9L101567DS004820M
USD -237.44 0.00 -237.44
03/15/2025 PreApproved Payment Bill User Payment:
Sony Interactive Entertainment Network
America LLC
ID: 5TR11902WX9012345
USD -9.99 0.00 -9.99
PAYPAL BALANCE ACCOUNT
USD
Available beginning 0.00
ACCOUNT ACTIVITY
DATE DESCRIPTION CURRENCY AMOUNT FEES TOTALºº
03/13/2025 PreApproved Payment Bill User Payment:
Spotify USA Inc
ID: 01J29346U2703072N
USD -18.01 0.00 -18.01
`;

/** April 2025: the $2,000 from Lee's father, and the withdrawal that moved it to checking. */
const APRIL = `Statement Period PayPal Account ID
Apr 1, 2025 - Apr 30,
2025
leeraulin@gmail.com
PAYPAL ACCOUNT
ACCOUNT ACTIVITY
DATE DESCRIPTION CURRENCY AMOUNT FEES TOTAL*
04/20/202
5 General Payment: Dennis Raulin
ID: 0LT3288171837814B
USD 2,000.00 0.00 2,000.00
04/20/202
5 User Initiated Withdrawal
CAPITAL ONE N.A. - Checking x-2322
PayPal Balance -2,000.00 USD
ID: 67G495071Y8716611
USD -2,000.00 0.00 -2,000.00
PAYPAL BALANCE ACCOUNT
ACCOUNT ACTIVITY
04/20/202
5 General Payment: Dennis Raulin
ID: 0LT3288171837814B
USD 2,000.00 0.00 2,000.00
`;

describe("parsePaypalStatement", () => {
  it("reads each transaction once, ignoring the duplicate Balance statement", () => {
    const entries = parsePaypalStatement(MARCH);
    const ids = entries.map((entry) => entry.externalId);
    // Spotify is listed in both statements; it must appear once.
    expect(ids.filter((id) => id === "01J29346U2703072N")).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reads a record whose date wrapped mid-token", () => {
    const entries = parsePaypalStatement(MARCH);
    const apple = entries.find((entry) => entry.externalId === "71190486UY7787711");
    expect(apple).toMatchObject({
      date: "2025-03-04",
      kind: "payment",
      counterparty: "Apple Services",
      amountCents: -1378,
    });
  });

  it("pairs a card funding leg back to the payment it covers", () => {
    const entries = parsePaypalStatement(MARCH);
    expect(
      entries.find((entry) => entry.externalId === "3D3404036K7127158"),
    ).toMatchObject({
      kind: "card_funding",
      refId: "71190486UY7787711",
      amountCents: 1378,
    });
  });

  it("names the bank that funded a payment, which is all the bank feed will not say", () => {
    const entries = parsePaypalStatement(MARCH);
    expect(
      entries.find((entry) => entry.externalId === "9L101567DS004820M"),
    ).toMatchObject({
      kind: "payment",
      counterparty: "Pluralsight, LLC",
      fundingKey: "2322",
      amountCents: -23744,
    });
  });

  it("takes the USD side of a foreign charge, not the foreign total", () => {
    const entries = parsePaypalStatement(MARCH);
    // The total column says GBP -7.07; the card was debited $9.56, and only the dollar
    // figure can ever match the row on the card.
    expect(
      entries.find((entry) => entry.externalId === "86E59173M7857924P"),
    ).toMatchObject({
      counterparty: "Paddle.com Market Limited",
      amountCents: -956,
    });
  });

  it("joins a merchant name the extractor split across two lines", () => {
    const entries = parsePaypalStatement(MARCH);
    expect(
      entries.find((entry) => entry.externalId === "5TR11902WX9012345"),
    ).toMatchObject({
      counterparty: "Sony Interactive Entertainment Network America LLC",
    });
  });

  it("calls an inbound person-to-person payment a receipt, and names the sender", () => {
    const entries = parsePaypalStatement(APRIL);
    expect(
      entries.find((entry) => entry.externalId === "0LT3288171837814B"),
    ).toMatchObject({
      date: "2025-04-20",
      kind: "receipt",
      counterparty: "Dennis Raulin",
      amountCents: 200000,
    });
  });

  it("reads the withdrawal that moved that money to the bank", () => {
    const entries = parsePaypalStatement(APRIL);
    expect(
      entries.find((entry) => entry.externalId === "67G495071Y8716611"),
    ).toMatchObject({
      kind: "withdrawal",
      fundingKey: "2322",
      amountCents: -200000,
    });
  });

  it("returns nothing for a file that is not a PayPal statement", () => {
    expect(
      parsePaypalStatement("Capital One 360 Checking\nDate,Description,Amount"),
    ).toEqual([]);
  });
});
