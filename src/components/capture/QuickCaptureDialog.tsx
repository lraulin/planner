"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { PriorityLetter } from "@/db/schema";
import {
  captureAction,
  listCaptureTargetsAction,
  type CaptureTarget,
} from "@/app/capture/actions";
import { ModalShell } from "@/components/detail/ModalShell";
import { useIsCompact } from "@/components/shell/useIsCompact";
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
 * Enter captures and closes on desktop: multi-line already covers bulk entry, and per-item
 * detail belongs in the normal interface rather than in a box you keep reopening. On a
 * phone the Send action sits beside the text area, so the soft keyboard never hides the
 * only way to finish capture. The parent unmounts this on close, so the draft goes with it.
 */
export function QuickCaptureDialog({
  onClose,
  onCaptured,
}: {
  onClose: () => void;
  /** Called on a successful capture. Closing is the success signal. */
  onCaptured: (count: number) => void;
}) {
  const titleId = useId();
  const hintId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const compact = useIsCompact();

  const [text, setText] = useState("");
  const [parentId, setParentId] = useState("");
  const [priority, setPriority] = useState<{
    letter: PriorityLetter | null;
    rank: number | null;
  }>({ letter: null, rank: null });
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [effortMinutes, setEffortMinutes] = useState<number | null>(null);
  const [contexts, setContexts] = useState<string[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [targets, setTargets] = useState<CaptureTarget[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Fetched on open rather than with every page, since most page loads never open this.
  useEffect(() => {
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
  }, []);

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

      onCaptured(result.count);
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // The chat convention, and the reason the "enter multiple tasks" checkbox is gone:
    // multi-line is always available, so there is nothing to toggle.
    //
    // Except on a soft keyboard, which has no Shift+Enter — Enter-submits would make the
    // second line of a multi-line capture unreachable. Below `md`, return means return, and
    // the Send button beside the composer is the way in.
    if (compact) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  const disabled = pending || text.trim() === "";

  return (
    <ModalShell open onClose={onClose} labelledBy={titleId} width="max-w-2xl">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="border-b border-rule px-4 py-3 md:px-5">
          <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
            Quick capture
          </h2>
          <p className="mt-0.5 text-[0.75rem] text-ink-muted">
            Send it to your Inbox now. Sort it later.
          </p>
        </div>

        <div className="px-4 py-4 md:px-5">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
              rows={compact ? 4 : 6}
              enterKeyHint="send"
              aria-label="New tasks"
              aria-describedby={hintId}
              placeholder="What's on your mind?"
              className="min-h-32 min-w-0 flex-1 resize-y rounded border border-rule bg-surface px-3 py-2 text-[0.875rem] leading-relaxed text-ink outline-none focus:border-select-edge"
            />

            <button
              type="submit"
              disabled={disabled}
              aria-label="Send to Inbox"
              className="min-h-tap min-w-[4.25rem] shrink-0 rounded-lg border border-select-edge bg-select px-2 py-2 text-[0.8125rem] font-semibold text-ink transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40 md:hidden"
            >
              {pending ? "Sending…" : "Send"}
            </button>
          </div>

          <p
            id={hintId}
            className="mt-1.5 text-[0.75rem] leading-relaxed text-ink-faint"
          >
            <span className="hidden md:inline">
              <kbd className="font-medium">Enter</kbd> to send,{" "}
              <kbd className="font-medium">Shift+Enter</kbd> for a new line.{" "}
            </span>
            Indent a line to make it a subtask. Add a note with <code>##</code> — “Buy
            milk ## whole, not 2%”.
          </p>

          <p
            role="status"
            aria-live="polite"
            className="mt-2 min-h-4 text-[0.75rem] text-priority-a"
          >
            {error ?? ""}
          </p>

          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            aria-expanded={detailsOpen}
            className="mt-3 flex min-h-tap w-full items-center justify-between rounded border border-rule px-3 text-left text-[0.8125rem] font-medium text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised md:hidden"
          >
            <span>Add details</span>
            <span className="text-ink-faint" aria-hidden>
              {detailsOpen ? "−" : "+"}
            </span>
          </button>

          <div
            className={
              detailsOpen ? "mt-4 block md:mt-4" : "mt-4 hidden md:mt-4 md:block"
            }
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
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
                className="min-h-tap w-full rounded border border-rule bg-surface px-2 py-1 text-[0.8125rem] text-ink outline-none focus:border-rule-strong md:min-h-0"
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
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-rule px-4 py-3 md:justify-between md:px-5">
          <span className="hidden text-[0.75rem] text-ink-faint md:inline">
            Defaults to Inbox
          </span>
          <div className="flex w-full gap-2 md:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="min-h-tap flex-1 rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised md:min-h-0 md:flex-none"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={disabled}
              className="hidden min-h-tap rounded border border-select-edge bg-select px-4 py-1.5 text-[0.8125rem] font-medium text-ink transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40 md:inline-flex md:min-h-0 md:px-3"
            >
              {pending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
}
