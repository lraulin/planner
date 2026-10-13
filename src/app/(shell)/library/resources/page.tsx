import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadContactOptions } from "@/lib/contacts/queries";
import { listResources } from "@/lib/resources/queries";
import { ResourcesView } from "@/components/resources/ResourcesView";

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  const userId = await getCurrentUserId();
  const [resources, contacts] = await Promise.all([
    listResources(userId),
    loadContactOptions(userId),
  ]);

  return (
    <Suspense fallback={<div className="min-h-0 flex-1" />}>
      <ResourcesView initialResources={resources} contacts={contacts} />
    </Suspense>
  );
}
