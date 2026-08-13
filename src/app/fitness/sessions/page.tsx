import { getCurrentUserId } from "@/lib/auth";
import { listExercises, listSessions } from "@/lib/fitness/queries";
import { FitnessView } from "@/components/fitness/FitnessView";

export const dynamic = "force-dynamic";

/** The Sessions page: workout history. */
export default async function FitnessSessionsPage() {
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
      openLog={false}
      seedExerciseId={null}
      initialSessionDetail={null}
      openExerciseId={null}
    />
  );
}
