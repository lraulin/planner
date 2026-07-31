"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { NoteFlag } from "@/db/schema";
import type { NoteNode } from "@/lib/notes/types";
import type { NoteInput } from "@/lib/notes/mutations";
import type { OutlineNode } from "@/lib/tree/types";
import { TYPE_LABELS } from "@/lib/tree/hierarchy";
import { updateNoteAction } from "@/app/notes/actions";
import { Drawer, DrawerHeader } from "@/components/detail/Drawer";
import { MarkdownEditor } from "./MarkdownEditor";
import { useAutosave, type SaveStatus } from "./useAutosave";
import { FLAG_LABELS, FlagSwatch } from "./flags";

/**
 * The full note record, in the same right-sliding drawer every other tab uses.
 *
 * Autosave model from `drawer-pattern.md` (document-like surfaces): no Save button and no
 * unsaved-changes dialog. A note has nothing to validate — no cross-field constraints and
 * no content a server can reject — so a Save button would gate nothing and the dirty
 * prompt would be pure friction while writing.
 *
 * A failed autosave keeps the text on screen, keeps the drawer open, and offers Retry.
 */
export function NoteDrawer({
  note,
  nodes,
  subjects,
  onClose,
}: {
  /** The note the drawer is open on, or null when closed. */
  note: NoteNode | null;
  /** Records a note can be linked to. */
  nodes: OutlineNode[];
  /** Existing subjects, for the combobox. Always includes "General". */
  subjects: string[];
  onClose: () => void;
}) {
  const titleId = useId();

  return (
    <Drawer open={note !== null} onClose={onClose} labelledBy={titleId}>
      {note && (
        // Keyed on the note id so switching rows resets the draft rather than carrying it
        // across — `drawer-pattern.md`.
        <NoteForm
          key={note.id}
          titleId={titleId}
          note={note}
          nodes={nodes}
          subjects={subjects}
          onClose={onClose}
        />
      )}
    </Drawer>
  );
}

type Draft = {
  title: string;
  subject: string;
  body: string;
  noteDate: string;
  flag: NoteFlag;
  contexts: string;
  nodeId: string;
};

function toDraft(note: NoteNode): Draft {
  return {
    title: note.title,
    subject: note.subject,
    body: note.body,
    noteDate: note.noteDate ? toDateInput(note.noteDate) : "",
    flag: note.flag,
    contexts: note.contexts.join(", "),
    nodeId: note.nodeId ?? "",
  };
}

