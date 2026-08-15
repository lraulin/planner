import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financeTransactions, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { listAccounts } from "@/lib/finances/queries";
import {
  applySync,
  deleteItem,
  linkAccount,
  saveBalance,
  saveItem,
  setReauthRequired,
  unlinkAccount,
} from "./mutations";
import {
  existingRowsInWindow,
  knownExternalIds,
  listItems,
  listLinks,
  loadItemsForSync,
} from "./queries";
import type { PlaidInsert } from "./syncPlan";

/**
 * Integration tests against the local Postgres (`npm run db:up`).
 *
 * The cross-user block is the point of this file as much as the happy paths: every function
 * here takes a `userId` and must scope by it, and a dropped `userId` in a `where` clause is
 * invisible when only one user ever exists.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("plaid bank sync");

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

function insertRow(accountId: string, over: Partial<PlaidInsert> = {}): PlaidInsert {
  return {
    accountId,
    externalId: `txn-${crypto.randomUUID()}`,
    pending: false,
    transaction: {
      transactionDate: "2026-08-12",
      postedDate: "2026-08-12",
      description: "STARBUCKS",
      amountCents: -433,
      sourceCategory: "FOOD_AND_DRINK",
      memo: "",
      balanceAfterCents: null,
    },
    ...over,
  };
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

describeDb("plaid items and links", () => {
  it("saves an item and lists it without exposing the access token", async () => {
    const userId = await makeUser();
    const itemRowId = await saveItem(userId, {
      itemId: "item-1",
      accessToken: "access-secret",
      institutionName: "Chase",
    });

    const items = await listItems(userId);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(itemRowId);
    expect(items[0].institutionName).toBe("Chase");
    expect(items[0].hasCursor).toBe(false);
    // The token must never leave this module's read path.
    expect(JSON.stringify(items)).not.toContain("access-secret");

    const forSync = await loadItemsForSync(userId);
    expect(forSync[0].accessToken).toBe("access-secret");
  });

  it("re-linking the same institution refreshes the token and clears the reauth flag", async () => {
    const userId = await makeUser();
    const itemRowId = await saveItem(userId, { itemId: "item-1", accessToken: "old" });
    await setReauthRequired(userId, itemRowId, true);
    expect((await listItems(userId))[0].reauthRequiredAt).not.toBeNull();

    const again = await saveItem(userId, { itemId: "item-1", accessToken: "new" });
    expect(again).toBe(itemRowId);
    expect((await loadItemsForSync(userId))[0].accessToken).toBe("new");
    expect((await listItems(userId))[0].reauthRequiredAt).toBeNull();
  });

  it("links an account and counts it against the item", async () => {
    const userId = await makeUser();
    const itemRowId = await saveItem(userId, { itemId: "item-1", accessToken: "t" });
    const accountId = await makeAccount(userId);

    await linkAccount(userId, {
      itemRowId,
      plaidAccountId: "plaid-acct-1",
      accountId,
      plaidType: "depository",
    });

    const links = await listLinks(userId);
    expect(links).toHaveLength(1);
    expect(links[0].accountId).toBe(accountId);
    expect((await listItems(userId))[0].linkedAccountCount).toBe(1);
  });

  it("re-linking the same plaid account moves it rather than duplicating", async () => {
    const userId = await makeUser();
    const itemRowId = await saveItem(userId, { itemId: "item-1", accessToken: "t" });
    const first = await makeAccount(userId, "1111");
    const second = await makeAccount(userId, "2222");

    await linkAccount(userId, { itemRowId, plaidAccountId: "p1", accountId: first });
    await linkAccount(userId, { itemRowId, plaidAccountId: "p1", accountId: second });

    const links = await listLinks(userId);
    expect(links).toHaveLength(1);
    expect(links[0].accountId).toBe(second);
  });

  it("stores a live balance snapshot in module sign", async () => {
    const userId = await makeUser();
    const itemRowId = await saveItem(userId, { itemId: "item-1", accessToken: "t" });
    const accountId = await makeAccount(userId);
    const linkId = await linkAccount(userId, {
      itemRowId,
      plaidAccountId: "p1",
      accountId,
    });

    const asOf = new Date("2026-08-15T12:00:00Z");
    await saveBalance(userId, {
      linkId,
      balanceCents: -41000,
      availableCents: null,
      asOf,
    });

    const [link] = await listLinks(userId);
    expect(link.balanceCents).toBe(-41000);
    expect(link.availableCents).toBeNull();
    expect(link.balanceAsOf?.toISOString()).toBe(asOf.toISOString());
  });

  it("deleting an item removes its links but keeps imported transactions", async () => {
    const userId = await makeUser();
    const itemRowId = await saveItem(userId, { itemId: "item-1", accessToken: "t" });
    const accountId = await makeAccount(userId);
    await linkAccount(userId, { itemRowId, plaidAccountId: "p1", accountId });
    await applySync(userId, {
      itemRowId,
      inserts: [insertRow(accountId)],
      updates: [],
      deletes: [],
      cursor: "c1",
    });

    await deleteItem(userId, itemRowId);

    expect(await listItems(userId)).toHaveLength(0);
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
  it("inserts rows, advances the cursor, and stamps lastSyncedAt together", async () => {
    const userId = await makeUser();
    const itemRowId = await saveItem(userId, { itemId: "item-1", accessToken: "t" });
    const accountId = await makeAccount(userId);

    const result = await applySync(userId, {
      itemRowId,
      inserts: [insertRow(accountId, { externalId: "t1" })],
      updates: [],
      deletes: [],
      cursor: "cursor-1",
    });

    expect(result).toEqual({ inserted: 1, updated: 0, deleted: 0 });
    const [item] = await loadItemsForSync(userId);
    expect(item.syncCursor).toBe("cursor-1");
    expect((await listItems(userId))[0].lastSyncedAt).not.toBeNull();
  });

  it("is idempotent — re-applying the same insert adds nothing", async () => {
    const userId = await makeUser();
    const itemRowId = await saveItem(userId, { itemId: "item-1", accessToken: "t" });
    const accountId = await makeAccount(userId);
    const row = insertRow(accountId, { externalId: "t1" });

    await applySync(userId, {
      itemRowId,
      inserts: [row],
      updates: [],
      deletes: [],
      cursor: "c1",
    });
    const second = await applySync(userId, {
      itemRowId,
      inserts: [row],
      updates: [],
      deletes: [],
      cursor: "c2",
    });

    // The partial unique index is the arbiter, exactly as it is for CSV import.
    expect(second.inserted).toBe(0);
  });

  it("updates Plaid-owned columns without touching a hand-set category or notes", async () => {
    const userId = await makeUser();
    const itemRowId = await saveItem(userId, { itemId: "item-1", accessToken: "t" });
    const accountId = await makeAccount(userId);

    await applySync(userId, {
      itemRowId,
      inserts: [insertRow(accountId, { externalId: "t1", pending: true })],
      updates: [],
      deletes: [],
      cursor: "c1",
    });

    // The user categorises and annotates the row by hand.
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
      itemRowId,
      inserts: [],
      updates: [
        {
          externalId: "t1",
          transactionDate: "2026-08-12",
          postedDate: "2026-08-13",
          description: "STARBUCKS #1234",
          amountCents: -511,
          sourceCategory: "FOOD_AND_DRINK",
          pending: false,
        },
      ],
      deletes: [],
      cursor: "c2",
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
    // The whole point: a Plaid revision must not undo the user's own work.
    expect(row.category).toBe("Coffee");
    expect(row.notes).toBe("with Dad");
  });

  it("deletes only rows from the plaid feed, never a statement-imported one", async () => {
    const userId = await makeUser();
    const itemRowId = await saveItem(userId, { itemId: "item-1", accessToken: "t" });
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
      itemRowId,
      inserts: [insertRow(accountId, { externalId: "shared-id" })],
      updates: [],
      deletes: [],
      cursor: "c1",
    });

    const result = await applySync(userId, {
      itemRowId,
      inserts: [],
      updates: [],
      deletes: ["shared-id"],
      cursor: "c2",
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
  it("returns plaid-feed external ids only", async () => {
    const userId = await makeUser();
    const itemRowId = await saveItem(userId, { itemId: "item-1", accessToken: "t" });
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
      itemRowId,
      inserts: [insertRow(accountId, { externalId: "plaid-1" })],
      updates: [],
      deletes: [],
      cursor: "c1",
    });

    const ids = await knownExternalIds(userId, [accountId]);
    expect([...ids]).toEqual(["plaid-1"]);
  });

  it("returns every feed's rows in the dedup window, not just plaid's", async () => {
    const userId = await makeUser();
    const accountId = await makeAccount(userId);
    await db.insert(financeTransactions).values([
      {
        userId,
        accountId,
        transactionDate: "2026-08-12",
        description: "IN WINDOW",
        amount: "-4.33",
        externalSource: "csv:chase-credit",
        externalId: "csv-1",
      },
      {
        userId,
        accountId,
        transactionDate: "2026-01-01",
        description: "OUT OF WINDOW",
        amount: "-1.00",
        externalSource: "csv:chase-credit",
        externalId: "csv-2",
      },
    ]);

    const window = await existingRowsInWindow(
      userId,
      [accountId],
      "2026-08-01",
      "2026-08-31",
    );
    // Cross-source dedup only works if it can see the CSV rows.
    expect(window.get(accountId)).toEqual([
      { transactionDate: "2026-08-12", amountCents: -433, description: "IN WINDOW" },
    ]);
  });
});

describeDb("cross-user isolation", () => {
  it("refuses to read, change or delete another user's connection", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const itemRowId = await saveItem(owner, {
      itemId: "item-1",
      accessToken: "owner-secret",
    });
    const accountId = await makeAccount(owner);
    const linkId = await linkAccount(owner, {
      itemRowId,
      plaidAccountId: "p1",
      accountId,
    });
    await applySync(owner, {
      itemRowId,
      inserts: [insertRow(accountId, { externalId: "t1" })],
      updates: [],
      deletes: [],
      cursor: "c1",
    });

    // Read
    expect(await listItems(intruder)).toEqual([]);
    expect(await loadItemsForSync(intruder)).toEqual([]);
    expect(await listLinks(intruder)).toEqual([]);
    expect([...(await knownExternalIds(intruder, [accountId]))]).toEqual([]);
    expect(
      (await existingRowsInWindow(intruder, [accountId], "2026-01-01", "2026-12-31"))
        .size,
    ).toBe(0);

    // Change
    await expect(setReauthRequired(intruder, itemRowId, true)).rejects.toThrow(
      /not found/i,
    );
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
        itemRowId,
        inserts: [],
        updates: [],
        deletes: ["t1"],
        cursor: "hijack",
      }),
    ).rejects.toThrow(/not found/i);

    // Delete
    await expect(unlinkAccount(intruder, linkId)).rejects.toThrow(/not found/i);
    await expect(deleteItem(intruder, itemRowId)).rejects.toThrow(/not found/i);

    // Nothing moved.
    const [item] = await loadItemsForSync(owner);
    expect(item.accessToken).toBe("owner-secret");
    expect(item.syncCursor).toBe("c1");
    expect(await listLinks(owner)).toHaveLength(1);
    const rows = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, owner));
    expect(rows).toHaveLength(1);
  });

  it("refuses to link another user's register account into its own item", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const victimAccount = await makeAccount(owner);
    const intruderItem = await saveItem(intruder, {
      itemId: "item-2",
      accessToken: "t",
    });

    // The item is the intruder's, but the register account is not.
    await expect(
      linkAccount(intruder, {
        itemRowId: intruderItem,
        plaidAccountId: "p1",
        accountId: victimAccount,
      }),
    ).rejects.toThrow(/Account not found/i);
    expect(await listLinks(intruder)).toEqual([]);
  });
});

describeDb("balance precedence in the register", () => {
  it("shows the live synced balance ahead of the ledger sum", async () => {
    const userId = await makeUser();
    const itemRowId = await saveItem(userId, { itemId: "item-1", accessToken: "t" });
    const accountId = await makeAccount(userId);
    const linkId = await linkAccount(userId, {
      itemRowId,
      plaidAccountId: "p1",
      accountId,
    });
    await applySync(userId, {
      itemRowId,
      inserts: [insertRow(accountId, { externalId: "t1" })],
      updates: [],
      deletes: [],
      cursor: "c1",
    });

    // Before a balance is read, the register falls back to summing its own rows.
    const beforeSync = await listAccounts(userId);
    expect(beforeSync[0].balanceCents).toBe(-433);
    expect(beforeSync[0].syncedBalanceAsOf).toBeNull();

    // The bank says the account holds $110 — more than the register knows about, because
    // the register has one row and the account has years of history.
    await saveBalance(userId, {
      linkId,
      balanceCents: 11000,
      availableCents: 10000,
      asOf: new Date("2026-08-15T12:00:00Z"),
    });

    const [account] = await listAccounts(userId);
    expect(account.balanceCents).toBe(11000);
    expect(account.ledgerBalanceCents).toBe(-433);
    // The mismatch is now the useful question: how far the register has drifted from the
    // bank, which is the same as asking whether the register is complete.
    expect(account.balanceMismatchCents).toBe(-11433);
    expect(account.syncedBalanceAsOf).not.toBeNull();
  });

  it("leaves an unlinked account on the statement-anchored rule", async () => {
    const userId = await makeUser();
    const linked = await makeAccount(userId, "1111");
    const unlinked = await makeAccount(userId, "2222");
    const itemRowId = await saveItem(userId, { itemId: "item-1", accessToken: "t" });
    const linkId = await linkAccount(userId, {
      itemRowId,
      plaidAccountId: "p1",
      accountId: linked,
    });
    await applySync(userId, {
      itemRowId,
      inserts: [
        insertRow(linked, { externalId: "t1" }),
        insertRow(unlinked, { externalId: "t2" }),
      ],
      updates: [],
      deletes: [],
      cursor: "c1",
    });
    await saveBalance(userId, {
      linkId,
      balanceCents: 500,
      availableCents: null,
      asOf: new Date(),
    });

    const accounts = await listAccounts(userId);
    const byId = new Map(accounts.map((a) => [a.id, a]));
    expect(byId.get(linked)?.balanceCents).toBe(500);
    // One account having a live feed must not change how any other account is valued.
    expect(byId.get(unlinked)?.balanceCents).toBe(-433);
    expect(byId.get(unlinked)?.balanceMismatchCents).toBe(0);
    expect(byId.get(unlinked)?.syncedBalanceAsOf).toBeNull();
  });
});
