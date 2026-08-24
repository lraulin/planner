import { AppShell } from "@/components/shell/AppShell";
import { TagsView } from "@/components/finances/tags/TagsView";
import { getCurrentUserId } from "@/lib/auth";
import { listFinanceTags } from "@/lib/finances/tags/queries";

export const dynamic = "force-dynamic";

export default async function FinancesTagsPage() {
  const userId = await getCurrentUserId();
  return (
    <AppShell active="finances">
      <TagsView initialTags={await listFinanceTags(userId)} />
    </AppShell>
  );
}
