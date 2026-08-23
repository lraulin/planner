import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { listAccounts } from "@/lib/finances/queries";
import { listSchedules } from "@/lib/finances/schedules/queries";
import { listPayees } from "@/lib/finances/payees/queries";
import { DEFAULT_UPCOMING_LENGTH } from "@/lib/finances/schedules/status";
import { toDateKey } from "@/lib/schedule/geometry";
import { AppShell } from "@/components/shell/AppShell";
import { SchedulesView } from "@/components/finances/schedules/SchedulesView";

export const dynamic = "force-dynamic";

/**
 * Recurring transactions, Actual-style, running beside declared bills rather than
 * replacing them (`agent-os/specs/2026-08-22-2124-actual-schedules/`).
 */
export default async function FinancesSchedulesPage() {
  const userId = await getCurrentUserId();
  const todayKey = toDateKey(new Date());
  const [rows, accounts, payees] = await Promise.all([
    listSchedules(userId, todayKey, DEFAULT_UPCOMING_LENGTH),
    listAccounts(userId),
    listPayees(userId),
  ]);

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <SchedulesView initialRows={rows} accounts={accounts} payees={payees} />
      </Suspense>
    </AppShell>
  );
}
