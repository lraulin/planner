"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { LinkedNoteSummary } from "@/lib/detail/types";
import { createNoteAction } from "@/app/notes/actions";

/**
 * The reverse surface of note↔node linking: every note attached to this record, as a
 * read-only list that links out to `/notes?note=<id>`.
 *
 * Deliberately not an embedded editor. A drawer over a drawer is what `ux-principles.md`
 * rules out, and the Notes tab is the place to write — this surface is only how you find
 * the notes that point here.
 */
export function LinkedNotesPanel({
  nodeId,
  notes,
}: {
  nodeId: string;
  notes: LinkedNoteSummary[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function createLinked() {
    setError(null);
    startTransition(async () => {
      const result = await createNoteAction({
        values: { nodeId, title: "" },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.id) {
        router.push(`/notes?note=${result.id}`);
      }
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink">
          Linked notes
        </h3>
        <button
          type="button"
          onClick={createLinked}
          disabled={busy}
          className="rounded border border-rule bg-surface px-2 py-1 text-[0.75rem] text-ink hover:bg-surface-raised disabled:opacity-50"
        >
          New note
        </button>
      </div>

      {error && (
        <p role="alert" className="text-[0.8125rem] text-priority-a">
          {error}
        </p>
      )}

      {notes.length === 0 ? (
        <p className="text-[0.8125rem] italic text-ink-faint">
          No notes linked to this record yet.
        </p>
      ) : (
        <ul className="divide-y divide-rule rounded border border-rule">
          {notes.map((note) => (
            <li key={note.id}>
              <Link
                href={`/notes?note=${note.id}`}
                className="flex flex-col gap-0.5 px-3 py-2 hover:bg-surface-raised"
              >
                <span className="text-[0.875rem] font-medium text-ink">
                  {note.title.trim() || "Untitled note"}
                </span>
                <span className="flex gap-2 text-[0.75rem] text-ink-muted">
                  {note.noteDate && (
                    <time dateTime={toIso(note.noteDate)}>
                      {formatDate(note.noteDate)}
                    </time>
                  )}
                  {note.snippet && (
                    <span className="truncate text-ink-faint">{note.snippet}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
