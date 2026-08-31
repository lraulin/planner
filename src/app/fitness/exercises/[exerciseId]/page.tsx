import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import {
  getExercise,
  listExercises,
  listRepeatableTitles,
  listSessions,
} from "@/lib/fitness/queries";
import { FitnessView } from "@/components/fitness/FitnessView";

export const dynamic = "force-dynamic";

export default async function FitnessEditExercisePage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const { exerciseId } = await params;
  const userId = await getCurrentUserId();
  const [sessions, exercises, exercise, titles] = await Promise.all([
    listSessions(userId),
    listExercises(userId),
    getExercise(userId, exerciseId),
    listRepeatableTitles(userId),
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
      repeatableTitles={titles}
      openExerciseId={exerciseId}
    />
  );
}
