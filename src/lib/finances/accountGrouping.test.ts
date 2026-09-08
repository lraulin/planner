import { describe, expect, it } from "vitest";
import { accountTotals, asAccountGroupBy, groupAccounts } from "./accountGrouping";
import type { OperationalAccount } from "./accountOperations";

let counter = 0;

function account(partial: Partial<OperationalAccount> = {}): OperationalAccount {
  counter += 1;
  return {
    id: `a${counter}`,
    name: `Account ${counter}`,
    kind: "checking",
    institution: "Bank",
    url: "",
    externalSource: "",
    externalKey: "",
    closedAt: null,
    offBudget: false,
    balanceCents: 0,
    ledgerBalanceCents: 0,
    statementClosingCents: null,
    statementPeriodEnd: null,
    balanceMismatchCents: 0,
    syncedBalanceAsOf: null,
    balanceSource: "ledger",
    browserAsOf: null,
    feedAsOf: null,
    transactionCount: 0,
    workingCents: 0,
    postedCents: 0,
    pendingCents: 0,
    freshness: "Import or connect bank",
    balanceSourceLabel: "Transaction history",
    needsConnection: false,
    ...partial,
  };
}

/** Header labels in emitted order, so a test reads like the grid does. */
function headers(rows: ReturnType<typeof groupAccounts>): string[] {
  return rows.flatMap((row) => (row.kind === "group" ? [row.label] : []));
}

describe("asAccountGroupBy", () => {
  it("drops dimensions the accounts grid cannot render", () => {
    // Freshness is a column but deliberately not a group dimension.
    expect(asAccountGroupBy(["kind", "freshness", "source"])).toEqual([
      "kind",
      "source",
    ]);
  });
});

describe("groupAccounts", () => {
  it("keeps a flat list when nothing is grouped", () => {
    const rows = groupAccounts([account(), account()], []);
    expect(rows.every((row) => row.kind === "node")).toBe(true);
  });

  it("groups by kind under the label the column shows, alphabetically", () => {
    const rows = groupAccounts(
      [
        account({ kind: "savings" }),
        account({ kind: "credit_card" }),
        account({ kind: "checking" }),
      ],
      ["kind"],
    );
    expect(headers(rows)).toEqual(["Checking", "Credit card", "Savings"]);
  });

  it("groups by the balance source shown in the Source column", () => {
    const rows = groupAccounts(
      [
        account({ balanceSourceLabel: "Bank feed" }),
        account({ balanceSourceLabel: "Transaction history" }),
        account({ balanceSourceLabel: "Bank feed" }),
      ],
      ["source"],
    );
    expect(headers(rows)).toEqual(["Bank feed", "Transaction history"]);
    expect(rows.filter((row) => row.kind === "group").map((row) => row.count)).toEqual([
      2, 1,
    ]);
  });

  it("leads with the ordinary case on the two-value dimensions", () => {
    // Alphabetical would put Off budget and Closed first, which reads as the exception
    // being the headline.
    expect(
      headers(groupAccounts([account({ offBudget: true }), account()], ["budget"])),
    ).toEqual(["On budget", "Off budget"]);
    expect(
      headers(
        groupAccounts(
          [account({ closedAt: new Date("2026-01-01T12:00:00Z") }), account()],
          ["accountStatus"],
        ),
      ),
    ).toEqual(["Open", "Closed"]);
  });

  it("puts accounts with no institution last, under a labelled header", () => {
    const rows = groupAccounts(
      [account({ institution: "" }), account({ institution: "Zions" })],
      ["institution"],
    );
    expect(headers(rows)).toEqual(["Zions", "(No Institution)"]);
  });

  it("nests kind inside source, one section per pair", () => {
    const rows = groupAccounts(
      [
        account({ balanceSourceLabel: "Bank feed", kind: "savings" }),
        account({ balanceSourceLabel: "Bank feed", kind: "checking" }),
        account({ balanceSourceLabel: "Transaction history", kind: "checking" }),
      ],
      ["source", "kind"],
    );
    expect(headers(rows)).toEqual([
      "Bank feed",
      "Checking",
      "Savings",
      "Transaction history",
      "Checking",
    ]);
  });
});

describe("accountTotals", () => {
  it("sums the three money columns, holding a card's negative balance against cash", () => {
    expect(
      accountTotals([
        account({ workingCents: 7000, postedCents: 10000, pendingCents: -3000 }),
        account({ workingCents: -2500, postedCents: -2000, pendingCents: -500 }),
      ]),
    ).toEqual({ workingCents: 4500, postedCents: 8000, pendingCents: -3500 });
  });

  it("is zero for a group with no rows", () => {
    expect(accountTotals([])).toEqual({
      workingCents: 0,
      postedCents: 0,
      pendingCents: 0,
    });
  });
});
