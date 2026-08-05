import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadNotes } from "@/lib/notes/queries";
import { loadOutline } from "@/lib/tree/queries";
import { loadContactOptions } from "@/lib/contacts/queries";
import { AppShell } from "@/components/shell/AppShell";
import { NotesGrid } from "@/components/notes/NotesGrid";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const userId = await getCurrentUserId();

  // The outline is loaded for the link picker, not for the grid.
  const [notes, nodes, contacts] = await Promise.all([
    loadNotes(userId),
    loadOutline(userId),
    loadContactOptions(userId),
  ]);

  return (
    <AppShell active="notes">
      {/* useSearchParams (via useViewStateUrl) needs a Suspense boundary. */}
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <NotesGrid initialNotes={notes} nodes={nodes} contacts={contacts} />
      </Suspense>
    </AppShell>
  );
}
