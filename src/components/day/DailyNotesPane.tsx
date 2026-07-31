"use client";

import { useState } from "react";
import Link from "next/link";
import { MarkdownEditor } from "@/components/notes/MarkdownEditor";
import { useAutosave } from "@/components/notes/useAutosave";
import { saveJournalAction } from "@/app/day/actions";

/**
 * The day's notes — the right column of the paper day page, and the journal.
 *
 * There is no Save button and no "new entry" step: type, and the entry exists. It is an
 * ordinary row in `notes` filed under the Journal subject, so what you write here shows up
 * in the Notes tab and searches and nests with everything else, rather than living in a
 * second parallel notes system.
 */
export function DailyNotesPane({
  day,
  initialBody,
}: {
  day: string;
  initialBody: string;
}) {
  const [body, setBody] = useState(initialBody);

  // Keyed by day at the call site, so switching days remounts with that day's text rather
  // than carrying the previous day's draft across.
  const { status, schedule, retry } = useAutosave<string>((next) =>
    saveJournalAction(day, next),
  );

  return (
    <section
      aria-label="Daily notes"
      className="flex min-h-0 w-80 flex-none flex-col border-l border-rule"
    >
      <header className="flex flex-none items-baseline justify-between border-b border-rule px-3 py-1.5">
        <h2 className="text-[0.75rem] font-semibold tracking-wide text-ink-muted uppercase">
          Daily Notes
        </h2>
        <Link href="/notes" className="text-[0.6875rem] text-ink-faint hover:text-ink">
          Journal
        </Link>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        <MarkdownEditor
          value={body}
          onChange={(next) => {
            setBody(next);
            schedule(next);
          }}
          ariaLabel={`Notes for ${day}`}
          rows={24}
          toolbarExtra={
            <span className="text-[0.6875rem] text-ink-faint">
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
