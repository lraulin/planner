/**
 * The sync itself: fetch, plan, persist. Plumbing — every judgement it makes is delegated to
 * `syncPlan.ts`, which is pure and tested.
 *
 * Split the way `src/lib/google/` is: `mirror.ts` decides and `sync.ts` moves bytes. The
 * network path here is not unit-tested, because testing it needs a live Plaid token; what
 * *can* be decided without one has been pushed out of this file on purpose.
 */

import { reclassifyTransactions } from "@/lib/finances/mutations";
import {
  getBalances,
  PlaidReauthRequiredError,
  refreshTransactions,
  syncTransactions,
} from "./client";
import { availableCentsOf, balanceAsOfFrom, balanceCentsOf } from "./mapping";
import { applySync, saveBalance, setReauthRequired } from "./mutations";
import {
  existingRowsInWindow,
  knownExternalIds,
  listLinks,
  loadItemsForSync,
  type PlaidItemForSync,
} from "./queries";
import { planSync } from "./syncPlan";

/** How stale a connection may be before a page load refreshes it on its own. */
export const SYNC_MAX_AGE_MS = 5 * 60_000;

/** Hard stop on paging, so a pathological cursor cannot loop forever. */
const MAX_PAGES = 40;

/**
 * What happened to one connection.
 *
 * `not_linked` and `ok` are deliberately distinct even though both are "no error": the UI
 * shows a link prompt for the first and a timestamp for the second, and collapsing them
 * would hide an Item whose accounts were never bound to anything.
 */
export type ItemSyncStatus =
  | { state: "ok"; itemRowId: string; institution: string; counts: SyncCounts }
  | { state: "not_linked"; itemRowId: string; institution: string }
  | { state: "reauth_required"; itemRowId: string; institution: string }
  | { state: "failed"; itemRowId: string; institution: string; message: string };

export type SyncCounts = {
  inserted: number;
  updated: number;
  deleted: number;
  skippedDuplicate: number;
  skippedUnparseable: number;
  /** Plaid accounts carrying transactions that nothing is linked to. */
  unlinkedAccounts: number;
  balancesUpdated: number;
  /** False when the institution does not support forcing a transaction refresh. */
  transactionsForced: boolean;
};

export type SyncResult = {
  items: ItemSyncStatus[];
  reclassified: boolean;
};

const EMPTY_COUNTS: SyncCounts = {
  inserted: 0,
  updated: 0,
  deleted: 0,
  skippedDuplicate: 0,
  skippedUnparseable: 0,
  unlinkedAccounts: 0,
  balancesUpdated: 0,
  transactionsForced: false,
};

