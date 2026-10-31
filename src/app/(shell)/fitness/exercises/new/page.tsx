import { getCurrentUserId } from "@/lib/auth";
import { loadFitnessLists } from "@/lib/fitness/queries";
import { FitnessView } from "@/components/fitness/FitnessView";

export const dynamic = "force-dynamic";

export default async function FitnessNewExercisePage() {
  const userId = await getCurrentUserId();
  const lists = await loadFitnessLists(userId);

  return <FitnessView mode="exercises" {...lists} openExerciseId="new" />;
}
