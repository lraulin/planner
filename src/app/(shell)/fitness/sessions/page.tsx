import { getCurrentUserId } from "@/lib/auth";
import { loadFitnessLists } from "@/lib/fitness/queries";
import { FitnessView } from "@/components/fitness/FitnessView";

export const dynamic = "force-dynamic";

/** The Sessions page: workout history. */
export default async function FitnessSessionsPage() {
  const userId = await getCurrentUserId();
  const lists = await loadFitnessLists(userId);

  return <FitnessView mode="sessions" {...lists} />;
}
