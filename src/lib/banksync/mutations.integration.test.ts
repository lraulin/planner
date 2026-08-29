import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financeTransactions, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { listAccounts } from "@/lib/finances/queries";
import {
  applySync,
  deleteConnection,
  linkAccount,
  replaceAccessUrl,
  saveBalance,
  saveConnection,
  setReauthRequired,
  unlinkAccount,
} from "./mutations";
import {
  existingRowsInWindow,
  knownExternalIds,
  listConnections,
  listLinks,
  loadConnectionsForSync,
} from "./queries";
import type { BankInsert } from "./syncPlan";

/**
 * Integration tests against the local Postgres (`npm run db:up`).
 *
 * The cross-user block is the point of this file as much as the happy paths: every function
 * here takes a `userId` and must scope by it, and a dropped `userId` in a `where` clause is
 * invisible when only one user ever exists.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("bank sync");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${crypto.randomUUID()}@localhost`, name: "Test User" })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

async function makeAccount(userId: string, externalKey = "0000"): Promise<string> {
  const [row] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: `Account ${externalKey}`,
      kind: "checking",
      externalSource: "csv:chase-credit",
      externalKey,
    })
    .returning({ id: financeAccounts.id });
  return row.id;
}

function insertRow(accountId: string, over: Partial<BankInsert> = {}): BankInsert {
  return {
    accountId,
    externalId: `txn-${crypto.randomUUID()}`,
    pending: false,
    transaction: {
      transactionDate: "2026-08-12",
      postedDate: "2026-08-12",
      description: "STARBUCKS",
      amountCents: -433,
      sourceCategory: "",
      memo: "",
      balanceAfterCents: null,
    },
    ...over,
  };
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

describeDb("connections and links", () => {
  it("saves a connection and lists it without exposing the access URL", async () => {
    const userId = await makeUser();
    const connectionId = await saveConnection(userId, {
      accessUrl: "https://user:super-secret@example.test/simplefin",
      label: "SimpleFIN",
    });

    const rows = await listConnections(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(connectionId);
    // The access URL carries the credentials; it must never leave this module's read path.
    expect(JSON.stringify(rows)).not.toContain("super-secret");

    const forSync = await loadConnectionsForSync(userId);
    expect(forSync[0].accessUrl).toContain("super-secret");
  });

  it("replaces the access URL and clears the reauth flag", async () => {
    const userId = await makeUser();
    const connectionId = await saveConnection(userId, {
      accessUrl: "https://a:b@x.test",
    });
    await setReauthRequired(userId, connectionId, true);
    expect((await listConnections(userId))[0].reauthRequiredAt).not.toBeNull();

    await replaceAccessUrl(userId, connectionId, "https://a:c@x.test");
    expect((await loadConnectionsForSync(userId))[0].accessUrl).toBe(
      "https://a:c@x.test",
    );
    expect((await listConnections(userId))[0].reauthRequiredAt).toBeNull();
  });

  it("re-linking the same provider account moves it rather than duplicating", async () => {
    const userId = await makeUser();
    const connectionId = await saveConnection(userId, {
      accessUrl: "https://a:b@x.test",
    });
    const first = await makeAccount(userId, "1111");
    const second = await makeAccount(userId, "2222");

    await linkAccount(userId, {
      connectionId,
      externalAccountId: "p1",
      accountId: first,
    });
    await linkAccount(userId, {
      connectionId,
      externalAccountId: "p1",
      accountId: second,
    });

    const links = await listLinks(userId);
    expect(links).toHaveLength(1);
    expect(links[0].accountId).toBe(second);
    expect((await listConnections(userId))[0].linkedAccountCount).toBe(1);
  });

  it("refuses a second provider account on a register account that already has one", async () => {
    const userId = await makeUser();
    const connectionId = await saveConnection(userId, {
      accessUrl: "https://a:b@x.test",
    });
    const accountId = await makeAccount(userId);

    await linkAccount(userId, { connectionId, externalAccountId: "p1", accountId });

    // Two unique indexes guard this table and onConflictDoUpdate can only name one, so
    // without the explicit check this surfaced as a raw driver error carrying the SQL.
    await expect(
      linkAccount(userId, { connectionId, externalAccountId: "p2", accountId }),
    ).rejects.toThrow(/already matched to another bank account/i);

    // Re-matching the same provider account is still an upsert, not a clash.
    await expect(
      linkAccount(userId, { connectionId, externalAccountId: "p1", accountId }),
    ).resolves.toBeTruthy();
    expect(await listLinks(userId)).toHaveLength(1);
  });

  it("keeps reporting unmatched accounts for as long as they are unmatched", async () => {
    const userId = await makeUser();
    const connectionId = await saveConnection(userId, {
      accessUrl: "https://a:b@x.test",
    });
    const accountId = await makeAccount(userId);
    await linkAccount(userId, { connectionId, externalAccountId: "p1", accountId });

    await applySync(userId, {
      connectionId,
      inserts: [],
      updates: [],
      deletes: [],
      syncedThrough: "2026-08-16",
      unmatchedAccountCount: 3,
    });
    expect((await listConnections(userId))[0].unmatchedAccountCount).toBe(3);

    // The next sync has moved past those transactions and reports nothing about them, so a
    // count that only ever went up would be as misleading as one that vanished.
    await applySync(userId, {
      connectionId,
      inserts: [],
      updates: [],
      deletes: [],
      syncedThrough: "2026-08-17",
      unmatchedAccountCount: 0,
    });
    expect((await listConnections(userId))[0].unmatchedAccountCount).toBe(0);
  });

  it("deleting a connection removes its links but keeps imported transactions", async () => {
    const userId = await makeUser();
    const connectionId = await saveConnection(userId, {
      accessUrl: "https://a:b@x.test",
    });
    const accountId = await makeAccount(userId);
    await linkAccount(userId, { connectionId, externalAccountId: "p1", accountId });
    await applySync(userId, {
      connectionId,
      inserts: [insertRow(accountId)],
      updates: [],
      deletes: [],
      syncedThrough: "2026-08-16",
      unmatchedAccountCount: 0,
    });

    await deleteConnection(userId, connectionId);

    expect(await listConnections(userId)).toHaveLength(0);
    expect(await listLinks(userId)).toHaveLength(0);
    const rows = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, userId));
    // The register keeps its history when a connection goes away.
    expect(rows).toHaveLength(1);
  });
});

describeDb("applySync", () => {
  it("inserts rows and advances the window together", async () => {
    const userId = await makeUser();
    const connectionId = await saveConnection(userId, {
      accessUrl: "https://a:b@x.test",
    });
    const accountId = await makeAccount(userId);

    const result = await applySync(userId, {
      connectionId,
      inserts: [insertRow(accountId, { externalId: "t1" })],
      updates: [],
      deletes: [],
      syncedThrough: "2026-08-16",
      unmatchedAccountCount: 0,
    });

    expect(result).toMatchObject({ inserted: 1, updated: 0, deleted: 0 });
    expect(result.auditEventId).toEqual(expect.any(String));
    expect(result.auditBatchId).toEqual(expect.any(String));
    expect((await loadConnectionsForSync(userId))[0].syncedThrough).toBe("2026-08-16");
    expect((await listConnections(userId))[0].lastSyncedAt).not.toBeNull();
  });

  it("is idempotent — re-applying the same insert adds nothing", async () => {
    const userId = await makeUser();
    const connectionId = await saveConnection(userId, {
      accessUrl: "https://a:b@x.test",
    });
    const accountId = await makeAccount(userId);
    const row = insertRow(accountId, { externalId: "t1" });

    await applySync(userId, {
      connectionId,
      inserts: [row],
      updates: [],
      deletes: [],
      syncedThrough: "2026-08-16",
      unmatchedAccountCount: 0,
    });
    const second = await applySync(userId, {
      connectionId,
      inserts: [row],
      updates: [],
      deletes: [],
      syncedThrough: "2026-08-17",
      unmatchedAccountCount: 0,
    });
    expect(second.inserted).toBe(0);
  });

  it("updates provider columns without touching a hand-set category or notes", async () => {
    const userId = await makeUser();
    const connectionId = await saveConnection(userId, {
      accessUrl: "https://a:b@x.test",
    });
    const accountId = await makeAccount(userId);

    await applySync(userId, {
      connectionId,
      inserts: [insertRow(accountId, { externalId: "t1", pending: true })],
      updates: [],
      deletes: [],
      syncedThrough: "2026-08-16",
      unmatchedAccountCount: 0,
    });
    await db
      .update(financeTransactions)
      .set({ category: "Coffee", notes: "with Dad" })
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.externalId, "t1"),
        ),
      );

    const result = await applySync(userId, {
      connectionId,
      inserts: [],
      updates: [
        {
          externalId: "t1",
          transactionDate: "2026-08-12",
          postedDate: "2026-08-13",
          description: "STARBUCKS #1234",
          amountCents: -511,
          pending: false,
        },
      ],
      deletes: [],
      syncedThrough: "2026-08-16",
      unmatchedAccountCount: 0,
    });

    expect(result.updated).toBe(1);
    const [row] = await db
      .select({
        description: financeTransactions.description,
        amount: financeTransactions.amount,
        pending: financeTransactions.pending,
        category: financeTransactions.category,
        notes: financeTransactions.notes,
      })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.externalId, "t1"),
        ),
      );

    expect(row.description).toBe("STARBUCKS #1234");
    expect(row.amount).toBe("-5.11");
    expect(row.pending).toBe(false);
    // The whole point: a provider revision must not undo the user's own work.
    expect(row.category).toBe("Coffee");
    expect(row.notes).toBe("with Dad");
  });

  it("deletes only rows from the sync feed, never a statement-imported one", async () => {
    const userId = await makeUser();
    const connectionId = await saveConnection(userId, {
      accessUrl: "https://a:b@x.test",
    });
    const accountId = await makeAccount(userId);

    // A statement row that happens to carry the same external id under a different feed.
    await db.insert(financeTransactions).values({
      userId,
      accountId,
      transactionDate: "2026-08-12",
      description: "FROM A STATEMENT",
      amount: "-9.99",
      externalSource: "csv:chase-credit",
      externalId: "shared-id",
    });
    await applySync(userId, {
      connectionId,
      inserts: [insertRow(accountId, { externalId: "shared-id" })],
      updates: [],
      deletes: [],
      syncedThrough: "2026-08-16",
      unmatchedAccountCount: 0,
    });

    const result = await applySync(userId, {
      connectionId,
      inserts: [],
      updates: [],
      deletes: ["shared-id"],
      syncedThrough: "2026-08-16",
      unmatchedAccountCount: 0,
    });

    expect(result.deleted).toBe(1);
    const remaining = await db
      .select({ source: financeTransactions.externalSource })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, userId));
    expect(remaining.map((r) => r.source)).toEqual(["csv:chase-credit"]);
  });
});

describeDb("queries for the sync window", () => {
  it("returns sync-feed external ids only", async () => {
    const userId = await makeUser();
    const connectionId = await saveConnection(userId, {
      accessUrl: "https://a:b@x.test",
    });
    const accountId = await makeAccount(userId);
    await db.insert(financeTransactions).values({
      userId,
      accountId,
      transactionDate: "2026-08-12",
      description: "CSV ROW",
      amount: "-1.00",
      externalSource: "csv:chase-credit",
      externalId: "csv-1",
    });
    await applySync(userId, {
      connectionId,
      inserts: [insertRow(accountId, { externalId: "sfin-1" })],
      updates: [],
      deletes: [],
      syncedThrough: "2026-08-16",
      unmatchedAccountCount: 0,
    });

    expect([...(await knownExternalIds(userId, [accountId]))]).toEqual(["sfin-1"]);
  });

  it("marks a statement row's external id as not ours, so it can never be deleted", async () => {
    const userId = await makeUser();
    const accountId = await makeAccount(userId);
    await db.insert(financeTransactions).values({
      userId,
      accountId,
      transactionDate: "2026-08-12",
      description: "CSV ROW",
      amount: "-1.00",
      externalSource: "csv:chase-credit",
      externalId: "csv-1",
      pending: true,
    });

    const window = await existingRowsInWindow(
      userId,
      [accountId],
      "2026-08-01",
      "2026-08-31",
    );
    // A statement id must read as null here, or reconciliation could delete a row this
    // feed never wrote.
    expect(window.get(accountId)).toEqual([
      {
        transactionDate: "2026-08-12",
        amountCents: -100,
        description: "CSV ROW",
        externalId: null,
        pending: true,
        authoritativeBrowserPending: false,
      },
    ]);
  });
});

describeDb("balance precedence in the register", () => {
  it("shows the synced balance ahead of the ledger sum", async () => {
    const userId = await makeUser();
    const connectionId = await saveConnection(userId, {
      accessUrl: "https://a:b@x.test",
    });
    const accountId = await makeAccount(userId);
    const linkId = await linkAccount(userId, {
      connectionId,
      externalAccountId: "p1",
      accountId,
    });
    await applySync(userId, {
      connectionId,
      inserts: [insertRow(accountId, { externalId: "t1" })],
      updates: [],
      deletes: [],
      syncedThrough: "2026-08-16",
      unmatchedAccountCount: 0,
    });

    const before = await listAccounts(userId);
    expect(before[0].balanceCents).toBe(-433);
    expect(before[0].syncedBalanceAsOf).toBeNull();

    await saveBalance(userId, {
      linkId,
      balanceCents: 11000,
      availableCents: 10000,
      asOf: new Date("2026-08-15T12:00:00Z"),
    });

    const [account] = await listAccounts(userId);
    expect(account.balanceCents).toBe(11000);
    expect(account.ledgerBalanceCents).toBe(-433);
    // The mismatch is the useful question: how far the register has drifted from the bank.
    expect(account.balanceMismatchCents).toBe(-11433);
    expect(account.syncedBalanceAsOf).not.toBeNull();
  });

  it("stores a credit-card balance negative, exactly as the provider reports it", async () => {
    const userId = await makeUser();
    const connectionId = await saveConnection(userId, {
      accessUrl: "https://a:b@x.test",
    });
    const accountId = await makeAccount(userId, "9910");
    const linkId = await linkAccount(userId, {
      connectionId,
      externalAccountId: "card",
      accountId,
    });

    // No branch on account type anywhere in the path — the provider's sign is the register's
    // sign. If a card ever comes back positive, this is where it must be caught.
    await saveBalance(userId, {
      linkId,
      balanceCents: -41000,
      availableCents: null,
      asOf: new Date(),
    });

    const [account] = await listAccounts(userId);
    expect(account.balanceCents).toBe(-41000);
  });
});

describeDb("cross-user isolation", () => {
  it("refuses to read, change or delete another user's connection", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const connectionId = await saveConnection(owner, {
      accessUrl: "https://user:owner-secret@example.test/sfin",
      label: "Owner bank",
    });
    const accountId = await makeAccount(owner);
    const linkId = await linkAccount(owner, {
      connectionId,
      externalAccountId: "p1",
      accountId,
    });
    await applySync(owner, {
      connectionId,
      inserts: [insertRow(accountId, { externalId: "t1" })],
      updates: [],
      deletes: [],
      syncedThrough: "2026-08-16",
      unmatchedAccountCount: 0,
    });

    // Read
    expect(await listConnections(intruder)).toEqual([]);
    expect(await loadConnectionsForSync(intruder)).toEqual([]);
    expect(await listLinks(intruder)).toEqual([]);
    expect([...(await knownExternalIds(intruder, [accountId]))]).toEqual([]);
    expect(
      (await existingRowsInWindow(intruder, [accountId], "2026-01-01", "2026-12-31"))
        .size,
    ).toBe(0);

    // Change
    await expect(setReauthRequired(intruder, connectionId, true)).rejects.toThrow(
      /not found/i,
    );
    await expect(
      replaceAccessUrl(intruder, connectionId, "https://x:y@evil.test"),
    ).rejects.toThrow(/not found/i);
    await expect(
      saveBalance(intruder, {
        linkId,
        balanceCents: 1,
        availableCents: null,
        asOf: new Date(),
      }),
    ).rejects.toThrow(/not found/i);
    await expect(
      applySync(intruder, {
        connectionId,
        inserts: [],
        updates: [],
        deletes: ["t1"],
        syncedThrough: "2026-08-16",
        unmatchedAccountCount: 0,
      }),
    ).rejects.toThrow(/not found/i);

    // Delete
    await expect(unlinkAccount(intruder, linkId)).rejects.toThrow(/not found/i);
    await expect(deleteConnection(intruder, connectionId)).rejects.toThrow(
      /not found/i,
    );

    // Nothing moved.
    const [connection] = await loadConnectionsForSync(owner);
    expect(connection.accessUrl).toContain("owner-secret");
    expect(await listLinks(owner)).toHaveLength(1);
    const rows = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, owner));
    expect(rows).toHaveLength(1);
  });

  it("refuses to link another user's register account into its own connection", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const victimAccount = await makeAccount(owner);
    const intruderConnection = await saveConnection(intruder, {
      accessUrl: "https://a:b@x.test",
    });

    await expect(
      linkAccount(intruder, {
        connectionId: intruderConnection,
        externalAccountId: "p1",
        accountId: victimAccount,
      }),
    ).rejects.toThrow(/Account not found/i);
    expect(await listLinks(intruder)).toEqual([]);
  });
});
