import { describe, expect, it } from "vitest";
import {
  changedRows,
  planReclassify,
  type ReclassifyAccount,
  type ReclassifyRow,
} from "./reclassify";

const ACCOUNTS: ReclassifyAccount[] = [
  { id: "checking", externalKey: "2322" },
  { id: "savings", externalKey: "2603" },
  { id: "capone-card", externalKey: "3448" },
  { id: "coinbase", externalKey: "0b7043a7-af9a-5c5c-bb18-6e15b4e0267e" },
];

function row(
  id: string,
  accountId: string,
  transactionDate: string,
  description: string,
  amountCents: number,
  extra: Partial<ReclassifyRow> = {},
): ReclassifyRow {
  return {
    id,
    accountId,
    transactionDate,
    description,
    amountCents,
    sourceCategory: "",
    transferGroupId: null,
    payeeId: null,
    ...extra,
  };
}

/** Deterministic ids, so a plan can be compared against the run before it. */
function minter(prefix = "group") {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function planOf(rows: readonly ReclassifyRow[], mint = minter()) {
  return planReclassify(rows, ACCOUNTS, mint);
}

function flowOf(plan: ReturnType<typeof planOf>, id: string) {
  return plan.rows.find((entry) => entry.id === id)?.derivedFlow;
}

/** Fourteen days apart, starting on a Friday, the way a real payroll series arrives. */
function paycheckSeries(count: number, amountCents = 250000): ReclassifyRow[] {
  const start = Date.UTC(2024, 6, 5);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(start + index * 14 * 86_400_000);
    return row(
      `pay-${index}`,
      "checking",
      day.toISOString().slice(0, 10),
      "GA8248 TRUSTEDQA DIRDEP",
      amountCents,
    );
  });
}

