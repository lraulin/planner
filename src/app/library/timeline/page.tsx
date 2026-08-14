import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { deriveChronology, loadLifeHistory } from "@/lib/timeline/chronology";
import { deriveRibbon } from "@/lib/timeline/ribbon";
import { AppShell } from "@/components/shell/AppShell";
import { TimelineView } from "@/components/timeline/TimelineView";

export const dynamic = "force-dynamic";

/**
 * One read, two projections.
 *
 * The grid and the ribbon are the same records drawn two ways, and the reader flips between them
 * with a toolbar control rather than a navigation — so both are derived here, from a single
 * `loadLifeHistory`, and neither costs a round trip. That is also why this page keeps a toggle
 * where Notes has two routes: there, `Grid` and `Journal` need different queries.
 */
export default async function TimelinePage() {
  const userId = await getCurrentUserId();
  const { events, jobs, residences } = await loadLifeHistory(userId);

  return (
    <AppShell active="library">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <TimelineView
          initialRows={deriveChronology(events, jobs, residences)}
          initialRibbon={deriveRibbon(events, jobs, residences)}
        />
      </Suspense>
    </AppShell>
  );
}
