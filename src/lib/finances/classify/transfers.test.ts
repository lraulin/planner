import { describe, expect, it } from "vitest";
import { matchTransfers, type TransferAccount, type TransferRow } from "./transfers";

const ACCOUNTS: TransferAccount[] = [
  { id: "checking", externalKey: "2322" },
  { id: "savings", externalKey: "2603" },
  { id: "capone-card", externalKey: "3448" },
  { id: "chase-card", externalKey: "9910" },
  { id: "coinbase", externalKey: "0b7043a7-af9a-5c5c-bb18-6e15b4e0267e" },
];

function row(
  id: string,
  accountId: string,
  transactionDate: string,
  description: string,
  amountCents: number,
): TransferRow {
  return { id, accountId, transactionDate, description, amountCents };
}

describe("matchTransfers", () => {
  it("pairs the two legs a description names outright", () => {
    // Signal 1: Capital One writes the counterparty's masked number into the description.
    const rows = [
      row(
        "a",
        "savings",
        "2024-01-27",
        "Withdrawal to 360 Checking XXXXXXX2322",
        -500000,
      ),
      row(
        "b",
        "checking",
        "2024-01-27",
        "Deposit from 360 Performance Savings XXXXXXX2603",
        500000,
      ),
    ];
    const result = matchTransfers(rows, ACCOUNTS);

    expect(result.flows.get("a")).toBe("internal_transfer");
    expect(result.flows.get("b")).toBe("internal_transfer");
    expect(result.groups).toEqual([["a", "b"]]);
  });

  it("pairs a card payment across the few days it takes to post", () => {
    const rows = [
      row(
        "bank",
        "checking",
        "2026-03-09",
        "Withdrawal from CHASE CREDIT CRD EPAY",
        -48120,
      ),
      row("card", "chase-card", "2026-03-11", "Payment Thank You-Mobile", 48120),
    ];
    const result = matchTransfers(rows, ACCOUNTS);

    expect(result.groups).toEqual([["bank", "card"]]);
    expect(result.flows.get("card")).toBe("internal_transfer");
  });

  it("classifies an unpaired card payment as a transfer anyway", () => {
    // The Capital One card was imported two years after payments to it began, so 113 of
    // these have no counterpart in the data. Requiring a partner would leave $109,248
    // counted as spending.
    const rows = [
      row(
        "lonely",
        "checking",
        "2024-04-18",
        "Withdrawal from CAPITAL ONE MOBILE PMT",
        -236290,
      ),
    ];
    const result = matchTransfers(rows, ACCOUNTS);

    expect(result.flows.get("lonely")).toBe("internal_transfer");
    expect(result.groups).toEqual([]);
  });

  it("matches the card's PYMT spelling to the bank's PMT spelling", () => {
    const rows = [
      row(
        "bank",
        "checking",
        "2026-03-11",
        "Withdrawal from CAPITAL ONE ONLINE PMT",
        -427040,
      ),
      row("card", "capone-card", "2026-03-11", "CAPITAL ONE ONLINE PYMT", 427040),
    ];
    const result = matchTransfers(rows, ACCOUNTS);
    expect(result.groups).toEqual([["bank", "card"]]);
  });

  it("does not pair two unrelated rows that merely agree on amount", () => {
    // Neither says anything about a transfer, so nothing may pair them.
    const rows = [
      row("buy", "chase-card", "2026-01-05", "CHIPOTLE MEX GR ONLINE", -2500),
      row("refund", "capone-card", "2026-01-06", "Amazon.com", 2500),
    ];
    const result = matchTransfers(rows, ACCOUNTS);

    expect(result.groups).toEqual([]);
    expect(result.flows.size).toBe(0);
  });

  it("does not pair legs further apart than the posting window", () => {
    const rows = [
      row(
        "bank",
        "checking",
        "2026-03-01",
        "Withdrawal from CHASE CREDIT CRD EPAY",
        -10000,
      ),
      row("card", "chase-card", "2026-03-20", "Payment Thank You-Mobile", 10000),
    ];
    const result = matchTransfers(rows, ACCOUNTS);

    expect(result.groups).toEqual([]);
    // Both still read as transfers on their own wording.
    expect(result.flows.get("bank")).toBe("internal_transfer");
    expect(result.flows.get("card")).toBe("internal_transfer");
  });

  it("never pairs two rows on the same account", () => {
    const rows = [
      row("out", "checking", "2026-03-01", "Paycheck Percentage Transfer", -51007),
      row("in", "checking", "2026-03-01", "Paycheck Percentage Transfer", 51007),
    ];
    const result = matchTransfers(rows, ACCOUNTS);
    expect(result.groups).toEqual([]);
  });

  it("honours the named counterparty over a closer wrong-account match", () => {
    const rows = [
      row(
        "out",
        "savings",
        "2024-01-27",
        "Withdrawal to 360 Checking XXXXXXX2322",
        -100000,
      ),
      // Same amount, same day, but the description named checking, not the card.
      row("decoy", "chase-card", "2024-01-27", "Payment Thank You-Mobile", 100000),
      row(
        "right",
        "checking",
        "2024-01-29",
        "Deposit from 360 Performance Savings",
        100000,
      ),
    ];
    const result = matchTransfers(rows, ACCOUNTS);

    expect(result.groups).toEqual([["out", "right"]]);
  });

  it("treats a move to an account outside the module as an external transfer", () => {
    const rows = [
      row(
        "paypal",
        "checking",
        "2025-04-20",
        "Deposit from PAYPAL from LEE RAULIN TRANSFER",
        200000,
      ),
      row(
        "penfed",
        "savings",
        "2023-12-28",
        "Preauthorized Withdrawal to PENTAGON FEDERAL CREDIT UNION",
        -217487,
      ),
    ];
    const result = matchTransfers(rows, ACCOUNTS);

    // Inbound PayPal is still external — a gift, not a wage. Outbound PayPal is no
    // longer here: those are purchases, and CLASSIFY_RULES files them as spend.
    expect(result.flows.get("paypal")).toBe("external_transfer");
    expect(result.flows.get("penfed")).toBe("external_transfer");
    // External legs have no counterpart here, so they never form a group.
    expect(result.groups).toEqual([]);
  });

  it("does not claim an outbound PayPal withdrawal as a transfer", () => {
    // The statements showed these are purchases funded from checking. Leaving them
    // here would keep CLASSIFY_RULES from ever filing them as spend.
    const result = matchTransfers(
      [
        row(
          "out",
          "checking",
          "2025-03-14",
          "Withdrawal from PAYPAL to LEE RAULIN INST XFER",
          -23744,
        ),
      ],
      ACCOUNTS,
    );
    expect(result.flows.get("out")).toBeUndefined();
  });

  it("ignores a masked number belonging to an account we do not hold", () => {
    // XXXXXX2021 is the old credit union, not one of ours — the PenFed wording decides it.
    const rows = [
      row(
        "sweep",
        "checking",
        "2023-08-15",
        "Preauthorized Deposit from PENTAGON FEDERAL CREDIT UNION checking account XXXXXX2021",
        434414,
      ),
    ];
    const result = matchTransfers(rows, ACCOUNTS);
    expect(result.flows.get("sweep")).toBe("external_transfer");
  });

  it("pairs a Coinbase withdrawal with the checking deposit it names", () => {
    // Coinbase truncates the account name; the parser writes the last four so
    // signal 1 can find checking. The Sell is the liquidation and must stay
    // external — pairing it with the withdrawal would cancel cash flow.
    const rows = [
      row(
        "cb-out",
        "coinbase",
        "2025-11-21",
        "Coinbase Withdrawal -490.62 USD to Capital One XXXX2322",
        -48203,
      ),
      row("cb-sell", "coinbase", "2025-11-21", "Coinbase Sell -0.00606489 BTC", 48203),
      row("bank", "checking", "2025-11-21", "Deposit from COINBASE", 48203),
    ];
    const result = matchTransfers(rows, ACCOUNTS);

    expect(result.groups).toEqual([["cb-out", "bank"]]);
    expect(result.flows.get("cb-out")).toBe("internal_transfer");
    expect(result.flows.get("bank")).toBe("internal_transfer");
    expect(result.flows.get("cb-sell")).toBe("external_transfer");
  });

  it("keeps a Coinbase buy as an external transfer", () => {
    // Funded from PenFed, which we do not hold. $0 so it cannot pair anyway.
    const result = matchTransfers(
      [row("buy", "coinbase", "2022-11-29", "Coinbase Buy 0.00202835 BTC", 0)],
      ACCOUNTS,
    );
    expect(result.flows.get("buy")).toBe("external_transfer");
    expect(result.groups).toEqual([]);
  });

  it("leaves ordinary spending untouched", () => {
    const rows = [
      row("a", "chase-card", "2026-01-05", "PIZZA HUT 036874", -3598),
      row(
        "b",
        "checking",
        "2026-01-06",
        "Withdrawal from TURBOTENANT.COM RENT:RAULI",
        -210000,
      ),
    ];
    const result = matchTransfers(rows, ACCOUNTS);
    expect(result.flows.size).toBe(0);
  });

  it("produces the same pairing regardless of input order", () => {
    // A reclassify that churned its own output would rewrite the table on every run.
    const rows = [
      row(
        "bank",
        "checking",
        "2026-03-09",
        "Withdrawal from CHASE CREDIT CRD EPAY",
        -48120,
      ),
      row("card", "chase-card", "2026-03-11", "Payment Thank You-Mobile", 48120),
      row("other", "capone-card", "2026-03-10", "CAPITAL ONE MOBILE PYMT", 48120),
    ];
    const forward = matchTransfers(rows, ACCOUNTS);
    const backward = matchTransfers([...rows].reverse(), ACCOUNTS);

    expect(forward.groups).toEqual(backward.groups);
  });

  it("pairs each leg only once", () => {
    // Three same-size candidates must not produce overlapping groups.
    const rows = [
      row(
        "out1",
        "checking",
        "2026-03-01",
        "Withdrawal from CHASE CREDIT CRD EPAY",
        -10000,
      ),
      row(
        "out2",
        "checking",
        "2026-03-02",
        "Withdrawal from CHASE CREDIT CRD EPAY",
        -10000,
      ),
      row("in1", "chase-card", "2026-03-02", "Payment Thank You-Mobile", 10000),
    ];
    const result = matchTransfers(rows, ACCOUNTS);

    expect(result.groups).toHaveLength(1);
    const used = result.groups.flat();
    expect(new Set(used).size).toBe(used.length);
  });
});
