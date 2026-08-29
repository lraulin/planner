import { describe, expect, it } from "vitest";
import { planSync, type ExistingRow, type SyncPlanInput } from "./syncPlan";
import type { SimpleFinAccount, SimpleFinTransaction } from "./mapping";

const EXT_CHECKING = "sfin-checking";
const EXT_CARD = "sfin-card";
const ACCT_CHECKING = "acct-checking";
const ACCT_CARD = "acct-card";

/** 2026-08-12 and 2026-08-11, in epoch seconds. */
const D12 = 1786492800;
const D11 = 1786406400;

function txn(
  over: Partial<SimpleFinTransaction> & { id: string },
): SimpleFinTransaction {
  return { posted: D12, amount: "-4.33", description: "STARBUCKS", ...over };
}

function account(
  id: string,
  transactions: SimpleFinTransaction[],
  name = "360 Checking ...2322",
): SimpleFinAccount {
  return { id, name, balance: "100.00", transactions };
}

function existing(over: Partial<ExistingRow> = {}): ExistingRow {
  return {
    transactionDate: "2026-08-12",
    postedDate: null,
    amountCents: -433,
    description: "STARBUCKS",
    externalId: null,
    pending: false,
    ...over,
  };
}

function input(over: Partial<SyncPlanInput> = {}): SyncPlanInput {
  return {
    accounts: [],
    accountIdByExternal: new Map([
      [EXT_CHECKING, ACCT_CHECKING],
      [EXT_CARD, ACCT_CARD],
    ]),
    existingByAccount: new Map(),
    windowStart: "2026-08-01",
    ...over,
  };
}

describe("planSync — inserts", () => {
  it("inserts a new row against its linked account", () => {
    const plan = planSync(
      input({ accounts: [account(EXT_CHECKING, [txn({ id: "t1" })])] }),
    );
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0].accountId).toBe(ACCT_CHECKING);
    expect(plan.inserts[0].externalId).toBe("t1");
    // No negation — the amount is stored exactly as the provider reported it.
    expect(plan.inserts[0].transaction.amountCents).toBe(-433);
  });

  it("counts an unparseable amount instead of throwing", () => {
    const plan = planSync(
      input({ accounts: [account(EXT_CHECKING, [txn({ id: "t1", amount: "junk" })])] }),
    );
    expect(plan.inserts).toHaveLength(0);
    expect(plan.skippedUnparseable).toBe(1);
  });
});

describe("planSync — unlinked accounts", () => {
  it("reports an account with no link rather than dropping its rows silently", () => {
    const plan = planSync(
      input({
        accounts: [account("sfin-savings", [txn({ id: "t1" })])],
        accountIdByExternal: new Map([[EXT_CHECKING, ACCT_CHECKING]]),
      }),
    );
    expect(plan.inserts).toHaveLength(0);
    expect(plan.unlinkedAccountIds).toEqual(["sfin-savings"]);
  });
});

describe("planSync — updates", () => {
  it("updates a row it already holds", () => {
    const plan = planSync(
      input({
        accounts: [
          account(EXT_CHECKING, [
            txn({ id: "t1", description: "STARBUCKS #1234", amount: "-5.11" }),
          ]),
        ],
        existingByAccount: new Map([[ACCT_CHECKING, [existing({ externalId: "t1" })]]]),
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
        pending: false,
      },
    ]);
  });

  it("carries no user-owned columns, so a revision cannot blank a hand-set category", () => {
    const plan = planSync(
      input({
        accounts: [account(EXT_CHECKING, [txn({ id: "t1" })])],
        existingByAccount: new Map([[ACCT_CHECKING, [existing({ externalId: "t1" })]]]),
      }),
    );
    // If this list ever grows to include category/notes/flowOverride, a provider revision
    // would silently undo the user's own classification.
    expect(Object.keys(plan.updates[0]).sort()).toEqual([
      "amountCents",
      "description",
      "externalId",
      "pending",
      "postedDate",
      "transactionDate",
    ]);
  });
});

