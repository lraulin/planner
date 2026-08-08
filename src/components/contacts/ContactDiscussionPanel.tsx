"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { DiscussionItemSummary } from "@/lib/contacts/types";
import { createDiscussionItemAction } from "@/app/contacts/actions";
import { setStateAction } from "@/app/outline/actions";
import { formatPriority } from "@/lib/tree/format";
import { toDateKey } from "@/lib/schedule/geometry";

/**
 * Achieve's Discussion Items tab — the things to raise next time you talk to this person.
 *
 * Every row here is a real task. Achieve's version was a dead-end list that nothing else
 * could see; ours flows into the Task Chooser, the Day view and deadline handling, which is
 * the whole reason `task_details.contactId` exists rather than a `contact_discussion_items`
 * table.
 *
 * Read-mostly on purpose: resolving and creating happen here, but editing a task is the
 * task drawer's job. A drawer over a drawer is what `ux-principles.md` rules out.
 */
export function ContactDiscussionPanel({
  contactId,
  items,
  busy,
  onChanged,
}: {
  contactId: string;
  items: DiscussionItemSummary[];
  busy?: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = items.filter((item) => !item.resolved);
  const resolved = items.filter((item) => item.resolved);
  const disabled = busy || pending;

  function create() {
    const name = draft.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const result = await createDiscussionItemAction(contactId, { name });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft("");
      await onChanged();
    });
  }

  function toggleResolved(item: DiscussionItemSummary) {
    setError(null);
    startTransition(async () => {
      // Through the ordinary node-state mutation, so resolving a discussion item behaves
      // exactly like completing the same task anywhere else — including any cascade.
      const result = await setStateAction(
        item.nodeId,
        item.resolved ? "not_started" : "completed",
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await onChanged();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label
          htmlFor="new-discussion-item"
          className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted"
        >
          Raise next time
        </label>
        <div className="flex gap-2">
          <input
            id="new-discussion-item"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                create();
              }
            }}
            placeholder="Ask about the invoice…"
            disabled={disabled}
            className="min-h-tap flex-1 rounded border border-rule bg-surface px-2 py-1 text-[0.8125rem] text-ink outline-none focus:border-rule-strong disabled:opacity-50 md:min-h-0"
          />
          <button
            type="button"
            onClick={create}
            disabled={disabled || !draft.trim()}
            className="min-h-tap rounded border border-rule px-2 py-1 text-[0.8125rem] leading-none text-ink hover:bg-surface-raised disabled:opacity-40 md:min-h-0"
          >
            Add
          </button>
        </div>
        <p className="text-[0.75rem] text-ink-faint">
          Lands in the Inbox as a task, so it shows up in the Task Chooser too.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-[0.8125rem] text-priority-a">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="text-[0.8125rem] italic text-ink-faint">
          Nothing to raise with this person yet.
        </p>
      ) : (
        <>
          <ItemList
            items={open}
            disabled={disabled}
            onToggle={toggleResolved}
            emptyText="Nothing outstanding."
          />
          {resolved.length > 0 && (
            <details className="flex flex-col gap-2">
              <summary className="cursor-pointer text-[0.75rem] font-medium uppercase tracking-wider text-ink-muted">
                Resolved ({resolved.length})
              </summary>
              <div className="pt-2">
                <ItemList
                  items={resolved}
                  disabled={disabled}
                  onToggle={toggleResolved}
                />
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function ItemList({
  items,
  disabled,
  onToggle,
  emptyText,
}: {
  items: DiscussionItemSummary[];
  disabled?: boolean;
  onToggle: (item: DiscussionItemSummary) => void;
  emptyText?: string;
}) {
  if (items.length === 0) {
    return emptyText ? (
      <p className="text-[0.8125rem] italic text-ink-faint">{emptyText}</p>
    ) : null;
  }

  return (
    <ul className="divide-y divide-rule rounded border border-rule">
      {items.map((item) => {
        const priority = formatPriority(item.priorityLetter, item.priorityRank);
        return (
          <li key={item.nodeId} className="flex items-center gap-2 px-3 py-2">
            <input
              type="checkbox"
              checked={item.resolved}
              onChange={() => onToggle(item)}
              disabled={disabled}
              aria-label={item.resolved ? "Reopen" : "Mark resolved"}
              className="flex-none accent-accent"
            />
            {priority && (
              <span className="tabular w-7 flex-none text-[0.75rem] font-medium text-ink-muted">
                {priority}
              </span>
            )}
            <Link
              href={`/tasks?detail=${item.nodeId}`}
              className={`min-w-0 flex-1 truncate text-[0.8125rem] hover:underline ${
                item.resolved ? "text-ink-faint line-through" : "text-ink"
              }`}
            >
              {item.name}
            </Link>
            {item.deadline && (
              <time
                dateTime={toDateKey(item.deadline)}
                className="tabular flex-none text-[0.75rem] text-ink-muted"
              >
                {/* `timeZone: "UTC"` because a deadline is a stored calendar day (UTC
                    noon). Without it the visible text uses local getters while the
                    `dateTime` above uses `toDateKey`, so the two can name different days. */}
                {item.deadline.toLocaleDateString(undefined, { timeZone: "UTC" })}
              </time>
            )}
          </li>
        );
      })}
    </ul>
  );
}
