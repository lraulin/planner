import { getCurrentUserId } from "@/lib/auth";
import { listExercises, listSessions } from "@/lib/fitness/queries";
import { FitnessView } from "@/components/fitness/FitnessView";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ exercise?: string }>;

export default async function FitnessLogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const userId = await getCurrentUserId();
  const [sessions, exercises] = await Promise.all([
    listSessions(userId),
    listExercises(userId),
  ]);

  return (
    <FitnessView
      mode="sessions"
      initialSessions={sessions}
      initialExercises={exercises}
      openLog
      seedExerciseId={params.exercise ?? null}
      initialSessionDetail={null}
      openExerciseId={null}
    />
  );
}
