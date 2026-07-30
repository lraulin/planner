import { getCurrentUserId } from "@/lib/auth";
import { getSessionDetail, listExercises, listSessions } from "@/lib/fitness/queries";
import { TabStrip } from "@/components/shell/TabStrip";
import { FitnessView } from "@/components/fitness/FitnessView";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  log?: string;
  exercise?: string;
  session?: string;
}>;

export default async function FitnessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const userId = await getCurrentUserId();
  const [sessions, exercises, initialSessionDetail] = await Promise.all([
    listSessions(userId),
    listExercises(userId),
    params.session ? getSessionDetail(userId, params.session) : Promise.resolve(null),
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabStrip active="fitness" />
      <FitnessView
        initialSessions={sessions}
        initialExercises={exercises}
        openLog={params.log === "1" || params.log === "true"}
        seedExerciseId={params.exercise ?? null}
        initialSessionDetail={initialSessionDetail}
      />
    </div>
  );
}
