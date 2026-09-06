import { expect, it } from "vitest";
import { operationalAccountRows } from "./accountOperations";
import type { FinanceAccountRow } from "./types";

/** Most cases are not about formatting; this keeps the key visible in the assertion. */
const identity = (key: string | null | undefined) => key ?? "";
const account: FinanceAccountRow = {
  id: "a",
  name: "Checking",
  kind: "checking",
  institution: "Bank",
  url: "https://example.com",
  externalSource: "api:simplefin",
  externalKey: "a",
  closedAt: null,
  offBudget: false,
  balanceCents: 10000,
  ledgerBalanceCents: 10000,
  statementClosingCents: null,
  statementPeriodEnd: null,
  balanceMismatchCents: 0,
  syncedBalanceAsOf: new Date("2026-09-05T12:00:00Z"),
  balanceSource: "browser",
  browserAsOf: null,
  feedAsOf: null,
  transactionCount: 2,
};
it("keeps working, posted and pending separate and identifies the selected headline source", () => {
  const [row] = operationalAccountRows(
    [account],
    [{ accountId: "a", amountCents: -3000 }],
    new Set(),
    [],
    [],
    "2026-09-05",
    identity,
  );
  expect(row).toMatchObject({
    workingCents: 7000,
    postedCents: 10000,
    pendingCents: -3000,
    balanceSourceLabel: "Bank snapshot",
    freshness: "As of today",
  });
  const [ledger] = operationalAccountRows(
    [{ ...account, syncedBalanceAsOf: null }],
    [{ accountId: "a", amountCents: -3000 }],
    new Set(),
    [],
    [],
    "2026-09-05",
    identity,
  );
  expect(ledger).toMatchObject({
    workingCents: 10000,
    pendingCents: 0,
    balanceSourceLabel: "Transaction history",
  });
});
it("puts a connection failure only beside its linked account, and stale captures ask for a snapshot", () => {
  const links = [
    {
      id: "link",
      connectionId: "bank",
      externalAccountId: "remote",
      accountId: "a",
      institution: "Bank",
      balanceCents: 10000,
      availableCents: null,
      balanceAsOf: new Date("2026-09-05T12:00:00Z"),
    },
  ];
  const connections = [
    {
      id: "bank",
      label: "Bank",
      syncedThrough: null,
      lastSyncedAt: null,
      reauthRequiredAt: new Date("2026-09-05T12:00:00Z"),
      linkedAccountCount: 1,
      unmatchedAccountCount: 0,
    },
  ];
  const rows = operationalAccountRows(
    [account, { ...account, id: "b" }],
    [],
    new Set(["b"]),
    links,
    connections,
    "2026-09-05",
    identity,
  );
  expect(rows.map((row) => row.freshness)).toEqual([
    "Reconnect bank",
    "Paste fresh snapshot",
  ]);
});

it("prints a stale balance's date in the workspace format, not as a raw key", () => {
  // The Freshness cell sits beside Balance as of, which formats. Printing the key here read
  // as `As of 2026-09-04` next to `9/4/2026` for the same instant.
  const [row] = operationalAccountRows(
    [account],
    [],
    new Set(),
    [],
    [],
    "2026-09-06",
    (key) => (key ? "5 Sep 2026" : ""),
  );
  expect(row.freshness).toBe("As of 5 Sep 2026 · refresh or import");
});
