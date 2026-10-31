import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { getSessionDetail, loadFitnessLists } from "@/lib/fitness/queries";
import { FitnessView } from "@/components/fitness/FitnessView";

export const dynamic = "force-dynamic";

export default async function FitnessSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const userId = await getCurrentUserId();
  const [lists, detail] = await Promise.all([
    loadFitnessLists(userId),
    getSessionDetail(userId, sessionId),
  ]);

  if (!detail) notFound();

  return <FitnessView mode="sessions" {...lists} initialSessionDetail={detail} />;
}
