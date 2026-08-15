import { describe, expect, it } from "vitest";
import {
  btcSatsFromDescription,
  formatBtcFromSats,
  looksLikeCoinbaseCsv,
  parseCoinbaseCsv,
} from "./coinbaseCsv";

/**
 * Real preamble + header + the rows that encode the two parser traps: a truncated
 * withdrawal (`360 Chec... ****2322`), a withdrawal whose Subtotal ≠ Total, and a
 * Sell that must inherit the bank-received amount rather than its own Total.
 */
const SNIPPET = `
Transactions
User,Lee Raulin,0b7043a7-af9a-5c5c-bb18-6e15b4e0267e
ID,Timestamp,Transaction Type,Asset,Quantity Transacted,Price Currency,Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes,Sender Address,Recipient Address
698242c1ff3a8c113e3fa72f,2026-02-03 18:47:29 UTC,Withdrawal,USD,-1517,USD,$1.00,$1517.00,$1517.00,$0.00,Withdrawal to Capital One - 360 Chec... ****2322,,
698242730d7d7d5fcce96cb7,2026-02-03 18:46:11 UTC,Sell,BTC,-0.02126381,USD,$73455.055,$1546.42,$1517.42,-15.62,Sold 0.02126381 BTC for 1517.42 USD,,
69208a086de97d7c7fa20f86,2025-11-21 15:49:28 UTC,Withdrawal,USD,-490.62,USD,$1.00,$482.03,$490.62,$8.59,Withdrawal to Capital One - 360 Checking:****2322,,
6920893e19671f5b110c7b58,2025-11-21 15:46:06 UTC,Sell,BTC,-0.00606489,USD,$83281.44,$500.00,$490.62,-5,Sold 0.00606489 BTC for 490.62 USD,,
63854c7b3aea980001a75d2a,2022-11-29 00:04:11 UTC,Buy,BTC,0.00202835,USD,$16194.665,$32.84845,$35.00,0.16155124725,Bought 0.00202835 BTC for 35 USD using bank account PenFed Credit Union - ... ******2021,,
6536728d77d9eab11b791711,2023-10-23 13:18:05 UTC,Send,BTC,-0.01304335,USD,$30702.2761900010362018,-$400.46053,-$400.46053,$0.00,Sent 0.01304335 BTC to bc1q7ywxwv928qxr0qs7dsfaj44fpxq6mvceha42t9,,bc1q7ywxwv928qxr0qs7dsfaj44fpxq6mvceha42t9
689a3fa4732c9698113d365e,2025-08-11 19:08:20 UTC,Retail Mgx Dex Trade,BTC,-0.00008391,USD,$119056.1315695387915624,-$9.99,-$9.93757,0.050262,,,
689a3fa5993f9698113d3660,2025-08-11 19:08:21 UTC,Retail Mgx Dex Trade,USDC,9.992169,USD,$1.00,$9.99,$10.04243,0.05243,,,
67d6d09d3bc291b64c9b4c1e,2025-03-16 13:22:37 UTC,Withdrawal,USD,-1962.5,USD,$1.00,$1962.50,$1962.50,$0.00,Withdrawal to Capital One - 360 Chec... ****2322,,
67d6d0085de67d7c7fa20f86,2025-03-16 13:20:08 UTC,Sell,BTC,-0.02437589,USD,$82050.00,$2000.00,$1962.50,-18.75,Sold 0.02437589 BTC for 1962.5 USD,,
`;

function parsed() {
  const result = parseCoinbaseCsv("coinbase.csv", SNIPPET);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.parsed;
}

function byId(id: string) {
  const row = parsed().accounts[0]?.transactions.find(
    (entry) => entry.externalId === id,
  );
  expect(row, id).toBeDefined();
  return row!;
}

describe("looksLikeCoinbaseCsv", () => {
  it("recognises the real preamble and header", () => {
    expect(looksLikeCoinbaseCsv(SNIPPET)).toBe(true);
  });

  it("rejects a bank CSV", () => {
    expect(
      looksLikeCoinbaseCsv(
        "Account Number,Transaction Description,Transaction Date,Transaction Type,Transaction Amount,Balance\n",
      ),
    ).toBe(false);
  });
});

describe("parseCoinbaseCsv", () => {
  it("skips the preamble and keys the account from the User line", () => {
    const { feed, accounts } = parsed();
    expect(feed).toBe("csv:coinbase");
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      externalKey: "0b7043a7-af9a-5c5c-bb18-6e15b4e0267e",
      name: "Coinbase",
      kind: "investment",
    });
  });

  it("uses the withdrawal Subtotal, not Total, so it can pair with checking", () => {
    // Total is $490.62; the bank received $482.03. Pairing on Total would miss.
    expect(byId("69208a086de97d7c7fa20f86")).toMatchObject({
      transactionDate: "2025-11-21",
      amountCents: -48203,
    });
  });

  it("gives the preceding Sell the same dollars the bank received", () => {
    // Sell Total is $1,517.42; checking deposited $1,517.00. The Sell carries
    // the bank figure so Coinbase's two USD legs cancel and cash flow still
    // sees the liquidation.
    expect(byId("698242730d7d7d5fcce96cb7").amountCents).toBe(151700);
    expect(byId("698242c1ff3a8c113e3fa72f").amountCents).toBe(-151700);
  });

  it("names the checking last four even when Coinbase truncated the account", () => {
    expect(byId("698242c1ff3a8c113e3fa72f").description).toContain("XXXX2322");
  });

  it("keeps crypto rows at $0 so they do not invent a household balance", () => {
    expect(byId("63854c7b3aea980001a75d2a").amountCents).toBe(0);
    expect(byId("6536728d77d9eab11b791711").amountCents).toBe(0);
    expect(byId("689a3fa4732c9698113d365e").amountCents).toBe(0);
    expect(byId("689a3fa5993f9698113d3660").amountCents).toBe(0);
  });

  it("pairs every same-day Sell with its withdrawal at the bank figure", () => {
    expect(byId("67d6d0085de67d7c7fa20f86").amountCents).toBe(196250);
    expect(byId("67d6d09d3bc291b64c9b4c1e").amountCents).toBe(-196250);
  });

  it("puts the signed BTC quantity in the description", () => {
    expect(byId("698242730d7d7d5fcce96cb7").description).toContain("-0.02126381 BTC");
    expect(byId("63854c7b3aea980001a75d2a").description).toContain("0.00202835 BTC");
  });

  it("returns nothing useful for a file that is not Coinbase", () => {
    const result = parseCoinbaseCsv("budget.csv", "Date,Note,Value\n2026-01-01,x,1\n");
    expect(result.ok).toBe(false);
  });
});

describe("btcSatsFromDescription", () => {
  it("sums a closed history to zero satoshis", () => {
    // The real 90 BTC rows net to 0.00000000. A float sum of the same numbers
    // reports -0.00000000, which is why this is integer sats.
    const descriptions = [
      "Coinbase Buy 0.02126381 BTC",
      "Coinbase Sell -0.02126381 BTC",
      "Coinbase Buy 0.00008391 BTC",
      "Coinbase Retail Mgx Dex Trade -0.00008391 BTC",
    ];
    const total = descriptions.reduce(
      (sum, description) => sum + btcSatsFromDescription(description),
      BigInt(0),
    );
    expect(formatBtcFromSats(total)).toBe("0.00000000");
  });
});