describe("planSync — pending resolution", () => {
  it("deletes a stored pending row the provider has stopped reporting", () => {
    // There is no pending->posted link in this protocol: the pending id simply vanishes.
    const plan = planSync(
      input({
        accounts: [account(EXT_CHECKING, [])],
        existingByAccount: new Map([
          [ACCT_CHECKING, [existing({ externalId: "p1", pending: true })]],
        ]),
      }),
    );
    expect(plan.deletes).toEqual(["p1"]);
  });

  it("keeps a pending row the provider still reports", () => {
    const plan = planSync(
      input({
        accounts: [
          account(EXT_CHECKING, [txn({ id: "p1", posted: 0, transacted_at: D11 })]),
        ],
        existingByAccount: new Map([
          [ACCT_CHECKING, [existing({ externalId: "p1", pending: true })]],
        ]),
      }),
    );
    expect(plan.deletes).toEqual([]);
    expect(plan.updates).toHaveLength(1);
  });

  it("never deletes a pending row older than the fetched window", () => {
    // Otherwise a narrow window would delete every pending row simply for not being asked
    // about.
    const plan = planSync(
      input({
        accounts: [account(EXT_CHECKING, [])],
        windowStart: "2026-08-10",
        existingByAccount: new Map([
          [
            ACCT_CHECKING,
            [
              existing({
                externalId: "old",
                pending: true,
                transactionDate: "2026-07-01",
              }),
            ],
          ],
        ]),
      }),
    );
    expect(plan.deletes).toEqual([]);
  });

  it("never deletes a posted row", () => {
    const plan = planSync(
      input({
        accounts: [account(EXT_CHECKING, [])],
        existingByAccount: new Map([
          [ACCT_CHECKING, [existing({ externalId: "t1", pending: false })]],
        ]),
      }),
    );
    expect(plan.deletes).toEqual([]);
  });

  it("suppresses a SimpleFIN replacement while the browser pending set is authoritative", () => {
    const plan = planSync(
      input({
        accounts: [
          account(EXT_CARD, [
            txn({
              id: "posted-chipotle",
              amount: "-16.91",
              description: "CHIPOTLE 0123",
            }),
          ]),
        ],
        existingByAccount: new Map([
          [
            ACCT_CARD,
            [
              existing({
                description: "CHIPOTLE 0123",
                amountCents: -1691,
                pending: true,
                externalId: null,
                authoritativeBrowserPending: true,
              }),
            ],
          ],
        ]),
      }),
    );
    expect(plan.inserts).toEqual([]);
    expect(plan.deletes).toEqual([]);
    expect(plan.skippedDuplicate).toBe(1);
  });

  it("lets SimpleFIN resume once browser authority has expired", () => {
    const plan = planSync(
      input({
        accounts: [
          account(EXT_CARD, [
            txn({
              id: "posted-chipotle",
              amount: "-16.91",
              description: "CHIPOTLE 0123",
            }),
          ]),
        ],
        existingByAccount: new Map([
          [
            ACCT_CARD,
            [
              existing({
                description: "Chipotle",
                amountCents: -1691,
                pending: true,
                externalId: null,
                authoritativeBrowserPending: false,
              }),
            ],
          ],
        ]),
      }),
    );
    expect(plan.inserts.map((row) => row.externalId)).toEqual(["posted-chipotle"]);
  });

  it("inserts the posted replacement AND deletes the pending row it supersedes", () => {
    // The interaction that is easy to get wrong: the posted row matches the pending row on
    // date, amount and description, so if the pending row is left in the comparison set the
    // posted row is dropped as a duplicate and the account ends up with neither.
    const plan = planSync(
      input({
        accounts: [account(EXT_CHECKING, [txn({ id: "posted-1", amount: "-4.33" })])],
        existingByAccount: new Map([
          [
            ACCT_CHECKING,
            [
              existing({
                externalId: "pending-1",
                pending: true,
                description: "STARBUCKS",
              }),
            ],
          ],
        ]),
      }),
    );
    expect(plan.deletes).toEqual(["pending-1"]);
    expect(plan.inserts.map((i) => i.externalId)).toEqual(["posted-1"]);
    expect(plan.skippedDuplicate).toBe(0);
  });
});

describe("planSync — cross-source dedup", () => {
  it("skips a row a statement import already covers", () => {
    const plan = planSync(
      input({
        accounts: [account(EXT_CHECKING, [txn({ id: "t1" })])],
        existingByAccount: new Map([
          [ACCT_CHECKING, [existing({ description: "Starbucks" })]],
        ]),
      }),
    );
    expect(plan.inserts).toHaveLength(0);
    expect(plan.skippedDuplicate).toBe(1);
  });

  it("skips a row whose descriptor expands a bank page's display name", () => {
    // The scrape wrote `Pizza Hut` off the Capital One transaction page; SimpleFIN reports
    // the same charge as `PIZZA HUT 036874`. Under description matching alone the sync
    // inserted a second copy beside it.
    const plan = planSync(
      input({
        accounts: [
          account(EXT_CHECKING, [
            txn({ id: "t1", description: "PIZZA HUT 036874", amount: "-32.52" }),
          ]),
        ],
        existingByAccount: new Map([
          [ACCT_CHECKING, [existing({ description: "Pizza Hut", amountCents: -3252 })]],
        ]),
      }),
    );
    expect(plan.inserts).toHaveLength(0);
    expect(plan.skippedDuplicate).toBe(1);
  });

  it("still inserts a row the existing window does not cover", () => {
    const plan = planSync(
      input({
        accounts: [
          account(EXT_CHECKING, [
            txn({ id: "t1", description: "SBARRO", amount: "-6.59" }),
          ]),
        ],
        existingByAccount: new Map([[ACCT_CHECKING, [existing()]]]),
      }),
    );
    expect(plan.inserts.map((i) => i.externalId)).toEqual(["t1"]);
  });

  it("keeps both of two identical same-day charges when only one is already stored", () => {
    // The occurrence-counting case `fingerprint.ts` exists for: two people, one lunch.
    const plan = planSync(
      input({
        accounts: [
          account(EXT_CHECKING, [
            txn({ id: "t1", description: "SBARRO", amount: "-6.59" }),
            txn({ id: "t2", description: "SBARRO", amount: "-6.59" }),
          ]),
        ],
        existingByAccount: new Map([
          [ACCT_CHECKING, [existing({ description: "SBARRO", amountCents: -659 })]],
        ]),
      }),
    );
    expect(plan.inserts).toHaveLength(1);
    expect(plan.skippedDuplicate).toBe(1);
  });

  it("dedups per account, so a matching amount on another account is untouched", () => {
    const plan = planSync(
      input({
        accounts: [
          account(EXT_CHECKING, [txn({ id: "t1" })]),
          account(EXT_CARD, [txn({ id: "t2" })], "Chase Prime Visa ...9910"),
        ],
        existingByAccount: new Map([[ACCT_CHECKING, [existing()]]]),
      }),
    );
    expect(plan.inserts.map((i) => i.externalId)).toEqual(["t2"]);
    expect(plan.skippedDuplicate).toBe(1);
  });
});
