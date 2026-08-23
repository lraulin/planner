import { Suspense } from "react";
import { PayeesView } from "@/components/finances/payees/PayeesView";
import { AppShell } from "@/components/shell/AppShell";
import { getCurrentUserId } from "@/lib/auth";
import { listPayees } from "@/lib/finances/payees/queries";

export const dynamic = "force-dynamic";

/** The canonical merchant names and the bank spellings each one answers to. */
export default async function FinancesPayeesPage() {
  const userId = await getCurrentUserId();
  const payees = await listPayees(userId);

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <PayeesView initialPayees={payees} />
      </Suspense>
    </AppShell>
  );
}
