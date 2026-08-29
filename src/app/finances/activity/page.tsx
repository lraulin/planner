import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import {
  listFinanceAuditEvents,
  loadFinanceAuditEvent,
} from "@/lib/finances/audit/queries";
import { AppShell } from "@/components/shell/AppShell";
import { ActivityView } from "@/components/finances/activity/ActivityView";

export const dynamic = "force-dynamic";

/** Immutable, read-only evidence for every money-relevant finance change. */
export default async function FinancesActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string | string[]; batch?: string | string[] }>;
}) {
  const userId = await getCurrentUserId();
  const query = await searchParams;
  const requested = query.event ?? query.batch;
  const eventId = typeof requested === "string" ? requested : null;
  const [events, event] = await Promise.all([
    listFinanceAuditEvents(userId),
    eventId ? loadFinanceAuditEvent(userId, eventId) : Promise.resolve(null),
  ]);

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <ActivityView initialEvents={events} initialEvent={event} />
      </Suspense>
    </AppShell>
  );
}
