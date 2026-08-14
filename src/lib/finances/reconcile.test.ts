import { describe, expect, it } from "vitest";
import { dateFallsInHole, reconcileAccounts } from "./reconcile";
import type { ReconcileStatement, ReconcileTransaction } from "./reconcile";

function tx(
  overrides: Partial<ReconcileTransaction> & Pick<ReconcileTransaction, "id">,
): ReconcileTransaction {
  return {
    accountId: "card",
    accountName: "Capital One •••3448",
    transactionDate: "2026-01-15",
    amountCents: -1000,
    derivedFlow: "spend",
    flowOverride: null,
    transferGroupId: null,
    ...overrides,
  };
}

function snap(
  overrides: Partial<ReconcileStatement> & Pick<ReconcileStatement, "id">,
): ReconcileStatement {
  return {
    accountId: "card",
    accountName: "Capital One •••3448",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    openingBalanceCents: 0,
    closingBalanceCents: -1000,
    ...overrides,
  };
}

describe("reconcileAccounts", () => {
  it("matches a $0-start card whose period rows equal the close", () => {
    const report = reconcileAccounts(
      [snap({ id: "jan", openingBalanceCents: 0, closingBalanceCents: -2500 })],
      [
        tx({ id: "buy", amountCents: -4000 }),
        tx({
          id: "pay",
          transactionDate: "2026-01-20",
          amountCents: 1500,
          derivedFlow: "internal_transfer",
          transferGroupId: "paired",
        }),
      ],
    );

    expect(report.statements).toEqual([
      expect.objectContaining({
        statementId: "jan",
        registerSumCents: -2500,
        registerDeltaCents: 0,
        rowCount: 2,
      }),
    ]);
    expect(report.accounts[0]).toMatchObject({
      ledgerBalanceCents: -2500,
      anchoredBalanceCents: -2500,
      mismatchCents: 0,
      postStatementCount: 0,
    });
    expect(report.holes).toEqual([]);
  });

  it("flags a planted extra row as a period delta and a ledger/anchor mismatch", () => {
    const report = reconcileAccounts(
      [
        snap({
          id: "jul",
          periodStart: "2026-06-22",
          periodEnd: "2026-07-21",
          openingBalanceCents: -70063,
          closingBalanceCents: -20114,
        }),
      ],
      [
        tx({
          id: "pay",
          transactionDate: "2026-07-01",
          amountCents: 498973,
          derivedFlow: "internal_transfer",
          transferGroupId: "pay-jul",
        }),
        tx({
          id: "spend",
          transactionDate: "2026-07-10",
          amountCents: -449024,
        }),
        // History the statement does not include — the −$2,368-shaped leftover.
        tx({
          id: "ghost",
          transactionDate: "2024-03-01",
          amountCents: -216686,
        }),
      ],
    );

    expect(report.statements[0].registerDeltaCents).toBe(0);
    // Ledger is the sum of rows, not opening + rows. The ghost purchase
    // is outside the period so the period still matches and the headline
    // stays on the official close.
    expect(report.accounts[0]).toMatchObject({
      ledgerBalanceCents: 498973 - 449024 - 216686,
      anchoredBalanceCents: -20114,
      mismatchCents: 498973 - 449024 - 216686 - -20114,
      latestStatement: {
        periodEnd: "2026-07-21",
        closingBalanceCents: -20114,
      },
    });
  });

  it("treats a 2024-then-2026 statement pair as one hole", () => {
    const report = reconcileAccounts(
      [
        snap({
          id: "2024",
          periodStart: "2024-06-22",
          periodEnd: "2024-07-21",
          openingBalanceCents: -50000,
          closingBalanceCents: -180000,
        }),
        snap({
          id: "2026",
          periodStart: "2025-12-22",
          periodEnd: "2026-01-21",
          openingBalanceCents: -40000,
          closingBalanceCents: -20114,
        }),
      ],
      [],
    );

    expect(report.holes).toEqual([
      {
        accountId: "card",
        accountName: "Capital One •••3448",
        afterPeriodEnd: "2024-07-21",
        beforePeriodStart: "2025-12-22",
        previousClosingCents: -180000,
        nextOpeningCents: -40000,
        discontinuityCents: 140000,
      },
    ]);
    expect(report.accounts[0].anchoredBalanceCents).toBe(-20114);
  });

  it("does not call adjacent matching periods a hole", () => {
    const report = reconcileAccounts(
      [
        snap({
          id: "a",
          periodStart: "2026-01-22",
          periodEnd: "2026-02-21",
          openingBalanceCents: -1000,
          closingBalanceCents: -2000,
        }),
        snap({
          id: "b",
          periodStart: "2026-02-22",
          periodEnd: "2026-03-21",
          openingBalanceCents: -2000,
          closingBalanceCents: -1500,
        }),
      ],
      [],
    );
    expect(report.holes).toEqual([]);
  });

  it("flags adjacent periods whose opening does not equal the previous close", () => {
    const report = reconcileAccounts(
      [
        snap({
          id: "a",
          periodStart: "2026-01-22",
          periodEnd: "2026-02-21",
          closingBalanceCents: -2000,
        }),
        snap({
          id: "b",
          periodStart: "2026-02-22",
          periodEnd: "2026-03-21",
          openingBalanceCents: -1800,
          closingBalanceCents: -1500,
        }),
      ],
      [],
    );
    expect(report.holes).toEqual([
      expect.objectContaining({
        afterPeriodEnd: "2026-02-21",
        beforePeriodStart: "2026-02-22",
        discontinuityCents: 200,
      }),
    ]);
  });

  it("lets post-statement txs change the headline without counting as an error", () => {
    const report = reconcileAccounts(
      [
        snap({
          id: "jul",
          periodEnd: "2026-07-21",
          openingBalanceCents: 0,
          closingBalanceCents: -20114,
        }),
      ],
      [
        tx({
          id: "in-period",
          transactionDate: "2026-07-10",
          amountCents: -20114,
        }),
        tx({
          id: "after",
          transactionDate: "2026-08-01",
          amountCents: -11006,
        }),
      ],
    );

    expect(report.statements[0].registerDeltaCents).toBe(0);
    expect(report.accounts[0]).toMatchObject({
      anchoredBalanceCents: -31120,
      ledgerBalanceCents: -31120,
      mismatchCents: 0,
      postStatementCount: 1,
      postStatementCents: -11006,
    });
    expect(report.holes).toEqual([]);
  });

  it("headlines the ledger and does not warn when an account has no statements", () => {
    const report = reconcileAccounts(
      [],
      [
        tx({
          id: "only",
          accountId: "new",
          accountName: "New card",
          amountCents: -500,
        }),
      ],
    );
    expect(report.accounts[0]).toMatchObject({
      ledgerBalanceCents: -500,
      anchoredBalanceCents: -500,
      latestStatement: null,
      mismatchCents: 0,
    });
  });

  it("lists unpaired internal transfers and skips paired ones", () => {
    const report = reconcileAccounts(
      [],
      [
        tx({
          id: "lone",
          derivedFlow: "internal_transfer",
          amountCents: -190000,
        }),
        tx({
          id: "paired",
          derivedFlow: "internal_transfer",
          transferGroupId: "group",
          amountCents: -50000,
        }),
        tx({ id: "spend", derivedFlow: "spend", amountCents: -100 }),
      ],
    );
    expect(report.unpairedTransfers.map((row) => row.id)).toEqual(["lone"]);
  });
});

describe("dateFallsInHole", () => {
  it("is exclusive of both statement bookends", () => {
    const hole = {
      accountId: "card",
      accountName: "Card",
      afterPeriodEnd: "2024-07-21",
      beforePeriodStart: "2025-12-22",
      previousClosingCents: 0,
      nextOpeningCents: 0,
      discontinuityCents: 0,
    };
    expect(dateFallsInHole("2024-07-21", hole)).toBe(false);
    expect(dateFallsInHole("2024-07-22", hole)).toBe(true);
    expect(dateFallsInHole("2025-12-21", hole)).toBe(true);
    expect(dateFallsInHole("2025-12-22", hole)).toBe(false);
  });
});
