import { describe, expect, it } from "vitest";
import { asStatementGroupBy, groupStatements } from "./statementGrouping";
import type { StatementViewRow } from "./types";

let counter = 0;

function statement(partial: Partial<StatementViewRow> = {}): StatementViewRow {
  counter += 1;
  return {
    id: `s${counter}`,
    accountId: "a1",
    accountName: "Checking",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    statementDate: null,
    openingBalanceCents: 0,
    closingBalanceCents: 0,
    paymentDueDate: null,
    minimumPaymentCents: null,
    pastDueAmountCents: null,
    creditLimitCents: null,
    availableCreditCents: null,
    paymentsCreditsCents: null,
    purchasesCents: null,
    cashAdvancesCents: null,
    balanceTransfersCents: null,
    feesChargedCents: null,
    interestChargedCents: null,
    ytdFeesCents: null,
    ytdInterestCents: null,
    rewardsPoints: null,
    rates: [],
    registerSumCents: 0,
    registerDeltaCents: 0,
    rowCount: 0,
    ...partial,
  };
}

/** Header labels in emitted order, so a test reads like the grid does. */
function headers(rows: ReturnType<typeof groupStatements>): string[] {
  return rows.flatMap((row) => (row.kind === "group" ? [row.label] : []));
}

function counts(rows: ReturnType<typeof groupStatements>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) if (row.kind === "group") out[row.label] = row.count;
  return out;
}

describe("asStatementGroupBy", () => {
  it("drops dimensions the statements grid cannot render", () => {
    expect(asStatementGroupBy(["account", "merchant", "year"])).toEqual([
      "account",
      "year",
    ]);
  });

  it("keeps a flat list when nothing is grouped", () => {
    const rows = groupStatements([statement(), statement()], []);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.kind === "node")).toBe(true);
  });
});

describe("groupStatements", () => {
  it("runs calendar groups newest first", () => {
    const rows = groupStatements(
      [
        statement({ periodEnd: "2024-05-31" }),
        statement({ periodEnd: "2026-02-28" }),
        statement({ periodEnd: "2025-11-30" }),
      ],
      ["year"],
    );
    expect(headers(rows)).toEqual(["2026", "2025", "2024"]);
  });

  it("counts every statement under each header it sits below", () => {
    const rows = groupStatements(
      [
        statement({ accountName: "Checking", periodEnd: "2026-01-31" }),
        statement({ accountName: "Checking", periodEnd: "2026-02-28" }),
        statement({ accountName: "Savings", periodEnd: "2026-01-31" }),
      ],
      ["account", "month"],
    );
    expect(counts(rows)).toMatchObject({ Checking: 2, Savings: 1 });
  });

  it("files a statement with no account name under the empty label, last", () => {
    const rows = groupStatements(
      [statement({ accountName: "   " }), statement({ accountName: "Checking" })],
      ["account"],
    );
    expect(headers(rows)).toEqual(["Checking", "(No Account)"]);
  });

  it("orders account names the way the register does, not by raw code units", () => {
    // The plausible mistake — and what this grid actually did — is a bare `localeCompare`.
    // That sorts `Account 10` above `Account 9`, and files `checking` after every
    // capitalised name instead of beside `Checking`.
    const rows = groupStatements(
      [
        statement({ accountName: "Account 10" }),
        statement({ accountName: "Account 9" }),
        statement({ accountName: "checking" }),
        statement({ accountName: "Brokerage" }),
      ],
      ["account"],
    );
    expect(headers(rows)).toEqual(["Account 9", "Account 10", "Brokerage", "checking"]);
  });
});
