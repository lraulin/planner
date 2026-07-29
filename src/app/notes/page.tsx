import { getCurrentUserId } from "@/lib/auth";
import { loadNotes } from "@/lib/notes/queries";
import { loadOutline } from "@/lib/tree/queries";
import { TabStrip } from "@/components/shell/TabStrip";
import { NotesGrid } from "@/components/notes/NotesGrid";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ note?: string }>;

export default async function NotesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const userId = await getCurrentUserId();

  // The outline is loaded for the link picker, not for the grid.
  const [notes, nodes] = await Promise.all([loadNotes(userId), loadOutline(userId)]);

  // `?note=<id>` opens the drawer directly, which is what a node's Notes tab links to.
  const requested = params.note ?? null;
  const initialNoteId = notes.some((note) => note.id === requested) ? requested : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabStrip active="notes" />
      <NotesGrid initialNotes={notes} nodes={nodes} initialNoteId={initialNoteId} />
    </div>
  );
}
