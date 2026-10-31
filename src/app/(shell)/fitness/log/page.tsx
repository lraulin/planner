import { getCurrentUserId } from "@/lib/auth";
import { getSessionDetail, loadFitnessLists } from "@/lib/fitness/queries";
import { FitnessView } from "@/components/fitness/FitnessView";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ exercise?: string; from?: string }>;

export default async function FitnessLogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const userId = await getCurrentUserId();
  const fromId = params.from?.trim() || null;
  const [lists, copyFrom] = await Promise.all([
    loadFitnessLists(userId),
    fromId ? getSessionDetail(userId, fromId) : Promise.resolve(null),
  ]);

  return (
    <FitnessView
      mode="sessions"
      {...lists}
      openLog
      seedExerciseId={fromId ? null : (params.exercise ?? null)}
      copyFrom={copyFrom}
    />
  );
}
