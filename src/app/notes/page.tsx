import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadNotesListPayload, loadNote } from "@/lib/notes/queries";
import { loadOutline } from "@/lib/tree/queries";
import { loadContactOptions } from "@/lib/contacts/queries";
import { loadSettingsForSession } from "@/lib/settings/session";
import { parseNotesView } from "@/lib/settings/notes";
import { NOTES_FILTER_SCOPE } from "@/lib/settings/scopes";
import { AppShell } from "@/components/shell/AppShell";
import { NotesGrid } from "@/components/notes/NotesGrid";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ note?: string }>;

export default async function NotesPage({
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
    <AppShell active="notes">
      {/* useSearchParams (via useViewStateUrl) needs a Suspense boundary. */}
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <NotesGrid
          initialNotes={list.summaries}
          initialBodyMatchIds={list.bodyMatchIds}
          initialOpenNote={openNote}
          nodes={nodes}
          contacts={contacts}
        />
      </Suspense>
    </AppShell>
  );
}
