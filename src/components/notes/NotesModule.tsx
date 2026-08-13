"use client";

import { useCallback, useEffect } from "react";
import { useSetting, type SettingCodec } from "@/components/settings/SettingsProvider";
import { isDiarySubject, type DiarySummary } from "@/lib/notes/diaryTree";
import type { NoteNode, NoteSummary } from "@/lib/notes/types";
import type { OutlineNode } from "@/lib/tree/types";
import type { ContactOption } from "@/lib/contacts/types";
import {
  parseNotesView,
  serializeNotesView,
  type NotesPresentation,
  type NotesViewSettings,
} from "@/lib/settings/notes";
import { NOTES_FILTER_SCOPE } from "@/lib/settings/scopes";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import { NotesGrid } from "./NotesGrid";
import { NotesJournal } from "./NotesJournal";

const NOTES_VIEW_CODEC: SettingCodec<NotesViewSettings> = {
  parse: parseNotesView,
  serialize: serializeNotesView,
};

/**
 * Hosts the Notes module's two presentations. Presentation lives on the module default
 * scope so a saved View does not fork it.
 */
export function NotesModule({
  initialNotes,
  initialBodyMatchIds = null,
  initialOpenNote = null,
  diarySummaries,
  nodes,
  contacts,
}: {
  initialNotes: NoteSummary[];
  initialBodyMatchIds?: string[] | null;
  initialOpenNote?: NoteNode | null;
  diarySummaries: DiarySummary[];
  nodes: OutlineNode[];
  contacts: ContactOption[];
}) {
  const { date: urlDate, setDate } = useViewStateUrl();
  const { value, patch } = useSetting(NOTES_FILTER_SCOPE, NOTES_VIEW_CODEC);

  const openIsDiary = Boolean(
    initialOpenNote && isDiarySubject(initialOpenNote.subject),
  );

  useEffect(() => {
    if (value.presentation === "journal") return;
    if (openIsDiary || urlDate) {
      patch((current) => ({ ...current, presentation: "journal" }));
    }
  }, [openIsDiary, patch, urlDate, value.presentation]);

  const presentation = value.presentation;

  const setPresentation = useCallback(
    (next: NotesPresentation) => {
      patch((current) => ({ ...current, presentation: next }));
      if (next === "grid") setDate(null);
    },
    [patch, setDate],
  );

  if (presentation === "journal") {
    return (
      <NotesJournal
        initialSummaries={diarySummaries}
        initialOpenNote={openIsDiary ? initialOpenNote : null}
        presentation={presentation}
        onPresentationChange={setPresentation}
      />
    );
  }

  return (
    <NotesGrid
      initialNotes={initialNotes}
      initialBodyMatchIds={initialBodyMatchIds}
      initialOpenNote={openIsDiary ? null : initialOpenNote}
      nodes={nodes}
      contacts={contacts}
      presentation={presentation}
      onPresentationChange={setPresentation}
    />
  );
}
