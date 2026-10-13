import { localDateKey } from "@/lib/schedule/geometry";
import { listConnections, listLinks } from "@/lib/banksync/queries";
import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadAccountsWithPending } from "@/lib/finances/workingPendingQuery";
import { loadBudgetMismatch } from "@/lib/finances/budget/queries";
import { readSetting } from "@/lib/settings/queries";
import { parseBudget } from "@/lib/settings/finances";
import { BUDGET_SCOPE } from "@/lib/settings/scopes";
import { AccountsView } from "@/components/finances/accounts/AccountsView";

export const dynamic = "force-dynamic";
/**
 * The browser may show this payload again for 60 s. Must agree with `cachePolicy.ts`, which
 * says why this page qualifies; a test fails if the two drift.
 */
export const unstable_dynamicStaleTime = 60;

/** Catalog of register accounts — rename, reclassify, bank URL, close, delete. */
export default async function FinancesAccountsPage() {
  const userId = await getCurrentUserId();
  // Reads no ledger rows beyond the account totals and the pending holds: the view uses
  // accounts, those holds, and connection freshness, and nothing else
  // (`agent-os/specs/2026-10-13-1147-finance-narrow-ledger-reads/` D2).
  const [{ accounts, pending }, connections, links, mismatch] = await Promise.all([
    loadAccountsWithPending(userId),
    listConnections(userId),
    listLinks(userId),
    readSetting(userId, BUDGET_SCOPE).then((stored) =>
      loadBudgetMismatch(userId, parseBudget(stored).startMonth),
    ),
  ]);

  return (
    <Suspense fallback={<div className="min-h-0 flex-1" />}>
      <AccountsView
        initialAccounts={accounts}
        operations={{ pending: pending.rows, connections }}
        links={links}
        todayKey={localDateKey(new Date())}
        mismatch={mismatch}
      />
    </Suspense>
  );
}
