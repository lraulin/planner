"use client";

import { useMemo, useState } from "react";
import { NoMatches, SearchPickerDialog } from "@/components/detail/SearchPickerDialog";

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
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return items;
    return items.filter((item) => item.name.toLocaleLowerCase().includes(needle));
  }, [items, query]);

  return (
    <SearchPickerDialog
      title={title}
      description={description}
      placeholder="Search items…"
      query={query}
      onQueryChange={setQuery}
      onClose={onClose}
    >
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
      {filtered.length === 0 && <NoMatches>No items match that search.</NoMatches>}
    </SearchPickerDialog>
  );
}
