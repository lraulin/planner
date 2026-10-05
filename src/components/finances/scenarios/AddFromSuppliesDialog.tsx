"use client";

import { useId, useMemo, useState } from "react";
import { ModalShell } from "@/components/detail/ModalShell";
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
  const titleId = useId();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const matches = (text: string) =>
    needle === "" || text.toLocaleLowerCase().includes(needle);

  const shownGroups = useMemo(
    () => groups.filter((group) => matches(group.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, needle],
  );
  const shownItems = useMemo(
    () => items.filter((item) => matches(item.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, needle],
  );

  const row =
    "flex min-h-tap w-full items-center justify-between gap-3 border-b border-rule px-3 py-2 text-left last:border-b-0 hover:bg-surface-raised md:min-h-0";

  return (
    <ModalShell open onClose={onClose} labelledBy={titleId} width="max-w-lg">
      <div className="flex max-h-[min(42rem,calc(100dvh-2rem))] flex-col p-5">
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          Add from Supplies
        </h2>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-muted">
          The line follows what Supplies says it costs, so it changes when the worksheet
          does.
        </p>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search groups and items…"
          className="mt-4 min-h-tap rounded border border-rule bg-surface px-3 py-2 text-base text-ink outline-none focus:border-select-edge md:min-h-0 md:text-[0.8125rem]"
        />
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded border border-rule">
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
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="min-h-tap rounded border border-rule px-3 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0 md:py-1.5"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
