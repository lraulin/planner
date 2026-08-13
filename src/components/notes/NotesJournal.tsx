"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getNoteAction,
  saveJournalNoteAction,
  updateNoteAction,
} from "@/app/notes/actions";
import { DestinationCommandBar } from "@/components/grid/DestinationCommandBar";
import { useDateFormatter } from "@/components/settings/SettingsProvider";
import { MiniMonth } from "@/components/schedule/MiniMonth";
import { useIsCompact } from "@/components/shell/useIsCompact";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import {
  buildDiaryTree,
  diarySummaryFromNote,
  journalEntryOnDay,
  upsertDiarySummary,
  type DiarySummary,
} from "@/lib/notes/diaryTree";
import type { NoteNode, NoteSummary } from "@/lib/notes/types";
import { JOURNAL_SUBJECT } from "@/lib/day/types";
import { localDateKey, toDateKey } from "@/lib/schedule/geometry";
import { MarkdownEditor } from "./MarkdownEditor";
import { NotesDateTree } from "./NotesDateTree";
import { useAutosave } from "./useAutosave";

function monthDateFromKey(dateKey: string): Date {
  const [year, month] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function dayDateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function localKeyFromParts(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function NotesJournal({
  initialSummaries,
  initialOpenNote = null,
}: {
  initialSummaries: DiarySummary[];
  initialOpenNote?: NoteNode | null;
}) {
  const compact = useIsCompact();
  const formatDate = useDateFormatter();
  const { date: urlDate, setDate, replaceViewState } = useViewStateUrl();
  const todayKey = localDateKey(new Date());

  const [summaries, setSummaries] = useState(initialSummaries);
  const tree = useMemo(() => buildDiaryTree(summaries), [summaries]);
  const treeRef = useRef(tree);

  const dateKey = urlDate ?? todayKey;
  const [month, setMonth] = useState(() => monthDateFromKey(dateKey));
  const [alignedDate, setAlignedDate] = useState(dateKey);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    () => initialOpenNote?.id ?? null,
  );
  const [body, setBody] = useState(initialOpenNote?.body ?? "");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(
    () =>
      new Set([
        todayKey.slice(0, 4),
        todayKey.slice(0, 7),
        dateKey.slice(0, 4),
        dateKey.slice(0, 7),
      ]),
  );

  if (alignedDate !== dateKey) {
    setAlignedDate(dateKey);
    setMonth(monthDateFromKey(dateKey));
    const next = new Set(expanded);
    next.add(dateKey.slice(0, 4));
    next.add(dateKey.slice(0, 7));
    setExpanded(next);
  }

  useEffect(() => {
    if (urlDate || !initialOpenNote?.noteDate) return;
    setDate(toDateKey(initialOpenNote.noteDate));
  }, [initialOpenNote, setDate, urlDate]);

  const loadEntry = useCallback(async (id: string) => {
    const result = await getNoteAction(id);
    if (!result.ok || !result.data) return;
    setBody(result.data.body);
    setSelectedNoteId(id);
  }, []);

  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);

  useEffect(() => {
    const journal = journalEntryOnDay(treeRef.current, dateKey);
    if (!journal) return;
    void loadEntry(journal.id);
  }, [dateKey, loadEntry]);

  const selectDay = useCallback(
    (nextKey: string) => {
      const journal = journalEntryOnDay(tree, nextKey);
      replaceViewState({ date: nextKey, note: journal?.id ?? null });
      setSelectedNoteId(journal?.id ?? null);
      setBody("");
      if (journal) void loadEntry(journal.id);
      if (compact) setSheetOpen(true);
    },
    [compact, loadEntry, replaceViewState, tree],
  );

  const selectEntry = useCallback(
    (id: string) => {
      const entry = summaries.find((row) => row.id === id);
      const nextDate = entry?.noteDate ? toDateKey(entry.noteDate) : dateKey;
      replaceViewState({ date: nextDate, note: id });
      void loadEntry(id);
      if (compact) setSheetOpen(true);
    },
    [compact, dateKey, loadEntry, replaceViewState, summaries],
  );

  const toggleExpanded = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const rail = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex-none border-b border-rule p-2">
        <MiniMonth
          month={month}
          selected={dayDateFromKey(dateKey)}
          selectedKey={dateKey}
          markedDays={tree.markedDays}
          onSelectDay={(d) => selectDay(localKeyFromParts(d))}
          onChangeMonth={setMonth}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        <NotesDateTree
          tree={tree}
          selectedId={selectedNoteId}
          expanded={expanded}
          onToggle={toggleExpanded}
          onSelect={selectEntry}
        />
      </div>
    </div>
  );

  const editorKind =
    summaries.find((row) => row.id === selectedNoteId)?.subject === JOURNAL_SUBJECT
      ? "journal"
      : (selectedNoteId ?? "journal");

  const editor = (
    <JournalEditor
      key={`${dateKey}:${editorKind}`}
      dateKey={dateKey}
      noteId={selectedNoteId}
      body={body}
      onBody={setBody}
      heading={formatDate(dateKey)}
      onSaved={(summary) => {
        setSummaries((current) =>
          upsertDiarySummary(current, diarySummaryFromNote(summary)),
        );
        setSelectedNoteId(summary.id);
        replaceViewState({ date: dateKey, note: summary.id });
      }}
      onCleared={(id) => {
        setSummaries((current) => current.filter((row) => row.id !== id));
      }}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DestinationCommandBar overflowLabel="More commands for Notes" />

      {compact ? (
        sheetOpen ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-none items-center gap-2 border-b border-rule px-2 py-1">
              <button
                type="button"
                className="min-h-tap px-2 text-[0.8125rem] text-ink-muted"
                onClick={() => setSheetOpen(false)}
              >
                Back
              </button>
              <button
                type="button"
                className="min-h-tap text-[0.8125rem] font-medium text-ink"
                onClick={() => setSheetOpen(false)}
              >
                {formatDate(dateKey)}
              </button>
            </div>
            {editor}
          </div>
        ) : (
          rail
        )
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-64 flex-none flex-col border-r border-rule bg-shell">
            {rail}
          </aside>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{editor}</div>
        </div>
      )}
    </div>
  );
}

