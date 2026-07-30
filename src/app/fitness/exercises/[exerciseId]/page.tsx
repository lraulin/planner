import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { getExercise, listExercises, listSessions } from "@/lib/fitness/queries";
import { FitnessView } from "@/components/fitness/FitnessView";

export const dynamic = "force-dynamic";

export default async function FitnessEditExercisePage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const { exerciseId } = await params;
  const userId = await getCurrentUserId();
  const [sessions, exercises, exercise] = await Promise.all([
    listSessions(userId),
    listExercises(userId),
    getExercise(userId, exerciseId),
  ]);

  if (!exercise) notFound();

  return (
    <FitnessView
      mode="exercises"
      initialSessions={sessions}
      initialExercises={exercises}
      openLog={false}
      seedExerciseId={null}
      initialSessionDetail={null}
      openExerciseId={exerciseId}
    />
  );
}
