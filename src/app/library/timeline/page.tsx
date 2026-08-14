import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadChronology } from "@/lib/timeline/chronology";
import { AppShell } from "@/components/shell/AppShell";
import { TimelineView } from "@/components/timeline/TimelineView";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const userId = await getCurrentUserId();
  const rows = await loadChronology(userId);

  return (
    <AppShell active="library">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <TimelineView initialRows={rows} />
      </Suspense>
    </AppShell>
  );
}
