import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadOutline } from "@/lib/tree/queries";
import { AppShell } from "@/components/shell/AppShell";
import { ResultAreasGrid } from "@/components/tabs/ResultAreasGrid";

export const dynamic = "force-dynamic";

export default async function ResultAreasPage() {
  const userId = await getCurrentUserId();
  const nodes = await loadOutline(userId);

  return (
    <AppShell active="result-areas">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <ResultAreasGrid initialNodes={nodes} />
      </Suspense>
    </AppShell>
  );
}