function JournalEditor({
  dateKey,
  noteId,
  body,
  onBody,
  heading,
  onSaved,
  onCleared,
}: {
  dateKey: string;
  noteId: string | null;
  body: string;
  onBody: (next: string) => void;
  heading: string;
  onSaved: (summary: NoteSummary) => void;
  onCleared: (id: string) => void;
}) {
  const [id, setId] = useState(noteId);
  if (noteId && noteId !== id) setId(noteId);

  const { status, schedule, retry } = useAutosave<string>(async (next) => {
    if (id) {
      const result = await updateNoteAction(id, { body: next });
      if (!result.ok) return result;
      if (result.data) {
        if (result.data.snippet.trim() === "") onCleared(result.data.id);
        else onSaved(result.data);
      }
      return { ok: true };
    }

    if (next.trim() === "") return { ok: true };

    const result = await saveJournalNoteAction(dateKey, next);
    if (!result.ok) return result;
    if (result.data) {
      setId(result.data.id);
      onSaved(result.data);
    }
    return { ok: true };
  });

  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-label={`Journal for ${heading}`}
    >
      <header className="hidden flex-none border-b border-rule px-3 py-1.5 md:block">
        <h2 className="text-[0.8125rem] font-semibold text-ink">{heading}</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        <MarkdownEditor
          value={body}
          onChange={(next) => {
            onBody(next);
            if (id || next.trim() !== "") schedule(next);
          }}
          ariaLabel={`Journal for ${dateKey}`}
          rows={28}
          toolbarExtra={
            <span className="inline-block min-w-[3.75rem] text-right text-[0.6875rem] leading-none text-ink-faint">
              {status.state === "saving" && "Saving…"}
              {status.state === "saved" && "Saved"}
              {status.state === "error" && (
                <button
                  type="button"
                  onClick={() => retry(body)}
                  className="text-priority-a underline"
                  title={status.message}
                >
                  Retry
                </button>
              )}
            </span>
          }
        />
      </div>
    </section>
  );
}
