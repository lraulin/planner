import { getCurrentUserId } from "@/lib/auth";
import { listExercises, listSessions } from "@/lib/fitness/queries";
import { FitnessView } from "@/components/fitness/FitnessView";

export const dynamic = "force-dynamic";

export default async function FitnessExercisesPage() {
  const userId = await getCurrentUserId();
  const [sessions, exercises] = await Promise.all([
    listSessions(userId),
    listExercises(userId),
  ]);

  return (
    <FitnessView
      mode="exercises"
      initialSessions={sessions}
      initialExercises={exercises}
      openLog={false}
      seedExerciseId={null}
      initialSessionDetail={null}
      openExerciseId={null}
    />
  );
}
