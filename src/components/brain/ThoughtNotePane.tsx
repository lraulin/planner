"use client";

import { useCallback, useState } from "react";
import { setThoughtNoteAction } from "@/app/(shell)/library/brain/actions";
import { BRAIN_TAGS_ID } from "@/lib/brain/commands";
import { MarkdownEditor } from "@/components/notes/MarkdownEditor";
import { useAutosave, type SaveStatus } from "@/components/notes/useAutosave";
import type { ThoughtDetail, ThoughtType } from "@/lib/brain/types";

const MANAGE = "__manage__";

function SaveStatusText({
  status,
  onRetry,
}: {
  status: SaveStatus;
  onRetry: () => void;
}) {
  if (status.state === "error") {
    return (
      <span className="text-[0.75rem] text-priority-a">
        {status.message}{" "}
        <button type="button" onClick={onRetry} className="underline">
          Retry
        </button>
      </span>
    );
  }
  const text =
    status.state === "saving" ? "Saving…" : status.state === "saved" ? "Saved" : "";
  return (
    <span className="text-[0.75rem] text-ink-muted" aria-live="polite">
      {text}
    </span>
  );
}

/**
 * The active thought's note, type and tags. The note autosaves — there is no Save button, for
 * the same reason notes have none — and the pane is keyed by thought id upstream so switching
 * thoughts flushes the old note and starts the new one clean.
 */
export function ThoughtNotePane({
  thought,
  types,
  onType,
  onTags,
  onManageTypes,
}: {
  thought: ThoughtDetail;
  types: ThoughtType[];
  onType: (typeId: string | null) => void;
  onTags: (names: string[]) => void;
  onManageTypes: () => void;
}) {
  const [note, setNote] = useState(thought.note);
  const [tagText, setTagText] = useState(thought.tags.join(", "));

  // A tag saved elsewhere (the agent, another tab) shows up when the server data changes.
  const serverTags = thought.tags.join(", ");
  const [seenTags, setSeenTags] = useState(serverTags);
  if (seenTags !== serverTags) {
    setSeenTags(serverTags);
    setTagText(serverTags);
  }

  const save = useCallback(
    (value: string) => setThoughtNoteAction(thought.id, value),
    [thought.id],
  );
  const { status, schedule, retry } = useAutosave(save);

  function commitTags() {
    const names = tagText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (names.join(", ") !== serverTags) onTags(names);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[0.8125rem] text-ink-muted">
          Type
          <select
            value={thought.typeId ?? ""}
            onChange={(event) => {
              if (event.target.value === MANAGE) onManageTypes();
              else onType(event.target.value || null);
            }}
            className="min-h-tap rounded border border-rule-strong bg-surface px-2 py-1 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
          >
            <option value="">No type</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
            <option value={MANAGE}>Manage types…</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-2 text-[0.8125rem] text-ink-muted">
          Tags
          <input
            id={BRAIN_TAGS_ID}
            value={tagText}
            placeholder="comma, separated"
            onChange={(event) => setTagText(event.target.value)}
            onBlur={commitTags}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitTags();
                event.currentTarget.blur();
              }
            }}
            className="min-h-tap min-w-0 flex-1 rounded border border-rule-strong bg-surface px-2 py-1 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
          />
        </label>
      </div>

      <MarkdownEditor
        value={note}
        ariaLabel={`Note for ${thought.name}`}
        rows={16}
        onChange={(next) => {
          setNote(next);
          schedule(next);
        }}
        toolbarExtra={<SaveStatusText status={status} onRetry={() => retry(note)} />}
      />
    </div>
  );
}
