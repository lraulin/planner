import { AppShell } from "@/components/shell/AppShell";
import { OrganizerView } from "@/components/organizer/OrganizerView";
import { getCurrentUserId } from "@/lib/auth";
import { organizerQueue } from "@/lib/organizer/queue";
import { localDateKey } from "@/lib/schedule/geometry";
import { loadOutline } from "@/lib/tree/queries";

export const dynamic = "force-dynamic";

export default async function OrganizePage() {
  const userId = await getCurrentUserId();
  const nodes = await loadOutline(userId);
  const now = new Date();
  const today = localDateKey(now);

  return (
    <AppShell active={null}>
      <OrganizerView
        nodes={nodes}
        queue={organizerQueue(nodes, today)}
        today={today}
        nowIso={now.toISOString()}
      />
    </AppShell>
  );
}
