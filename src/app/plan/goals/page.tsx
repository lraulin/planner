import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadOutline } from "@/lib/tree/queries";
import { AppShell } from "@/components/shell/AppShell";
import { GoalsGrid } from "@/components/tabs/GoalsGrid";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const userId = await getCurrentUserId();
  const nodes = await loadOutline(userId);

  return (
    <AppShell active="plan">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <GoalsGrid initialNodes={nodes} />
      </Suspense>
    </AppShell>
  );
}
