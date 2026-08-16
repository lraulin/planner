/**
 * The sync itself: fetch a window, reconcile, persist. Plumbing — every judgement it makes
 * is delegated to `syncPlan.ts`, which is pure and tested.
 *
 * Split the way `src/lib/google/` is: `mirror.ts` decides and `sync.ts` moves bytes. The
 * network path here is not unit-tested, because testing it needs a live access URL; what
 * *can* be decided without one has been pushed out of this file on purpose.
 */

import { reclassifyTransactions } from "@/lib/finances/mutations";
import {
  BankReauthRequiredError,
  BankSubscriptionLapsedError,
  fetchAccounts,
} from "./client";
import { availableCentsOf, balanceAsOf, balanceCentsOf } from "./mapping";
import { applySync, saveBalance, setReauthRequired } from "./mutations";
import {
  existingRowsInWindow,
  listLinks,
  loadConnectionsForSync,
  type BankConnectionForSync,
} from "./queries";
import { planSync } from "./syncPlan";

/** How stale a connection may be before a page load refreshes it on its own. */
export const SYNC_MAX_AGE_MS = 5 * 60_000;

/**
 * Days re-read on every sync, beyond what has already been seen.
 *
 * The provider's own guidance is to overlap by about five days, because a transaction can
 * post later than the day it happened and would otherwise fall behind the window forever.
 * Also the span within which a pending row can be deleted for having disappeared, so it
 * needs to comfortably cover how long a charge stays pending.
 */
const OVERLAP_DAYS = 7;

/** How far back the very first sync reaches. The provider caps a window at 90 days. */
const INITIAL_DAYS = 89;

/**
 * What happened to one connection.
 *
 * `not_linked` and `ok` are deliberately distinct even though both are "no error": the UI
 * shows a matching prompt for the first and a timestamp for the second, and collapsing them
 * would hide a connection whose accounts were never bound to anything.
 */
export type ConnectionSyncStatus =
  | { state: "ok"; connectionId: string; label: string; counts: SyncCounts }
  | { state: "not_linked"; connectionId: string; label: string }
  | { state: "reauth_required"; connectionId: string; label: string }
  | {
      state: "subscription_lapsed";
      connectionId: string;
      label: string;
      message: string;
    }
  | { state: "failed"; connectionId: string; label: string; message: string };

export type SyncCounts = {
  inserted: number;
  updated: number;
  deleted: number;
  skippedDuplicate: number;
  skippedUnparseable: number;
  /** Provider accounts carrying data that nothing is linked to. */
  unlinkedAccounts: number;
  balancesUpdated: number;
  /** Per-connection problems the provider reported without failing the request. */
  providerErrors: string[];
};

export type SyncResult = {
  connections: ConnectionSyncStatus[];
  reclassified: boolean;
};

function shiftDays(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const today = (): string => new Date().toISOString().slice(0, 10);

async function syncOne(
  userId: string,
  connection: BankConnectionForSync,
): Promise<ConnectionSyncStatus> {
  const label = connection.label || "Bank sync";

  try {
    const links = await listLinks(userId, connection.id);
    if (links.length === 0) {
      return { state: "not_linked", connectionId: connection.id, label };
    }

    const accountIdByExternal = new Map(
      links.map((link) => [link.externalAccountId, link.accountId]),
    );
    const accountIds = links.map((link) => link.accountId);

    // Re-read a little before where we left off: a transaction can post later than the day
    // it happened, and would otherwise slip behind the window permanently.
    const windowStart = connection.syncedThrough
      ? shiftDays(connection.syncedThrough, -OVERLAP_DAYS)
      : shiftDays(today(), -INITIAL_DAYS);

    const set = await fetchAccounts(connection.accessUrl, {
      startDate: windowStart,
      pending: true,
    });

    const plan = planSync({
      accounts: set.accounts ?? [],
      accountIdByExternal,
      existingByAccount: await existingRowsInWindow(
        userId,
        accountIds,
        windowStart,
        // Generous upper bound: a pending row can carry a date slightly ahead of today.
        shiftDays(today(), 2),
      ),
      windowStart,
    });

    const applied = await applySync(userId, {
      connectionId: connection.id,
      inserts: plan.inserts,
      updates: plan.updates,
      deletes: plan.deletes,
      syncedThrough: today(),
    });

    // Balances come from the same response — no second call, and nothing metered.
    let balancesUpdated = 0;
    const linkByExternal = new Map(links.map((link) => [link.externalAccountId, link]));
    const requestedAt = new Date();
    for (const account of set.accounts ?? []) {
      const link = linkByExternal.get(account.id);
      if (!link) continue;
      await saveBalance(userId, {
        linkId: link.id,
        balanceCents: balanceCentsOf(account),
        availableCents: availableCentsOf(account),
        // The provider's own balance-date, not the time we asked — see D7b.
        asOf: balanceAsOf(account, requestedAt),
      });
      balancesUpdated++;
    }

    // A successful sync is proof the access URL works again.
    await setReauthRequired(userId, connection.id, false);

    return {
      state: "ok",
      connectionId: connection.id,
      label,
      counts: {
        ...applied,
        skippedDuplicate: plan.skippedDuplicate,
        skippedUnparseable: plan.skippedUnparseable,
        unlinkedAccounts: plan.unlinkedAccountIds.length,
        balancesUpdated,
        // Reported rather than thrown: one bank failing upstream must not discard the
        // others' data, which arrived in the same response.
        providerErrors: (set.errors ?? []).filter(
          (message): message is string => typeof message === "string",
        ),
      },
    };
  } catch (error) {
    if (error instanceof BankReauthRequiredError) {
      await setReauthRequired(userId, connection.id, true);
      return { state: "reauth_required", connectionId: connection.id, label };
    }
    if (error instanceof BankSubscriptionLapsedError) {
      // Deliberately not the reauth flag: paying is a different remedy from reconnecting,
      // and telling someone to re-link when their card expired sends them round a loop.
      return {
        state: "subscription_lapsed",
        connectionId: connection.id,
        label,
        message: error.message,
      };
    }
    return {
      state: "failed",
      connectionId: connection.id,
      label,
      message: error instanceof Error ? error.message : "Sync failed.",
    };
  }
}

/**
 * Sync every connection this user has.
 *
 * Per-connection failures are **collected, not thrown**: one connection being down or
 * needing re-setup must not stop another from updating.
 */
export async function syncAll(userId: string): Promise<SyncResult> {
  const connections = await loadConnectionsForSync(userId);
  if (connections.length === 0) return { connections: [], reclassified: false };

  const statuses: ConnectionSyncStatus[] = [];
  for (const connection of connections)
    statuses.push(await syncOne(userId, connection));

  // Synced rows land with `derivedFlow = null` like every imported row. Query-time
  // `effectiveFlow` fallbacks mean nothing breaks without this, but leaving a manual
  // Reclassify press in the loop reintroduces the manual step this feature exists to remove.
  const inserted = statuses.some(
    (status) => status.state === "ok" && status.counts.inserted > 0,
  );
  if (inserted) await reclassifyTransactions(userId);

  return { connections: statuses, reclassified: inserted };
}
