import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadDashboard } from "@/lib/finances/dashboardQueries";
import { AppShell } from "@/components/shell/AppShell";
import { DashboardView } from "@/components/finances/dashboard/DashboardView";

export const dynamic = "force-dynamic";

/**
 * The Finances dashboard: where the money is right now, and what is left before payday.
 *
 * The one finance page that answers a forward-looking question. Register, Insights and
 * Statements all read the past; this one exists because the question that actually changes
 * behaviour on a Tuesday is "can I spend this", and until the bank feed landed there was no
 * data fresh enough to answer it honestly.
 *
 * One read, because every panel is a different slice of the same position. The day count is
 * deliberately **not** computed here: it depends on the reader's local day, and a server that
 * decides what "today" is makes the headline depend on the deploy region
 * (`agent-os/standards/development/dates.md`).
 */
export default async function FinancesDashboardPage() {
  const userId = await getCurrentUserId();
  const data = await loadDashboard(userId);

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <DashboardView
          accounts={data.accounts}
          pending={data.pending}
          bills={data.bills}
          spend={data.spend}
          paydays={data.paydays}
          billCharges={data.billCharges}
          spendCharges={Object.fromEntries(data.spendCharges)}
          connections={data.connections}
          periodRows={data.periodRows}
        />
      </Suspense>
    </AppShell>
  );
}
