import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { getSessionDetail, listExercises, listSessions } from "@/lib/fitness/queries";
import { FitnessView } from "@/components/fitness/FitnessView";

export const dynamic = "force-dynamic";

export default async function FitnessSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const userId = await getCurrentUserId();
  const [sessions, exercises, detail] = await Promise.all([
    listSessions(userId),
    listExercises(userId),
    getSessionDetail(userId, sessionId),
  ]);

  if (!detail) notFound();

  return (
    <FitnessView
      mode="sessions"
      initialSessions={sessions}
      initialExercises={exercises}
      openLog={false}
      seedExerciseId={null}
      initialSessionDetail={detail}
      openExerciseId={null}
    />
  );
}
