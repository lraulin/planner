import { describe, expect, it } from "vitest";
import { planSync, type SyncPlanInput } from "./syncPlan";
import type { PlaidTransaction } from "./mapping";

const PLAID_CHECKING = "plaid-checking";
const PLAID_CARD = "plaid-card";
const ACCT_CHECKING = "acct-checking";
const ACCT_CARD = "acct-card";

function txn(
  over: Partial<PlaidTransaction> & { transaction_id: string },
): PlaidTransaction {
  return {
    account_id: PLAID_CHECKING,
    date: "2026-08-12",
    authorized_date: null,
    name: "STARBUCKS",
    amount: 4.33,
    pending: false,
    ...over,
  };
}

function input(over: Partial<SyncPlanInput> = {}): SyncPlanInput {
  return {
    added: [],
    modified: [],
    removed: [],
    accountIdByPlaidAccount: new Map([
      [PLAID_CHECKING, ACCT_CHECKING],
      [PLAID_CARD, ACCT_CARD],
    ]),
    knownExternalIds: new Set<string>(),
    existingByAccount: new Map(),
    ...over,
  };
}

describe("planSync — added", () => {
  it("inserts a new row against its linked account", () => {
    const plan = planSync(input({ added: [txn({ transaction_id: "t1" })] }));
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0].accountId).toBe(ACCT_CHECKING);
    expect(plan.inserts[0].externalId).toBe("t1");
    // Sign inversion still applies through the plan.
    expect(plan.inserts[0].transaction.amountCents).toBe(-433);
  });

  it("does not re-insert a row it already has", () => {
    const plan = planSync(
      input({
        added: [txn({ transaction_id: "t1" })],
        knownExternalIds: new Set(["t1"]),
      }),
    );
    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates).toHaveLength(0);
  });

  it("counts an unparseable amount instead of throwing", () => {
    const plan = planSync(
      input({ added: [txn({ transaction_id: "t1", amount: Number.NaN })] }),
    );
    expect(plan.inserts).toHaveLength(0);
    expect(plan.skippedUnparseable).toBe(1);
  });
});

describe("planSync — unlinked accounts", () => {
  it("reports an account with no link rather than dropping its rows silently", () => {
    const plan = planSync(
      input({
        added: [txn({ transaction_id: "t1", account_id: "plaid-savings" })],
        accountIdByPlaidAccount: new Map([[PLAID_CHECKING, ACCT_CHECKING]]),
      }),
    );
    expect(plan.inserts).toHaveLength(0);
    // Silently dropping these is the failure mode that surfaces months later as
    // "why is half my spending missing".
    expect(plan.unlinkedPlaidAccountIds).toEqual(["plaid-savings"]);
  });

  it("reports each unlinked account once, however many rows it carries", () => {
    const plan = planSync(
      input({
        added: [
          txn({ transaction_id: "t1", account_id: "plaid-savings" }),
          txn({ transaction_id: "t2", account_id: "plaid-savings" }),
        ],
        accountIdByPlaidAccount: new Map(),
      }),
    );
    expect(plan.unlinkedPlaidAccountIds).toEqual(["plaid-savings"]);
  });
});

describe("planSync — modified", () => {
  it("updates a row it already has", () => {
    const plan = planSync(
      input({
        modified: [
          txn({ transaction_id: "t1", name: "STARBUCKS #1234", amount: 5.11 }),
        ],
        knownExternalIds: new Set(["t1"]),
      }),
    );
    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates).toEqual([
      {
        externalId: "t1",
        transactionDate: "2026-08-12",
        postedDate: "2026-08-12",
        description: "STARBUCKS #1234",
        amountCents: -511,
        sourceCategory: "",
        pending: false,
      },
    ]);
  });

  it("carries no user-owned columns, so a revision cannot blank a hand-set category", () => {
    const plan = planSync(
      input({
        modified: [txn({ transaction_id: "t1" })],
        knownExternalIds: new Set(["t1"]),
      }),
    );
    const keys = Object.keys(plan.updates[0]).sort();
    // If this list ever grows to include category/notes/flowOverride, a Plaid revision
    // would silently undo the user's own classification.
    expect(keys).toEqual([
      "amountCents",
      "description",
      "externalId",
      "pending",
      "postedDate",
      "sourceCategory",
      "transactionDate",
    ]);
  });

  it("inserts a modified row we have never seen rather than losing it", () => {
    // Plaid can revise a transaction that was skipped as a statement duplicate on an
    // earlier sync, or that predates the link.
    const plan = planSync(input({ modified: [txn({ transaction_id: "t9" })] }));
    expect(plan.updates).toHaveLength(0);
    expect(plan.inserts.map((i) => i.externalId)).toEqual(["t9"]);
  });
});

