import { getCurrentUserId } from "@/lib/auth";
import {
  getSessionDetail,
  listExercises,
  listRepeatableTitles,
  listSessions,
} from "@/lib/fitness/queries";
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
  const [sessions, exercises, titles, copyFrom] = await Promise.all([
    listSessions(userId),
    listExercises(userId),
    listRepeatableTitles(userId),
    fromId ? getSessionDetail(userId, fromId) : Promise.resolve(null),
  ]);

  return (
    <FitnessView
      mode="sessions"
      initialSessions={sessions}
      initialExercises={exercises}
      openLog
      seedExerciseId={fromId ? null : (params.exercise ?? null)}
      initialSessionDetail={null}
      copyFrom={copyFrom}
      repeatableTitles={titles}
      openExerciseId={null}
    />
  );
}
