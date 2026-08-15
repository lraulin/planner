/**
 * Reads for the bank sync. Every one takes `userId` first and scopes on it.
 *
 * Nothing here returns an access token to a caller outside `src/lib/plaid` — `loadItems`
 * omits the column entirely and `loadItemForSync` is the one function that carries it, so a
 * page or an action cannot accidentally serialise a bank credential into a payload the
 * browser receives.
 */

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeTransactions,
  plaidAccountLinks,
  plaidItems,
} from "@/db/schema";
import { numericStringToCents } from "@/lib/finances/money";

/** An Item as the settings page shows it. Deliberately without the access token. */
export type PlaidItemRow = {
  id: string;
  itemId: string;
  institutionId: string;
  institutionName: string;
  lastSyncedAt: Date | null;
  reauthRequiredAt: Date | null;
  hasCursor: boolean;
  linkedAccountCount: number;
};

export async function listItems(userId: string): Promise<PlaidItemRow[]> {
  const items = await db
    .select({
      id: plaidItems.id,
      itemId: plaidItems.itemId,
      institutionId: plaidItems.institutionId,
      institutionName: plaidItems.institutionName,
      lastSyncedAt: plaidItems.lastSyncedAt,
      reauthRequiredAt: plaidItems.reauthRequiredAt,
      syncCursor: plaidItems.syncCursor,
    })
    .from(plaidItems)
    .where(eq(plaidItems.userId, userId));

  if (items.length === 0) return [];

  const links = await db
    .select({ itemId: plaidAccountLinks.itemId })
    .from(plaidAccountLinks)
    .where(eq(plaidAccountLinks.userId, userId));

  const counts = new Map<string, number>();
  for (const link of links) counts.set(link.itemId, (counts.get(link.itemId) ?? 0) + 1);

  return items.map(({ syncCursor, ...item }) => ({
    ...item,
    hasCursor: syncCursor !== null,
    linkedAccountCount: counts.get(item.id) ?? 0,
  }));
}

/** One Item with its access token and cursor. Server-side sync only. */
export type PlaidItemForSync = {
  id: string;
  itemId: string;
  accessToken: string;
  syncCursor: string | null;
  institutionName: string;
};

export async function loadItemsForSync(userId: string): Promise<PlaidItemForSync[]> {
  return db
    .select({
      id: plaidItems.id,
      itemId: plaidItems.itemId,
      accessToken: plaidItems.accessToken,
      syncCursor: plaidItems.syncCursor,
      institutionName: plaidItems.institutionName,
    })
    .from(plaidItems)
    .where(eq(plaidItems.userId, userId));
}

export type PlaidLinkRow = {
  id: string;
  itemId: string;
  plaidAccountId: string;
  accountId: string;
  plaidType: string;
  plaidSubtype: string;
  balanceCents: number | null;
  availableCents: number | null;
  balanceAsOf: Date | null;
};

/** Confirmed links, optionally narrowed to one Item. */
export async function listLinks(
  userId: string,
  itemRowId?: string,
): Promise<PlaidLinkRow[]> {
  return db
    .select({
      id: plaidAccountLinks.id,
      itemId: plaidAccountLinks.itemId,
      plaidAccountId: plaidAccountLinks.plaidAccountId,
      accountId: plaidAccountLinks.accountId,
      plaidType: plaidAccountLinks.plaidType,
      plaidSubtype: plaidAccountLinks.plaidSubtype,
      balanceCents: plaidAccountLinks.balanceCents,
      availableCents: plaidAccountLinks.availableCents,
      balanceAsOf: plaidAccountLinks.balanceAsOf,
    })
    .from(plaidAccountLinks)
    .where(
      itemRowId
        ? and(
            eq(plaidAccountLinks.userId, userId),
            eq(plaidAccountLinks.itemId, itemRowId),
          )
        : eq(plaidAccountLinks.userId, userId),
    );
}

/** Register accounts a Plaid account could be linked to, for the confirmation screen. */
export async function linkableAccounts(
  userId: string,
): Promise<{ id: string; name: string; externalKey: string; kind: string }[]> {
  return db
    .select({
      id: financeAccounts.id,
      name: financeAccounts.name,
      externalKey: financeAccounts.externalKey,
      kind: financeAccounts.kind,
    })
    .from(financeAccounts)
    .where(eq(financeAccounts.userId, userId));
}

/** External ids already stored under the Plaid feed, so a sync can tell update from insert. */
export async function knownExternalIds(
  userId: string,
  accountIds: readonly string[],
): Promise<Set<string>> {
  if (accountIds.length === 0) return new Set();
  const rows = await db
    .select({ externalId: financeTransactions.externalId })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.externalSource, "api:plaid"),
        inArray(financeTransactions.accountId, [...accountIds]),
      ),
    );
  return new Set(rows.flatMap((row) => (row.externalId ? [row.externalId] : [])));
}

/**
 * Existing rows in a date window, per account, for cross-source dedup.
 *
 * Loads **every** feed's rows, not just Plaid's — the whole point is to recognise that a
 * Chase statement row and a Plaid row are the same event, and they carry different external
 * ids by construction.
 */
export async function existingRowsInWindow(
  userId: string,
  accountIds: readonly string[],
  startDate: string,
  endDate: string,
): Promise<
  Map<string, { transactionDate: string; amountCents: number; description: string }[]>
> {
  const out = new Map<
    string,
    { transactionDate: string; amountCents: number; description: string }[]
  >();
  if (accountIds.length === 0) return out;

  const rows = await db
    .select({
      accountId: financeTransactions.accountId,
      transactionDate: financeTransactions.transactionDate,
      amount: financeTransactions.amount,
      description: financeTransactions.description,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        inArray(financeTransactions.accountId, [...accountIds]),
        gte(financeTransactions.transactionDate, startDate),
        lte(financeTransactions.transactionDate, endDate),
      ),
    );

  for (const row of rows) {
    const bucket = out.get(row.accountId) ?? [];
    bucket.push({
      transactionDate: row.transactionDate,
      amountCents: numericStringToCents(row.amount) ?? 0,
      description: row.description,
    });
    out.set(row.accountId, bucket);
  }
  return out;
}