describe("planReclassify", () => {
  it("classifies a card payment as a transfer even though a merchant rule also matches it", () => {
    // The whole reason transfers are resolved first: this description reads as Capital One
    // to the rules engine, and counting it as spending is a six-figure error.
    const rows = [
      row(
        "bank",
        "checking",
        "2026-03-09",
        "Withdrawal from CAPITAL ONE MOBILE PMT",
        -129200,
      ),
      row("card", "capone-card", "2026-03-10", "CAPITAL ONE MOBILE PYMT", 129200),
    ];
    const plan = planOf(rows);

    expect(flowOf(plan, "bank")).toBe("internal_transfer");
    expect(flowOf(plan, "card")).toBe("internal_transfer");
    expect(plan.rows.every((entry) => entry.derivedCategory === null)).toBe(true);
  });

  it("keeps an unpaired card payment out of spending", () => {
    // The Capital One card was imported two years after payments to it began, so 113 of
    // these have no opposite leg anywhere in the data.
    const plan = planOf([
      row(
        "lone",
        "checking",
        "2023-08-04",
        "Withdrawal from CAPITAL ONE MOBILE PMT",
        -84300,
      ),
    ]);

    expect(flowOf(plan, "lone")).toBe("internal_transfer");
    expect(plan.rows[0].transferGroupId).toBeNull();
  });

  it("reads a biweekly deposit series as income", () => {
    const plan = planOf(paycheckSeries(6));

    expect(plan.rows.every((entry) => entry.derivedFlow === "income")).toBe(true);
    expect(plan.paydays).toHaveLength(6);
    expect(plan.medianPaycheckCents).toBe(250000);
    // 26 checks a year over 12 months, not the two or three a calendar month happens to hold.
    expect(plan.normalizedMonthlyIncomeCents).toBe(541667);
  });

  it("lets a named flow beat the cadence detector", () => {
    // Interest posts monthly; naming it is the only thing that keeps it out of `spend`, and
    // withholding it from the detector is what keeps it out of the paycheck median.
    const rows = [
      ...paycheckSeries(4),
      row("int", "savings", "2026-01-31", "Monthly Interest Paid", 412),
    ];
    const plan = planOf(rows);

    expect(flowOf(plan, "int")).toBe("interest_fee");
    expect(plan.medianPaycheckCents).toBe(250000);
  });

  it("files a credit from a merchant we spend at as a refund", () => {
    const plan = planOf([
      row("out", "capone-card", "2026-02-02", "WM SUPERCENTER #1981", -8412),
      row("back", "capone-card", "2026-02-09", "WAL-MART #1981", 8412),
    ]);

    expect(flowOf(plan, "out")).toBe("spend");
    // Money came back from a shop money went out to, so it is negative spending.
    expect(flowOf(plan, "back")).toBe("refund");
    // Both spellings are one store, so both carry the same category.
    expect(plan.rows.map((entry) => entry.derivedCategory)).toEqual([
      "Groceries",
      "Groceries",
    ]);
  });

  it("does not call a deposit a refund just because it is money coming in", () => {
    /*
     * The bug this pins: every unclaimed credit used to become a refund, and a refund is
     * negative spending. A pay period that received a $2,516 tax refund therefore reported
     * *negative* money out. A deposit from somewhere we never spend is not a discount.
     */
    const plan = planOf([
      row("shop", "capone-card", "2026-02-02", "WM SUPERCENTER #1981", -8412),
      row(
        "tax",
        "checking",
        "2026-04-21",
        "Deposit from ST. OF MARYLAND TAX REFUND",
        83400,
      ),
      row("cheque", "checking", "2026-06-22", "Check Deposit (Mobile)", 50000),
      row(
        "zelle",
        "checking",
        "2026-05-02",
        "Zelle money received from A FRIEND",
        12000,
      ),
    ]);

    for (const id of ["tax", "cheque", "zelle"]) {
      expect(flowOf(plan, id), id).toBe("external_transfer");
    }
    // And nothing about them is spending, so none can drag a period's outgoings below zero.
    expect(plan.rows.filter((entry) => entry.derivedFlow === "refund")).toEqual([]);
  });

  it("keeps the group id when a second run pairs the same two rows", () => {
    const first = planOf([
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
    ]);
    const groupId = first.rows[0].transferGroupId;
    expect(groupId).toBe("group-1");

    // Feed the first run's output back in, as the database would after the write.
    const stored = [
      row(
        "a",
        "savings",
        "2024-01-27",
        "Withdrawal to 360 Checking XXXXXXX2322",
        -500000,
        {
          transferGroupId: groupId,
        },
      ),
      row(
        "b",
        "checking",
        "2024-01-27",
        "Deposit from 360 Performance Savings XXXXXXX2603",
        500000,
        {
          transferGroupId: groupId,
        },
      ),
    ];
    const second = planReclassify(stored, ACCOUNTS, minter("second"));

    expect(second.rows.map((entry) => entry.transferGroupId)).toEqual([
      groupId,
      groupId,
    ]);
    expect(
      changedRows(
        stored.map((entry, index) => ({
          ...entry,
          derivedCategory: first.rows[index].derivedCategory,
          derivedFlow: first.rows[index].derivedFlow,
        })),
        second,
      ),
    ).toEqual([]);
  });

  it("mints a fresh id when a pairing changes rather than handing it to both halves", () => {
    // `a` used to pair with `b`; the newly imported `c` posts a day closer and takes it.
    const rows = [
      row(
        "a",
        "savings",
        "2024-01-27",
        "Withdrawal to 360 Checking XXXXXXX2322",
        -500000,
        {
          transferGroupId: "old",
        },
      ),
      row("b", "checking", "2024-01-29", "Deposit from savings", 500000, {
        transferGroupId: "old",
      }),
      row("c", "checking", "2024-01-27", "Deposit from savings", 500000, {
        transferGroupId: null,
      }),
    ];
    const plan = planReclassify(rows, ACCOUNTS, minter("fresh"));

    const byId = new Map(plan.rows.map((entry) => [entry.id, entry.transferGroupId]));
    expect(byId.get("a")).toBe("fresh-1");
    expect(byId.get("c")).toBe("fresh-1");
    expect(byId.get("b")).toBeNull();
  });

  it("keeps a named inbound PayPal gift out of refunds", () => {
    // The bank names the rail and the statement names the sender. Either way this is an
    // external transfer, not a refund from a merchant that happens to share the sender's name.
    const rows = [
      row("out", "capone-card", "2025-04-01", "Dennis Raulin", -5000),
      row(
        "gift",
        "checking",
        "2025-04-20",
        "Deposit from PAYPAL from LEE RAULIN TRANSFER",
        200000,
      ),
    ];
    const without = planOf(rows);
    expect(flowOf(without, "gift")).toBe("external_transfer");

    const withName = planReclassify(rows, ACCOUNTS, minter(), [
      {
        externalId: "pp-gift",
        date: "2025-04-20",
        amountCents: 200000,
        counterparty: "Dennis Raulin",
        direction: "in",
      },
    ]);
    expect(flowOf(withName, "gift")).toBe("external_transfer");
  });

  it("files an outbound PayPal withdrawal as spend, not an external transfer", () => {
    const plan = planOf([
      row(
        "out",
        "checking",
        "2025-03-14",
        "Withdrawal from PAYPAL to LEE RAULIN INST XFER",
        -23744,
      ),
    ]);
    expect(flowOf(plan, "out")).toBe("spend");
  });

  it("assigns processor rows through each resolved counterparty's payee", () => {
    const rows = [
      row("coffee", "checking", "2026-03-14", "PAYPAL *", -1234),
      row("feed", "checking", "2026-03-15", "PAYPAL *", -5678),
    ];
    const plan = planReclassify(
      rows,
      ACCOUNTS,
      minter(),
      [
        {
          externalId: "paypal-coffee",
          date: "2026-03-14",
          amountCents: -1234,
          counterparty: "Blue Bottle Coffee",
          direction: "out",
        },
        {
          externalId: "paypal-feed",
          date: "2026-03-15",
          amountCents: -5678,
          counterparty: "Tractor Supply",
          direction: "out",
        },
      ],
      new Map(),
      new Map([
        ["BLUE BOTTLE COFFEE", "coffee-payee"],
        ["TRACTOR SUPPLY", "feed-payee"],
      ]),
    );

    expect(plan.rows.map((entry) => entry.payeeId)).toEqual([
      "coffee-payee",
      "feed-payee",
    ]);
  });

  it("pairs a Coinbase withdrawal with checking and leaves the Sell as the liquidation", () => {
    const plan = planOf([
      row(
        "cb-out",
        "coinbase",
        "2025-11-21",
        "Coinbase Withdrawal -490.62 USD to Capital One XXXX2322",
        -48203,
      ),
      row("cb-sell", "coinbase", "2025-11-21", "Coinbase Sell -0.00606489 BTC", 48203),
      row("bank", "checking", "2025-11-21", "Deposit from COINBASE", 48203),
    ]);

    expect(flowOf(plan, "cb-out")).toBe("internal_transfer");
    expect(flowOf(plan, "bank")).toBe("internal_transfer");
    expect(flowOf(plan, "cb-sell")).toBe("external_transfer");
    const group = plan.rows.find((entry) => entry.id === "cb-out")?.transferGroupId;
    expect(group).toBeTruthy();
    expect(plan.rows.find((entry) => entry.id === "bank")?.transferGroupId).toBe(group);
    expect(
      plan.rows.find((entry) => entry.id === "cb-sell")?.transferGroupId,
    ).toBeNull();
  });

  it("keeps an inbound PayPal deposit as an external transfer", () => {
    const plan = planOf([
      row(
        "gift",
        "checking",
        "2025-04-20",
        "Deposit from PAYPAL from LEE RAULIN TRANSFER",
        200000,
      ),
    ]);
    expect(flowOf(plan, "gift")).toBe("external_transfer");
  });

  it("reports only the rows whose stored values disagree with the plan", () => {
    const rows = [
      row("out", "capone-card", "2026-02-02", "WM SUPERCENTER #1981", -8412),
      row("rent", "checking", "2026-02-01", "TURBOTENANT.COM RENT:RAULI", -210000),
    ];
    const plan = planOf(rows);
    const stored = rows.map((entry, index) => ({
      ...entry,
      derivedCategory: index === 0 ? plan.rows[0].derivedCategory : null,
      derivedFlow: plan.rows[index].derivedFlow,
    }));

    expect(changedRows(stored, plan).map((entry) => entry.id)).toEqual(["rent"]);
  });
});
