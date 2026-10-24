import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import {
  homeThoughtId,
  listTags,
  listTypes,
  loadPlex,
  recentThoughts,
  startThoughtId,
} from "@/lib/brain/queries";
import { parseThoughtId } from "@/lib/brain/thoughtId";
import { BrainView } from "@/components/brain/BrainView";

export const dynamic = "force-dynamic";

/**
 * The active thought lives in the address bar, so Back and Forward are the history and a
 * thought can be linked to. Without a usable `?thought=` the page opens on Home, then the
 * most recently visited thought, then an empty state.
 */
export default async function BrainPage({
  searchParams,
}: {
  searchParams: Promise<{ thought?: string | string[] }>;
}) {
  const userId = await getCurrentUserId();
  const requested = parseThoughtId((await searchParams).thought);

  const [asked, start, home, recent, types, tags] = await Promise.all([
    requested ? loadPlex(userId, requested) : null,
    requested ? null : startThoughtId(userId),
    homeThoughtId(userId),
    recentThoughts(userId),
    listTypes(userId),
    listTags(userId),
  ]);

  // A stale or foreign `?thought=` falls back to the start thought rather than a dead page.
  let plex = asked;
  if (!plex) {
    const fallback = start ?? (requested ? await startThoughtId(userId) : null);
    plex = fallback ? await loadPlex(userId, fallback) : null;
  }

  return (
    <Suspense fallback={<div className="min-h-0 flex-1" />}>
      <BrainView plex={plex} homeId={home} recent={recent} types={types} tags={tags} />
    </Suspense>
  );
}
