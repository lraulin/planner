import { AppShell } from "@/components/shell/AppShell";
import { OverviewView } from "@/components/overview/OverviewView";
import { getCurrentUserId } from "@/lib/auth";
import { listMasterContexts } from "@/lib/contexts/queries";
import { organizerQueue } from "@/lib/organizer/queue";
import { localDateKey } from "@/lib/schedule/geometry";
import { loadOutline } from "@/lib/tree/queries";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const userId = await getCurrentUserId();
  const [nodes, masterContexts] = await Promise.all([
    loadOutline(userId),
    listMasterContexts(userId),
  ]);
  const inboxCount = organizerQueue(nodes, localDateKey(new Date())).length;

  return (
    <AppShell active="overview">
      <OverviewView
        nodes={nodes}
        inboxCount={inboxCount}
        masterContexts={masterContexts}
      />
    </AppShell>
  );
}
