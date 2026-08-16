/**
 * Reads for the bank sync. Every one takes `userId` first and scopes on it.
 *
 * Nothing here returns an access URL to a caller outside `src/lib/banksync` —
 * `listConnections` omits the column entirely and `loadConnectionsForSync` is the one
 * function that carries it. That URL has the credentials embedded in it, so a page or an
 * action cannot accidentally serialise a live bank credential into a payload the browser
 * receives.
 */

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  bankAccountLinks,
  bankConnections,
  financeAccounts,
  financeTransactions,
} from "@/db/schema";
import { numericStringToCents } from "@/lib/finances/money";
import type { ExistingRow } from "./syncPlan";

/** A connection as the settings page shows it. Deliberately without the access URL. */
export type BankConnectionRow = {
  id: string;
  label: string;
  syncedThrough: string | null;
  lastSyncedAt: Date | null;
  reauthRequiredAt: Date | null;
  linkedAccountCount: number;
};

export async function listConnections(userId: string): Promise<BankConnectionRow[]> {
  const rows = await db
    .select({
      id: bankConnections.id,
      label: bankConnections.label,
      syncedThrough: bankConnections.syncedThrough,
      lastSyncedAt: bankConnections.lastSyncedAt,
      reauthRequiredAt: bankConnections.reauthRequiredAt,
    })
    .from(bankConnections)
    .where(eq(bankConnections.userId, userId));

  if (rows.length === 0) return [];

  const links = await db
    .select({ connectionId: bankAccountLinks.connectionId })
    .from(bankAccountLinks)
    .where(eq(bankAccountLinks.userId, userId));

  const counts = new Map<string, number>();
  for (const link of links) {
    counts.set(link.connectionId, (counts.get(link.connectionId) ?? 0) + 1);
  }

  return rows.map((row) => ({ ...row, linkedAccountCount: counts.get(row.id) ?? 0 }));
}

/** One connection with its access URL. Server-side sync only. */
export type BankConnectionForSync = {
  id: string;
  accessUrl: string;
  label: string;
  syncedThrough: string | null;
};

export async function loadConnectionsForSync(
  userId: string,
): Promise<BankConnectionForSync[]> {
  return db
    .select({
      id: bankConnections.id,
      accessUrl: bankConnections.accessUrl,
      label: bankConnections.label,
      syncedThrough: bankConnections.syncedThrough,
    })
    .from(bankConnections)
    .where(eq(bankConnections.userId, userId));
}

export type BankLinkRow = {
  id: string;
  connectionId: string;
  externalAccountId: string;
  accountId: string;
  institution: string;
  balanceCents: number | null;
  availableCents: number | null;
  balanceAsOf: Date | null;
};

/** Confirmed links, optionally narrowed to one connection. */
export async function listLinks(
  userId: string,
  connectionId?: string,
): Promise<BankLinkRow[]> {
  return db
    .select({
      id: bankAccountLinks.id,
      connectionId: bankAccountLinks.connectionId,
      externalAccountId: bankAccountLinks.externalAccountId,
      accountId: bankAccountLinks.accountId,
      institution: bankAccountLinks.institution,
      balanceCents: bankAccountLinks.balanceCents,
      availableCents: bankAccountLinks.availableCents,
      balanceAsOf: bankAccountLinks.balanceAsOf,
    })
    .from(bankAccountLinks)
    .where(
      connectionId
        ? and(
            eq(bankAccountLinks.userId, userId),
            eq(bankAccountLinks.connectionId, connectionId),
          )
        : eq(bankAccountLinks.userId, userId),
    );
}

/** Register accounts a provider account could be linked to, for the matching screen. */
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

/** External ids already stored under the sync feed. */
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
        eq(financeTransactions.externalSource, "api:simplefin"),
        inArray(financeTransactions.accountId, [...accountIds]),
      ),
    );
  return new Set(rows.flatMap((row) => (row.externalId ? [row.externalId] : [])));
}

/**
 * Existing rows in a date window, per account, for reconciliation and cross-source dedup.
 *
 * Loads **every** feed's rows, not just the sync's — the point is to recognise that a Chase
 * statement row and a synced row are the same event, and they carry different external ids
 * by construction. `externalId` and `pending` come along because the plan needs them to
 * tell "a row this feed wrote and is still pending" from "a row a statement wrote".
 */
export async function existingRowsInWindow(
  userId: string,
  accountIds: readonly string[],
  startDate: string,
  endDate: string,
): Promise<Map<string, ExistingRow[]>> {
  const out = new Map<string, ExistingRow[]>();
  if (accountIds.length === 0) return out;

  const rows = await db
    .select({
      accountId: financeTransactions.accountId,
      transactionDate: financeTransactions.transactionDate,
      amount: financeTransactions.amount,
      description: financeTransactions.description,
      externalId: financeTransactions.externalId,
      externalSource: financeTransactions.externalSource,
      pending: financeTransactions.pending,
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
      // Only this feed's ids count as "ours"; a statement row's id means nothing here and
      // must never be matched against a provider id or considered for deletion.
      externalId:
        row.externalSource === "api:simplefin" ? (row.externalId ?? null) : null,
      pending: row.pending,
    });
    out.set(row.accountId, bucket);
  }
  return out;
}
