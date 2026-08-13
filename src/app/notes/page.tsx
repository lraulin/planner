import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { loadNote } from "@/lib/notes/queries";
import { isDiarySubject } from "@/lib/notes/diaryTree";
import { moduleEntryRedirect } from "@/components/shell/moduleEntry";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ note?: string; date?: string }>;

/**
 * The Notes entry point. Renders nothing — Grid and Journal are the pages.
 *
 * Two deep links have to land on the right one, because both used to work by flipping a stored
 * presentation on the client and neither names a page:
 *
 * - `?date=` is a calendar day, which only Journal has.
 * - `?note=` is one note, and which page can show it depends on the note: a Journal or
 *   Rednotebook row is a leaf in the date tree, everything else only exists on the grid.
 *
 * The note lookup is the one reason this route touches the database. Guessing from the id would
 * mean sending half the links to a page with nothing to select on it.
 */
export default async function NotesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  if (params.date) {
    redirect(`/notes/journal?date=${encodeURIComponent(params.date)}`);
  }

  if (params.note) {
    const userId = await getCurrentUserId();
    const note = await loadNote(userId, params.note);
    const page = note && isDiarySubject(note.subject) ? "journal" : "grid";
    redirect(`/notes/${page}?note=${encodeURIComponent(params.note)}`);
  }

  await moduleEntryRedirect("notes");
}
