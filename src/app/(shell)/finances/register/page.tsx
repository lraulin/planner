import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { listAccounts, loadRegisterInitial } from "@/lib/finances/queries";
import { loadRecurringBills } from "@/lib/finances/dashboardQueries";
import { claimedPayeesOf } from "@/lib/finances/registerBillDraft";
import { listBudgetEnvelopeOptions } from "@/lib/finances/budget/queries";
import { listPayees } from "@/lib/finances/payees/queries";
import { readerTodayKey } from "@/lib/schedule/readerZone";
import { FinancesView } from "@/components/finances/FinancesView";
import { readSetting } from "@/lib/settings/queries";
import { BUDGET_SCOPE } from "@/lib/settings/scopes";
import { parseBudget } from "@/lib/settings/finances";

export const dynamic = "force-dynamic";

/**
 * The Register page: a compact index of every matching row, plus the first 100
 * transaction details. Deliberately does not read `searchParams` — awaiting them
 * subscribed this server component to `?detail=` and reloaded the ledger when the
 * drawer opened.
 */
export default async function FinancesRegisterPage() {
  const userId = await getCurrentUserId();
  // The reader's day, not the process's: the browser sends its own `today` in the query, and
  // this page's first query is only kept when the two keys are equal. On Vercel the process
  // zone is UTC, so for four evening hours a day `localDateKey` named tomorrow and the
  // server's work was discarded for a second request
  // (`agent-os/specs/2026-10-13-1147-finance-narrow-ledger-reads/` D7).
  const todayKey = readerTodayKey();
  // The first paint reads this month's rows, the rows whose Category can be refused, and one
  // count: not the ledger (D8, D9). The accounts and the bills are shared with the reads
  // beside it through `oncePerRequest`.
  const [
    { prepared: initialPrepared, defaultCollapsedGroups },
    accounts,
    bills,
    envelopeCatalog,
    payees,
  ] = await Promise.all([
    loadRegisterInitial(
      userId,
      todayKey,
      readSetting(userId, BUDGET_SCOPE).then(
        (stored) => parseBudget(stored).startMonth,
      ),
    ),
    listAccounts(userId),
    loadRecurringBills(userId),
    listBudgetEnvelopeOptions(userId),
    listPayees(userId),
  ]);

  return (
    <Suspense fallback={<div className="min-h-0 flex-1" />}>
      <FinancesView
        initialPrepared={initialPrepared}
        initialAccounts={accounts}
        initialClaimed={claimedPayeesOf(bills)}
        catalog={envelopeCatalog}
        payees={payees.map(({ id, name }) => ({ id, name }))}
        todayKey={todayKey}
        defaultCollapsedGroups={defaultCollapsedGroups}
      />
    </Suspense>
  );
}