describe("planSync — removed and pending resolution", () => {
  it("deletes what Plaid removed", () => {
    const plan = planSync(input({ removed: [{ transaction_id: "gone-1" }] }));
    expect(plan.deletes).toEqual(["gone-1"]);
  });

  it("deletes the pending row a posted row supersedes, and inserts the posted one", () => {
    const plan = planSync(
      input({
        added: [
          txn({
            transaction_id: "posted-1",
            pending_transaction_id: "pending-1",
            amount: 46.5,
          }),
        ],
      }),
    );
    // Without the delete the pending and posted rows coexist and the account double-counts.
    expect(plan.deletes).toEqual(["pending-1"]);
    expect(plan.inserts.map((i) => i.externalId)).toEqual(["posted-1"]);
  });

  it("resolves a pending row that posts via modified too", () => {
    const plan = planSync(
      input({
        modified: [
          txn({ transaction_id: "posted-1", pending_transaction_id: "pending-1" }),
        ],
        knownExternalIds: new Set(["posted-1"]),
      }),
    );
    expect(plan.deletes).toEqual(["pending-1"]);
    expect(plan.updates).toHaveLength(1);
  });

  it("does not list the same id to delete twice", () => {
    const plan = planSync(
      input({
        added: [
          txn({ transaction_id: "posted-1", pending_transaction_id: "pending-1" }),
        ],
        removed: [{ transaction_id: "pending-1" }],
      }),
    );
    expect(plan.deletes).toEqual(["pending-1"]);
  });
});

describe("planSync — cross-source dedup", () => {
  it("skips a row a statement import already covers", () => {
    // The first sync on an account whose history came from CSVs overlaps them completely.
    const plan = planSync(
      input({
        added: [txn({ transaction_id: "t1", name: "STARBUCKS", amount: 4.33 })],
        existingByAccount: new Map([
          [
            ACCT_CHECKING,
            [
              {
                transactionDate: "2026-08-12",
                amountCents: -433,
                description: "Starbucks",
              },
            ],
          ],
        ]),
      }),
    );
    expect(plan.inserts).toHaveLength(0);
    expect(plan.skippedDuplicate).toBe(1);
  });

  it("still inserts a row the existing window does not cover", () => {
    const plan = planSync(
      input({
        added: [txn({ transaction_id: "t1", name: "SBARRO", amount: 6.59 })],
        existingByAccount: new Map([
          [
            ACCT_CHECKING,
            [
              {
                transactionDate: "2026-08-12",
                amountCents: -433,
                description: "Starbucks",
              },
            ],
          ],
        ]),
      }),
    );
    expect(plan.inserts.map((i) => i.externalId)).toEqual(["t1"]);
    expect(plan.skippedDuplicate).toBe(0);
  });

  it("keeps both of two identical same-day charges when only one is already stored", () => {
    // The occurrence-counting case `fingerprint.ts` exists for: two people, one lunch.
    const plan = planSync(
      input({
        added: [
          txn({ transaction_id: "t1", name: "SBARRO", amount: 6.59 }),
          txn({ transaction_id: "t2", name: "SBARRO", amount: 6.59 }),
        ],
        existingByAccount: new Map([
          [
            ACCT_CHECKING,
            [
              {
                transactionDate: "2026-08-12",
                amountCents: -659,
                description: "SBARRO",
              },
            ],
          ],
        ]),
      }),
    );
    expect(plan.inserts).toHaveLength(1);
    expect(plan.skippedDuplicate).toBe(1);
  });

  it("dedups per account, so a matching amount on another account is untouched", () => {
    const plan = planSync(
      input({
        added: [
          txn({ transaction_id: "t1", name: "STARBUCKS", amount: 4.33 }),
          txn({
            transaction_id: "t2",
            account_id: PLAID_CARD,
            name: "STARBUCKS",
            amount: 4.33,
          }),
        ],
        existingByAccount: new Map([
          [
            ACCT_CHECKING,
            [
              {
                transactionDate: "2026-08-12",
                amountCents: -433,
                description: "STARBUCKS",
              },
            ],
          ],
        ]),
      }),
    );
    expect(plan.inserts.map((i) => i.externalId)).toEqual(["t2"]);
    expect(plan.skippedDuplicate).toBe(1);
  });
});