/** `YYYY-MM-DD` in local time — `toISOString` would shift the date across a timezone. */
function toDateInput(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function toInput(draft: Draft): Partial<NoteInput> {
  return {
    title: draft.title,
    subject: draft.subject.trim(),
    // Body is sent verbatim: trailing spaces are a hard line break in markdown.
    body: draft.body,
    // Parsed as local midnight rather than `new Date("2026-01-05")`, which is UTC and
    // lands on the previous day for anyone west of Greenwich.
    noteDate: draft.noteDate ? new Date(`${draft.noteDate}T00:00:00`) : null,
    flag: draft.flag,
    contexts: draft.contexts
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
    nodeId: draft.nodeId || null,
  };
}

function NoteForm({
  titleId,
  note,
  nodes,
  subjects,
  onClose,
}: {
  titleId: string;
  note: NoteNode;
  nodes: OutlineNode[];
  subjects: string[];
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(note));
  const subjectListId = useId();

  const save = useCallback(
    (values: Draft) => updateNoteAction(note.id, toInput(values)),
    [note.id],
  );

  const { status, schedule, flush, retry } = useAutosave(save);

  const patch = useCallback(
    (changes: Partial<Draft>) => {
      setDraft((current) => {
        const next = { ...current, ...changes };
        schedule(next);
        return next;
      });
    },
    [schedule],
  );

  // Flush before the drawer goes away, so an edit inside the debounce window is not lost.
  const closeAfterFlush = useCallback(() => {
    void flush();
    onClose();
  }, [flush, onClose]);

  const nodeOptions = useMemo(
    () =>
      nodes.map((candidate) => ({
        value: candidate.id,
        label: `${TYPE_LABELS[candidate.type]} · ${candidate.name || "Untitled"}`,
      })),
    [nodes],
  );

  return (
    <>
      <DrawerHeader
        titleId={titleId}
        eyebrow="Note"
        title={draft.title}
        onClose={closeAfterFlush}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        <FieldRow label="Title">
          <input
            value={draft.title}
            onChange={(event) => patch({ title: event.target.value })}
            placeholder="Untitled"
            className={INPUT_CLASS}
          />
        </FieldRow>

        <div className="grid gap-3 sm:grid-cols-2">
          <FieldRow label="Subject" hint="Pick an existing subject or type a new one.">
            {/* A native combobox: free text plus the list of subjects already in use, as
                Achieve's Subject field does — and no dependency to get it. */}
            <input
              value={draft.subject}
              list={subjectListId}
              onChange={(event) => patch({ subject: event.target.value })}
              className={INPUT_CLASS}
            />
            <datalist id={subjectListId}>
              {subjects.map((subject) => (
                <option key={subject} value={subject} />
              ))}
            </datalist>
          </FieldRow>

          <FieldRow label="Date">
            <input
              type="date"
              value={draft.noteDate}
              onChange={(event) => patch({ noteDate: event.target.value })}
              className={INPUT_CLASS}
            />
          </FieldRow>

          <FieldRow label="Flag">
            <div className="flex items-center gap-2">
              <FlagSwatch flag={draft.flag} />
              <select
                value={draft.flag}
                onChange={(event) => patch({ flag: event.target.value as NoteFlag })}
                className={INPUT_CLASS}
              >
                {(Object.keys(FLAG_LABELS) as NoteFlag[]).map((flag) => (
                  <option key={flag} value={flag}>
                    {FLAG_LABELS[flag]}
                  </option>
                ))}
              </select>
            </div>
          </FieldRow>

          <FieldRow label="Contexts" hint="Comma separated — @home, @calls, errands.">
            <input
              value={draft.contexts}
              onChange={(event) => patch({ contexts: event.target.value })}
              className={INPUT_CLASS}
            />
          </FieldRow>
        </div>

        <FieldRow
          label="Linked to"
          hint="Optional. Keeps this note against a record, and lists it on that record."
        >
          <select
            value={draft.nodeId}
            onChange={(event) => patch({ nodeId: event.target.value })}
            className={INPUT_CLASS}
          >
            <option value="">Not linked</option>
            {nodeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FieldRow>

        <div className="flex min-h-[22rem] flex-1 flex-col pt-1">
          <MarkdownEditor
            value={draft.body}
            onChange={(body) => patch({ body })}
            ariaLabel="Note body"
            toolbarExtra={
              <SaveIndicator status={status} onRetry={() => retry(draft)} />
            }
          />
        </div>
      </div>
    </>
  );
}

const INPUT_CLASS =
  "w-full rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink outline-none transition-colors focus:border-select-edge";

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      {children}
      {hint && <p className="text-[0.75rem] text-ink-faint">{hint}</p>}
    </div>
  );
}

/**
 * Where a Save button would be. It reports what has actually been written — never "Saved"
 * while a newer edit is still pending — and a failure offers Retry rather than swallowing
 * the problem.
 */
function SaveIndicator({
  status,
  onRetry,
}: {
  status: SaveStatus;
  onRetry: () => void;
}) {
  const [, setTick] = useState(0);

  // Re-render on a timer so "Saved · 2s ago" does not sit frozen at the moment it saved.
  useEffect(() => {
    if (status.state !== "saved") return;
    const id = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, [status.state]);

  if (status.state === "error") {
    return (
      <span role="alert" className="flex items-center gap-2 text-[0.75rem]">
        <span className="text-priority-a">{status.message}</span>
        <button
          type="button"
          onClick={onRetry}
          className="rounded border border-priority-a/50 px-1.5 py-0.5 leading-none text-priority-a transition-colors hover:bg-priority-a/10"
        >
          Retry
        </button>
      </span>
    );
  }

  if (status.state === "saving") {
    return <span className="text-[0.75rem] text-ink-faint">Saving…</span>;
  }

  if (status.state === "saved") {
    return (
      <span className="text-[0.75rem] text-ink-faint">
        Saved{relativeSuffix(status.at)}
      </span>
    );
  }

  return <span className="text-[0.75rem] text-ink-faint">Saves as you type</span>;
}

function relativeSuffix(at: number): string {
  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 5) return "";
  if (seconds < 60) return ` · ${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return ` · ${minutes}m ago`;
}
