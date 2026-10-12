import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadStatementsView } from "@/lib/finances/queries";
import { AppShell } from "@/components/shell/AppShell";
import { StatementsView } from "@/components/finances/StatementsView";

export const dynamic = "force-dynamic";

/** Official statement snapshots compared to the register. */
export default async function FinancesStatementsPage() {
  const userId = await getCurrentUserId();
  const { rows, holes } = await loadStatementsView(userId);

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <StatementsView rows={rows} holes={holes} />
      </Suspense>
    </AppShell>
  );
}
