"use client";

import { useState } from "react";
import { SearchPickerDialog } from "@/components/detail/SearchPickerDialog";
import type { LineAmountSource } from "@/lib/finances/scenarios/amount";

/**
 * Pick a Supplies group or item for a new line to follow. The line carries the group's or
 * item's id, so it keeps tracking the worksheet: an item added to the group later is in the
 * line's amount with nothing re-typed.
 */
export function AddFromSuppliesDialog({
  groups,
  items,
  onClose,
  onPick,
}: {
  groups: readonly { id: string; name: string }[];
  items: readonly { id: string; name: string; groupLabel: string }[];
  onClose: () => void;
  onPick: (choice: { name: string; source: LineAmountSource }) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const matches = (text: string) =>
    needle === "" || text.toLocaleLowerCase().includes(needle);

  const shownGroups = groups.filter((group) => matches(group.name));
  const shownItems = items.filter((item) => matches(item.name));

  const row =
    "flex min-h-tap w-full items-center justify-between gap-3 border-b border-rule px-3 py-2 text-left last:border-b-0 hover:bg-surface-raised md:min-h-0";

  return (
    <SearchPickerDialog
      title="Add from Supplies"
      description="The line follows what Supplies says it costs, so it changes when the worksheet does."
      placeholder="Search groups and items…"
      query={query}
      onQueryChange={setQuery}
      onClose={onClose}
    >
      {shownGroups.length > 0 ? (
        <>
          <div className="bg-surface-raised px-3 py-1 text-[0.6875rem] font-medium uppercase tracking-wide text-ink-muted">
            Groups
          </div>
          {shownGroups.map((group) => (
            <button
              key={group.id}
              type="button"
              className={row}
              onClick={() =>
                onPick({
                  name: group.name,
                  source: { type: "supplyGroup", supplyGroupId: group.id },
                })
              }
            >
              <span className="text-[0.8125rem] font-medium text-ink">
                {group.name}
              </span>
              <span className="text-[0.75rem] text-ink-muted">whole group</span>
            </button>
          ))}
        </>
      ) : null}
      {shownItems.length > 0 ? (
        <>
          <div className="bg-surface-raised px-3 py-1 text-[0.6875rem] font-medium uppercase tracking-wide text-ink-muted">
            Items
          </div>
          {shownItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={row}
              onClick={() =>
                onPick({
                  name: item.name,
                  source: { type: "supplyItem", supplyItemId: item.id },
                })
              }
            >
              <span className="text-[0.8125rem] text-ink">{item.name}</span>
              <span className="text-[0.75rem] text-ink-muted">
                {item.groupLabel || "Ungrouped"}
              </span>
            </button>
          ))}
        </>
      ) : null}
      {shownGroups.length === 0 && shownItems.length === 0 ? (
        <p className="p-4 text-[0.8125rem] text-ink-muted">
          {groups.length + items.length === 0
            ? "Nothing on the Supplies worksheet yet."
            : "Nothing matches."}
        </p>
      ) : null}
    </SearchPickerDialog>
  );
}
