import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadNotesListPayload, loadNote } from "@/lib/notes/queries";
import { loadOutline } from "@/lib/tree/queries";
import { loadContactOptions } from "@/lib/contacts/queries";
import { loadSettingsForSession } from "@/lib/settings/session";
import { parseNotesView } from "@/lib/settings/notes";
import { NOTES_FILTER_SCOPE } from "@/lib/settings/scopes";
import { NotesGrid } from "@/components/notes/NotesGrid";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ note?: string }>;

/**
 * The Grid page: the nested notes list.
 *
 * It loads the note list and nothing else. When Grid and Journal were one route deciding
 * between themselves on the client, every visit paid for both — `loadDiarySummaries` ran to
 * build a date tree that most visits never rendered. Splitting the presentations into pages is
 * what makes `daily-use-performance`'s "load only what the page needs" true here.
 */
export default async function NotesGridPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const userId = await getCurrentUserId();
  const params = await searchParams;

  // Saved filter may search bodies; apply it on the server so first paint is correct
  // without shipping every Markdown body to the client.
  const settings = await loadSettingsForSession();
  const savedFilter = parseNotesView(settings[NOTES_FILTER_SCOPE]).filter;

  // The outline is loaded for the link picker, not for the grid.
  const [list, nodes, contacts, openNote] = await Promise.all([
    loadNotesListPayload(userId, savedFilter),
    loadOutline(userId),
    loadContactOptions(userId),
    params.note ? loadNote(userId, params.note) : Promise.resolve(null),
  ]);

  return (
    // useSearchParams (via useViewStateUrl) needs a Suspense boundary.
    <Suspense fallback={<div className="min-h-0 flex-1" />}>
      <NotesGrid
        initialNotes={list.summaries}
        initialBodyMatchIds={list.bodyMatchIds}
        initialOpenNote={openNote}
        nodes={nodes}
        contacts={contacts}
      />
    </Suspense>
  );
}
