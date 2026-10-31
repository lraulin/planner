import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { getExercise, loadFitnessLists } from "@/lib/fitness/queries";
import { FitnessView } from "@/components/fitness/FitnessView";

export const dynamic = "force-dynamic";

export default async function FitnessEditExercisePage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const { exerciseId } = await params;
  const userId = await getCurrentUserId();
  const [lists, exercise] = await Promise.all([
    loadFitnessLists(userId),
    getExercise(userId, exerciseId),
  ]);

  if (!exercise) notFound();

  return <FitnessView mode="exercises" {...lists} openExerciseId={exerciseId} />;
}
