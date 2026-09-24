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
    fromBrowser: false,
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
    otherSourceExternalIds: new Set(),
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

describe("planSync — accounts sourced elsewhere", () => {
  it("writes nothing for a linked account whose history comes from the bank page", () => {
    const plan = planSync(
      input({
        accounts: [
          account(EXT_CARD, [txn({ id: "t1" }), txn({ id: "t2", pending: true })]),
        ],
        existingByAccount: new Map([
          [ACCT_CARD, [existing({ externalId: "hold-1", pending: true })]],
        ]),
        otherSourceExternalIds: new Set([EXT_CARD]),
      }),
    );
    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.unlisted).toEqual([]);
    expect(plan.deletes).toEqual([]);
    expect(plan.unlinkedAccountIds).toEqual([]);
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
  it("keeps and flags a stored pending row the provider stopped reporting when nothing succeeds it", () => {
    // There is no pending->posted link in this protocol: the pending id simply vanishes,
    // which is as true of a dropped authorization as of a posting. Silence alone deletes
    // nothing (holds-are-never-deleted-by-absence D5).
    const plan = planSync(
      input({
        accounts: [account(EXT_CHECKING, [])],
        existingByAccount: new Map([
          [ACCT_CHECKING, [existing({ externalId: "p1", pending: true })]],
        ]),
      }),
    );
    expect(plan.deletes).toEqual([]);
    expect(plan.unlisted).toEqual(["p1"]);
  });

  it("carries a vanished hold's envelope onto the posted row this sync inserts, then deletes it", () => {
    // Before D5 the delete dropped category, notes and flow whenever a SimpleFIN hold posted.
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
                budgetCategoryId: "coffee",
                notes: "with Sam",
              }),
            ],
          ],
        ]),
      }),
    );
    expect(plan.deletes).toEqual(["pending-1"]);
    expect(plan.unlisted).toEqual([]);
    expect(plan.carries).toEqual([
      {
        fromExternalId: "pending-1",
        to: { externalId: "posted-1" },
        carry: { budgetCategoryId: "coffee", notes: "with Sam" },
      },
    ]);
  });

  it("carries onto a posted row that is already stored, never overwriting the user's later word", () => {
    const plan = planSync(
      input({
        accounts: [account(EXT_CHECKING, [])],
        existingByAccount: new Map([
          [
            ACCT_CHECKING,
            [
              existing({
                externalId: "pending-1",
                pending: true,
                budgetCategoryId: "coffee",
                notes: "old note",
              }),
              existing({
                id: "posted-row",
                externalId: "posted-1",
                notes: "kept note",
              }),
            ],
          ],
        ]),
      }),
    );
    expect(plan.deletes).toEqual(["pending-1"]);
    expect(plan.carries).toEqual([
      {
        fromExternalId: "pending-1",
        to: { rowId: "posted-row" },
        carry: { budgetCategoryId: "coffee" },
      },
    ]);
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

  it("still matches a descriptor against a statement row's display name", () => {
    // A CSV wrote `Pizza Hut`; SimpleFIN reports the same charge as `PIZZA HUT 036874`.
    // Both are history feeds, so this is the matcher's job and it must recognise them.
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

  it("inserts a charge the bank page already posted — the handover retires the page's copy", () => {
    // 2026-09-10: Capital One's page had posted `SMECO` −$263.15. Every sync skipped
    // SimpleFIN's copy as its duplicate, then the sync whose watermark passed the day
    // retired the page's row, and the charge left the register with nothing replacing it.
    const plan = planSync(
      input({
        accounts: [
          account(EXT_CARD, [
            txn({ id: "smeco", description: "SMECO", amount: "-263.15" }),
          ]),
        ],
        existingByAccount: new Map([
          [
            ACCT_CARD,
            [
              existing({
                transactionDate: "2026-08-11",
                postedDate: "2026-08-12",
                description: "SMECO",
                amountCents: -26315,
                fromBrowser: true,
              }),
            ],
          ],
        ]),
      }),
    );
    expect(plan.inserts.map((row) => row.externalId)).toEqual(["smeco"]);
    expect(plan.skippedDuplicate).toBe(0);
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
