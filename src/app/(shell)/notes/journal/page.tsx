import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadDiarySummaries, loadNote } from "@/lib/notes/queries";
import { isDiarySubject } from "@/lib/notes/diaryTree";
import { NotesJournal } from "@/components/notes/NotesJournal";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ note?: string; date?: string }>;

/**
 * The Journal page: calendar, date tree, write pane.
 *
 * Loads the diary summaries and nothing else — no note list, no outline, no contacts, none of
 * which this layout draws.
 *
 * `?note=` is only honoured for a diary note. A general note reaching this page would have no
 * leaf in the tree to select, so it is ignored here and the entry redirect sends it to Grid
 * instead.
 */
export default async function NotesJournalPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const userId = await getCurrentUserId();
  const params = await searchParams;

  const [diarySummaries, openNote] = await Promise.all([
    loadDiarySummaries(userId),
    params.note ? loadNote(userId, params.note) : Promise.resolve(null),
  ]);

  return (
    // useSearchParams (via useViewStateUrl) needs a Suspense boundary.
    <Suspense fallback={<div className="min-h-0 flex-1" />}>
      <NotesJournal
        initialSummaries={diarySummaries}
        initialOpenNote={openNote && isDiarySubject(openNote.subject) ? openNote : null}
      />
    </Suspense>
  );
}
