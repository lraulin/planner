import { describe, expect, it } from "vitest";
import { monthBuckets } from "./analytics";
import {
  accountPosition,
  householdPosition,
  statementCashFlow,
} from "./statementCashFlow";

const card = "card";
const checking = "checking";

describe("accountPosition", () => {
  it("is the official close plus later txs through asOf", () => {
    const cents = accountPosition(
      [{ accountId: card, periodEnd: "2026-07-21", closingBalanceCents: -20114 }],
      [
        { accountId: card, transactionDate: "2026-07-10", amountCents: -4000 },
        { accountId: card, transactionDate: "2026-07-25", amountCents: -10000 },
        { accountId: card, transactionDate: "2026-08-02", amountCents: -500 },
      ],
      card,
      "2026-07-31",
    );
    expect(cents).toBe(-20114 + -10000);
  });

  it("sums the ledger through asOf when the account has no statement", () => {
    expect(
      accountPosition(
        [],
        [
          { accountId: card, transactionDate: "2026-06-15", amountCents: -2000 },
          { accountId: card, transactionDate: "2026-07-15", amountCents: -3000 },
        ],
        card,
        "2026-06-30",
      ),
    ).toBe(-2000);
  });
});

describe("statementCashFlow", () => {
  it("nets an internal transfer to zero across the household", () => {
    const buckets = monthBuckets({ startKey: "2026-01-01", endKey: "2026-01-31" });
    const points = statementCashFlow(
      [
        { accountId: checking, periodEnd: "2026-01-31", closingBalanceCents: -10000 },
        { accountId: card, periodEnd: "2026-01-21", closingBalanceCents: 10000 },
      ],
      [
        {
          accountId: checking,
          transactionDate: "2026-01-10",
          amountCents: -10000,
        },
        { accountId: card, transactionDate: "2026-01-10", amountCents: 10000 },
      ],
      buckets,
    );
    expect(points).toHaveLength(1);
    expect(points[0].positionCents).toBe(0);
  });

  it("moves household position by a card purchase the same way spend does", () => {
    const buckets = monthBuckets({ startKey: "2025-12-01", endKey: "2026-01-31" });
    const points = statementCashFlow(
      [
        { accountId: card, periodEnd: "2025-12-21", closingBalanceCents: 0 },
        { accountId: card, periodEnd: "2026-01-21", closingBalanceCents: -5000 },
      ],
      [{ accountId: card, transactionDate: "2026-01-15", amountCents: -5000 }],
      buckets,
    );
    expect(points[0].positionCents).toBe(0);
    expect(points[1].positionCents).toBe(-5000);
    expect(points[1].netCents).toBe(-5000);
  });

  it("spikes statement net across a hole when no txs fill the gap", () => {
    const buckets = monthBuckets({ startKey: "2025-05-01", endKey: "2025-06-30" });
    const points = statementCashFlow(
      [
        { accountId: card, periodEnd: "2025-05-21", closingBalanceCents: -33994 },
        { accountId: card, periodEnd: "2025-06-21", closingBalanceCents: -11103 },
      ],
      [],
      buckets,
    );
    expect(points[0].positionCents).toBe(-33994);
    expect(points[1].positionCents).toBe(-11103);
    expect(points[1].netCents).toBe(-11103 - -33994);
  });
});

describe("householdPosition", () => {
  it("adds every imported account", () => {
    const pos = householdPosition(
      [
        { accountId: checking, periodEnd: "2026-07-31", closingBalanceCents: 47145 },
        { accountId: card, periodEnd: "2026-07-21", closingBalanceCents: -20114 },
      ],
      [{ accountId: card, transactionDate: "2026-07-25", amountCents: -10006 }],
      "2026-07-31",
    );
    expect(pos.totalCents).toBe(47145 + -20114 + -10006);
    expect(pos.byAccount).toHaveLength(2);
  });
});
