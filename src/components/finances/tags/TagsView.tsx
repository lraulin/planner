"use client";

import { useState, useTransition } from "react";
import {
  createFinanceTagAction,
  deleteFinanceTagAction,
  discoverFinanceTagsAction,
  listFinanceTagsAction,
  updateFinanceTagAction,
} from "@/app/finances/actions";
import type { FinanceTagRow } from "@/lib/finances/tags/queries";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";

export function TagsView({ initialTags }: { initialTags: FinanceTagRow[] }) {
  const [tags, setTags] = useState(initialTags);
  const [newTag, setNewTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<FinanceTagRow | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const result = await listFinanceTagsAction();
      if (result.ok) setTags(result.data);
      else setError(result.error);
    });
  }

  function update(id: string, edit: Parameters<typeof updateFinanceTagAction>[1]) {
    setError(null);
    startTransition(async () => {
      const result = await updateFinanceTagAction(id, edit);
      if (!result.ok) setError(result.error);
      refresh();
    });
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-3 md:p-5">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h1 className="mr-auto hidden text-lg font-semibold text-ink md:block">
            Tags
          </h1>
          <input
            value={newTag}
            onChange={(event) => setNewTag(event.target.value)}
            placeholder="New tag"
            className="min-h-tap rounded border border-rule bg-surface px-2 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
          />
          <button
            type="button"
            disabled={pending || !newTag.trim()}
            className="min-h-tap rounded border border-rule px-3 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0 md:py-1.5"
            onClick={() =>
              startTransition(async () => {
                const result = await createFinanceTagAction(newTag);
                if (result.ok) {
                  setNewTag("");
                  refresh();
                } else setError(result.error);
              })
            }
          >
            Add tag
          </button>
          <button
            type="button"
            disabled={pending}
            className="min-h-tap rounded border border-rule px-3 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0 md:py-1.5"
            onClick={() =>
              startTransition(async () => {
                const result = await discoverFinanceTagsAction();
                if (result.ok) setTags(result.data);
                else setError(result.error);
              })
            }
          >
            Find existing tags
          </button>
        </div>
        {error ? (
          <p className="mb-3 text-[0.8125rem] text-priority-a">{error}</p>
        ) : null}
        <div className="overflow-hidden rounded border border-rule bg-surface">
          <div className="hidden grid-cols-[minmax(8rem,1fr)_5rem_minmax(10rem,2fr)_6rem_7rem] gap-2 border-b border-rule bg-surface-raised px-3 py-2 text-[0.75rem] font-medium text-ink-muted md:grid">
            <span>Tag</span>
            <span>Color</span>
            <span>Description</span>
            <span>Used</span>
            <span />
          </div>
          {tags.map((tag) => (
            <div
              key={tag.id}
              className={`flex flex-col gap-2 border-b border-rule px-3 py-3 last:border-b-0 md:grid md:grid-cols-[minmax(8rem,1fr)_5rem_minmax(10rem,2fr)_6rem_7rem] md:items-center md:py-2 ${tag.hidden ? "opacity-50" : ""}`}
            >
              <a
                href={`/finances/register?view=tag&tag=${encodeURIComponent(tag.tag)}`}
                className="truncate text-[0.8125rem] text-select-edge hover:underline"
              >
                #{tag.tag}
              </a>
              <input
                type="color"
                value={tag.color ?? "#8b8b8b"}
                aria-label={`Color for ${tag.tag}`}
                onChange={(event) => update(tag.id, { color: event.target.value })}
              />
              <input
                defaultValue={tag.description}
                aria-label={`Description for ${tag.tag}`}
                className="min-w-0 w-full rounded border border-rule bg-transparent px-2 py-1 text-[0.8125rem] text-ink md:border-transparent md:px-1 md:py-0 hover:border-rule"
                onBlur={(event) => {
                  if (event.target.value !== tag.description)
                    update(tag.id, { description: event.target.value });
                }}
              />
              <span className="tabular text-[0.8125rem] text-ink-muted">
                {tag.transactionCount}
              </span>
              <span className="flex justify-end gap-2 text-[0.75rem]">
                <button
                  type="button"
                  onClick={() => update(tag.id, { hidden: !tag.hidden })}
                  className="text-ink-muted hover:text-ink"
                >
                  {tag.hidden ? "Show" : "Hide"}
                </button>
                <button
                  type="button"
                  className="text-priority-a"
                  onClick={() => setDeleting(tag)}
                >
                  Delete
                </button>
              </span>
            </div>
          ))}
          {tags.length === 0 ? (
            <p className="p-6 text-center text-[0.8125rem] text-ink-muted">
              No managed tags yet. Add one or find tags already used in Notes.
            </p>
          ) : null}
        </div>
        <ConfirmDialog
          open={deleting !== null}
          title="Delete tag metadata?"
          message={
            deleting
              ? `Delete #${deleting.tag}? Transaction Notes will not change.`
              : ""
          }
          confirmLabel="Delete"
          destructive
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const target = deleting;
            setDeleting(null);
            if (!target) return;
            startTransition(async () => {
              const result = await deleteFinanceTagAction(target.id);
              if (!result.ok) setError(result.error);
              refresh();
            });
          }}
        />
      </div>
    </div>
  );
}
