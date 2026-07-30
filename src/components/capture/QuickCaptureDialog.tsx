"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { PriorityLetter } from "@/db/schema";
import {
  captureAction,
  listCaptureTargetsAction,
  type CaptureTarget,
} from "@/app/capture/actions";
import { ModalShell } from "@/components/detail/ModalShell";
import {
  ContextsField,
  DateField,
  EffortField,
  PriorityField,
} from "@/components/detail/fields";
import { TYPE_LABELS } from "@/lib/tree/hierarchy";

/**
 * Achieve's Quick Task Entry box.
 *
 * A modal, which `ux-principles.md` otherwise forbids for creating things — see this
 * feature's `standards.md` for why it is the right container here. The short version: there
 * is no record for a drawer to hang off, and the outline behind it is irrelevant to the
 * thought you are trying to offload before you lose it.
 *
 * It stays open after Add so a run of thoughts can go in one after another, which is what
 * Achieve's separate Add / Close buttons were for.
 */
export function QuickCaptureDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const hintId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [text, setText] = useState("");
  const [parentId, setParentId] = useState("");
  const [priority, setPriority] = useState<{
    letter: PriorityLetter | null;
    rank: number | null;
  }>({ letter: null, rank: null });
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [effortMinutes, setEffortMinutes] = useState<number | null>(null);
  const [contexts, setContexts] = useState<string[]>([]);

  const [targets, setTargets] = useState<CaptureTarget[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The picker's options are only worth fetching once the box is actually open.
  useEffect(() => {
    if (!open || targets !== null) return;
    let cancelled = false;

    void listCaptureTargetsAction()
      .then((loaded) => {
        if (!cancelled) setTargets(loaded);
      })
      .catch(() => {
        if (!cancelled) setTargets([]);
      });

    return () => {
      cancelled = true;
    };
  }, [open, targets]);

  function submit() {
    if (!text.trim() || pending) return;

    setError(null);
    startTransition(async () => {
      const result = await captureAction({
        text,
        parentId: parentId || null,
        defaults: {
          priorityLetter: priority.letter,
          priorityRank: priority.rank,
          deadline,
          effortMinutes,
          contexts,
        },
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setText("");
      setStatus(`${result.count} ${result.count === 1 ? "item" : "items"} captured`);
      textareaRef.current?.focus();
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // The chat convention, and the reason the "enter multiple tasks" checkbox is gone:
    // multi-line is always available, so there is nothing to toggle.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <ModalShell open={open} onClose={onClose} labelledBy={titleId} width="max-w-2xl">
      <div className="border-b border-rule px-5 py-3">
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          Quick capture
        </h2>
      </div>

      <div className="px-5 py-4">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setStatus(null);
          }}
          onKeyDown={onKeyDown}
          rows={6}
          aria-label="New tasks"
          aria-describedby={hintId}
          placeholder="What's on your mind?"
          className="w-full resize-y rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] leading-relaxed text-ink outline-none focus:border-rule-strong"
        />

        <p id={hintId} className="mt-1.5 text-[0.75rem] leading-relaxed text-ink-faint">
          <kbd className="font-medium">Enter</kbd> to add,{" "}
          <kbd className="font-medium">Shift+Enter</kbd> for a new line. Indent a line
          to make it a subtask. Add a note with <code>##</code> — “Buy milk ## whole,
          not 2%”.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <PriorityField
            letter={priority.letter}
            rank={priority.rank}
            onChange={(letter, rank) => setPriority({ letter, rank })}
          />
          <EffortField
            label="Effort"
            value={effortMinutes}
            onChange={setEffortMinutes}
          />
          <DateField label="Deadline" value={deadline} onChange={setDeadline} />
          <ContextsField value={contexts} onChange={setContexts} />
        </div>

        <label className="mt-3 block">
          <span className="mb-1 block text-[0.75rem] font-medium text-ink-muted">
            Add to
          </span>
          <select
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
            className="w-full rounded border border-rule bg-surface px-2 py-1 text-[0.8125rem] text-ink outline-none focus:border-rule-strong"
          >
            <option value="">Inbox</option>
            {(targets ?? []).map((target) => (
              <option key={target.id} value={target.id}>
                {`${"  ".repeat(target.depth)}${target.name} · ${TYPE_LABELS[target.type]}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-rule px-5 py-3">
        <p
          role="status"
          aria-live="polite"
          className={`text-[0.75rem] ${error ? "text-priority-a" : "text-ink-faint"}`}
        >
          {error ?? status ?? ""}
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised"
          >
            Close
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || text.trim() === ""}
            className="rounded border border-select-edge bg-select px-3 py-1.5 text-[0.8125rem] font-medium text-ink transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
