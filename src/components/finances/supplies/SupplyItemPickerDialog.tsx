"use client";

import { useId, useMemo, useState } from "react";
import { ModalShell } from "@/components/detail/ModalShell";

/**
 * Pick an existing worksheet item — used by Suggest from Amazon's Add to… and by Orders
 * when the worksheet is not empty.
 */
export function SupplyItemPickerDialog({
  items,
  title,
  description,
  allowNewItem,
  onClose,
  onPick,
}: {
  items: readonly { id: string; name: string; groupLabel?: string }[];
  title: string;
  description: string;
  allowNewItem?: boolean;
  onClose: () => void;
  onPick: (choice: { kind: "existing"; itemId: string } | { kind: "new" }) => void;
}) {
  const titleId = useId();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return items;
    return items.filter((item) => item.name.toLocaleLowerCase().includes(needle));
  }, [items, query]);

  return (
    <ModalShell open onClose={onClose} labelledBy={titleId} width="max-w-lg">
      <div className="flex max-h-[min(42rem,calc(100dvh-2rem))] flex-col p-5">
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          {title}
        </h2>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-muted">
          {description}
        </p>

        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search items…"
          className="mt-4 min-h-tap rounded border border-rule bg-surface px-3 py-2 text-base text-ink outline-none focus:border-select-edge md:min-h-0 md:text-[0.8125rem]"
        />

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded border border-rule">
          {allowNewItem && (
            <button
              type="button"
              className="flex min-h-tap w-full items-center border-b border-rule px-3 py-2 text-left hover:bg-surface-raised md:min-h-0"
              onClick={() => onPick({ kind: "new" })}
            >
              <span className="text-[0.8125rem] font-medium text-ink">New item</span>
            </button>
          )}
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              className="flex min-h-tap w-full flex-col items-start border-b border-rule px-3 py-2 text-left last:border-b-0 hover:bg-surface-raised md:min-h-0"
              onClick={() => onPick({ kind: "existing", itemId: item.id })}
            >
              <span className="truncate text-[0.8125rem] font-medium text-ink">
                {item.name}
              </span>
              {item.groupLabel ? (
                <span className="truncate text-[0.75rem] text-ink-muted">
                  {item.groupLabel}
                </span>
              ) : null}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-8 text-center text-[0.8125rem] text-ink-muted">
              No items match that search.
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-tap rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0"
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