/** The date window the deltas touch, widened a little so dedup sees its neighbours. */
function dedupWindow(dates: readonly string[]): { start: string; end: string } | null {
  if (dates.length === 0) return null;
  const sorted = [...dates].sort();
  const shift = (key: string, days: number): string => {
    const date = new Date(`${key}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  // A statement row and a Plaid row for one event can differ by a day or two, since one
  // dates from posting and the other from authorisation.
  return { start: shift(sorted[0], -4), end: shift(sorted[sorted.length - 1], 4) };
}

async function syncOne(
  userId: string,
  item: PlaidItemForSync,
): Promise<ItemSyncStatus> {
  const institution = item.institutionName || "Bank";

  try {
    const links = await listLinks(userId, item.id);
    if (links.length === 0) {
      return { state: "not_linked", itemRowId: item.id, institution };
    }

    const accountIdByPlaidAccount = new Map(
      links.map((link) => [link.plaidAccountId, link.accountId]),
    );
    const accountIds = links.map((link) => link.accountId);

    // Ask the institution for anything new before reading. Unsupported at Capital One,
    // where this returns false and the cursor read below simply gets whatever Plaid has.
    const transactionsForced = await refreshTransactions(item.accessToken);

    // Page the cursor to exhaustion. `hasMore` is the only stop condition Plaid documents;
    // MAX_PAGES is a guard, not part of the contract.
    const added = [];
    const modified = [];
    const removed = [];
    let cursor = item.syncCursor;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await syncTransactions(item.accessToken, cursor);
      added.push(...result.added);
      modified.push(...result.modified);
      removed.push(...result.removed);
      cursor = result.nextCursor;
      if (!result.hasMore) break;
    }

    const touched = [...added, ...modified].map((t) => t.authorized_date || t.date);
    const window = dedupWindow(touched);

    const plan = planSync({
      added,
      modified,
      removed,
      accountIdByPlaidAccount,
      knownExternalIds: await knownExternalIds(userId, accountIds),
      existingByAccount: window
        ? await existingRowsInWindow(userId, accountIds, window.start, window.end)
        : new Map(),
    });

    const applied = await applySync(userId, {
      itemRowId: item.id,
      inserts: plan.inserts,
      updates: plan.updates,
      deletes: plan.deletes,
      cursor: cursor ?? "",
    });

    // Live balances, after the rows: a balance shown next to a stale register is worse
    // than one shown next to a current one.
    let balancesUpdated = 0;
    const balances = await getBalances(item.accessToken);
    const linkByPlaidAccount = new Map(
      links.map((link) => [link.plaidAccountId, link]),
    );
    const requestedAt = new Date();
    for (const account of balances) {
      const link = linkByPlaidAccount.get(account.account_id);
      if (!link) continue;
      await saveBalance(userId, {
        linkId: link.id,
        balanceCents: balanceCentsOf(account),
        availableCents: availableCentsOf(account),
        // Not `requestedAt` unconditionally: a Capital One card balance can be a day old,
        // and stamping it with now would present it as current.
        asOf: balanceAsOfFrom(account, requestedAt),
      });
      balancesUpdated++;
    }

    // A successful sync is proof the credentials work again.
    await setReauthRequired(userId, item.id, false);

    return {
      state: "ok",
      itemRowId: item.id,
      institution,
      counts: {
        ...applied,
        skippedDuplicate: plan.skippedDuplicate,
        skippedUnparseable: plan.skippedUnparseable,
        unlinkedAccounts: plan.unlinkedPlaidAccountIds.length,
        balancesUpdated,
        transactionsForced,
      },
    };
  } catch (error) {
    if (error instanceof PlaidReauthRequiredError) {
      await setReauthRequired(userId, item.id, true);
      return { state: "reauth_required", itemRowId: item.id, institution };
    }
    return {
      state: "failed",
      itemRowId: item.id,
      institution,
      message: error instanceof Error ? error.message : "Sync failed.",
    };
  }
}

/**
 * Sync every connection this user has.
 *
 * Per-Item failures are **collected, not thrown**: one bank being down or needing
 * re-authentication must not stop the other from updating, and a refresh that reports "Chase
 * updated, Capital One needs reconnecting" is more useful than one that reports nothing.
 */
export async function syncAll(userId: string): Promise<SyncResult> {
  const items = await loadItemsForSync(userId);
  if (items.length === 0) return { items: [], reclassified: false };

  const statuses: ItemSyncStatus[] = [];
  for (const item of items) statuses.push(await syncOne(userId, item));

  // Synced rows land with `derivedFlow = null` like every imported row. Query-time
  // `effectiveFlow` fallbacks mean nothing breaks without this, but leaving a manual
  // Reclassify press in the loop reintroduces the manual step this feature exists to remove.
  const inserted = statuses.some(
    (status) => status.state === "ok" && status.counts.inserted > 0,
  );
  if (inserted) await reclassifyTransactions(userId);

  return { items: statuses, reclassified: inserted };
}

/** Total rows written across a result, for a one-line summary. */
export function totalInserted(result: SyncResult): number {
  return result.items.reduce(
    (total, status) => total + (status.state === "ok" ? status.counts.inserted : 0),
    0,
  );
}

export { EMPTY_COUNTS };
