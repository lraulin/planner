"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { NodeState, PriorityLetter } from "@/db/schema";
import { DataGrid, type RowDrag } from "@/components/grid/DataGrid";
import type { MenuItem } from "@/components/grid/ContextMenu";
import { SortChip, sortColumnLabel } from "@/components/grid/SortChip";
import { useGridState } from "@/components/grid/useGridState";
import type { GridRow } from "@/lib/tree/slice";
import {
  DAY_LETTERS,
  planDayAssign,
  planDayClear,
  planDayDrop,
  planDayDropOnLetter,
  type DayAssignment,
} from "@/lib/day/priority";
import type { DailyItemView } from "@/lib/day/types";
import { DAY_COLUMNS, type DayColumnCtx } from "./dayColumns";

const DAY_COLUMN_IDS = DAY_COLUMNS.map((column) => column.id);

/**
 * A day's task list.
 *
 * Rows are grouped under A / B / C / D headers, with an Unranked tail. **Every letter gets
 * a header even when empty** — the header is the drop target that puts the first item into
 * a letter, the same reason the Task Chooser renders empty ones.
 *
 * The quick-entry row at the bottom is the point of the whole tab: type, press Enter, and
 * a line exists. Nothing asks which project it belongs to.
 */

const UNRANKED_GROUP = "day:unranked";
const letterGroup = (letter: PriorityLetter) => `day:${letter}`;
const letterFromGroup = (groupId: string): PriorityLetter | null => {
  const letter = groupId.startsWith("day:") ? groupId.slice(4) : null;
  return letter && (DAY_LETTERS as string[]).includes(letter)
    ? (letter as PriorityLetter)
    : null;
};

function buildRows(items: DailyItemView[]): GridRow<DailyItemView>[] {
  const rows: GridRow<DailyItemView>[] = [];

  for (const letter of DAY_LETTERS) {
    const inLetter = items.filter((item) => item.priorityLetter === letter);
    rows.push({
      kind: "group",
      id: letterGroup(letter),
      label: letter,
      count: inLetter.length,
      depth: 0,
      collapsed: false,
    });
    for (const item of inLetter) {
      rows.push({ kind: "node", id: item.id, node: item, depth: 0 });
    }
  }

  const unranked = items.filter((item) => item.priorityLetter === null);
  rows.push({
    kind: "group",
    id: UNRANKED_GROUP,
    label: "Unranked",
    count: unranked.length,
    depth: 0,
    collapsed: false,
  });
  for (const item of unranked) {
    rows.push({ kind: "node", id: item.id, node: item, depth: 0 });
  }

  return rows;
}

export function DailyItemsGrid({
  items,
  onCreate,
  onToggleComplete,
  onSetState,
  onApplyPriorities,
  onRename,
  onPromote,
  onDelete,
  onMoveToDay,
  emptyHint,
}: {
  items: DailyItemView[];
  onCreate: (title: string) => void;
  onToggleComplete: (itemId: string, done: boolean) => void;
  onSetState: (itemId: string, state: NodeState) => void;
  onApplyPriorities: (assignments: DayAssignment[]) => void;
  onRename: (itemId: string, title: string) => void;
  onPromote: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  onMoveToDay: (itemId: string, day: string) => void;
  emptyHint: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const draftRef = useRef<HTMLInputElement>(null);

  const gridState = useGridState("day", DAY_COLUMNS, DAY_COLUMN_IDS);
  const rows = useMemo(() => buildRows(items), [items]);

  const onAssignPriority = useCallback(
    (itemId: string, letter: PriorityLetter | null, rank: number | null) => {
      onApplyPriorities(planDayAssign(items, itemId, letter, rank));
    },
    [items, onApplyPriorities],
  );

  const columnCtx: DayColumnCtx = useMemo(
    () => ({ onToggleComplete, onSetState, onAssignPriority, onRename }),
    [onToggleComplete, onSetState, onAssignPriority, onRename],
  );

  /** Plans are computed against the whole day, not the visible rows. */
  const planFor = useCallback(
    (dragId: string, targetId: string, zone: string): DayAssignment[] => {
      if (targetId === UNRANKED_GROUP) return planDayClear(items, dragId);

      const letter = letterFromGroup(targetId);
      if (letter !== null) return planDayDropOnLetter(items, dragId, letter);

      // "inside" has no meaning in a flat list; treat it as landing after the row.
      return planDayDrop(
        items,
        dragId,
        targetId,
        zone === "before" ? "before" : "after",
      );
    },
    [items],
  );

  /**
   * Day priority is ranked by drag. A header sort is a non-destructive view of the same
   * list — stand drag down while it is active so a drop cannot write ranks the user cannot
   * see under the sorted order.
   */
  const rowDrag: RowDrag | undefined = useMemo(() => {
    if (gridState.sort) return undefined;

    return {
      resolve: (dragId, targetId, zone) =>
        planFor(dragId, targetId, zone).length > 0 ? { depth: 0 } : null,
      onDrop: (dragId, targetId, zone) => {
        setSelectedId(dragId);
        onApplyPriorities(planFor(dragId, targetId, zone));
      },
    };
  }, [gridState.sort, planFor, onApplyPriorities]);

  const rowMenu = useCallback(
    (itemId: string): MenuItem[] => {
      const item = items.find((entry) => entry.id === itemId);
      if (!item) return [];

      const tomorrow = (() => {
        const next = new Date(`${item.day}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        return next.toISOString().slice(0, 10);
      })();

      return [
        ...(item.nodeId
          ? []
          : [
              {
                label: "Promote to task…",
                onSelect: () => onPromote(itemId),
              },
            ]),
        { label: "Move to tomorrow", onSelect: () => onMoveToDay(itemId, tomorrow) },
        {
          label: "Mark in progress",
          onSelect: () => onSetState(itemId, "in_progress"),
        },
        { label: "Mark delegated", onSelect: () => onSetState(itemId, "delegated") },
        { label: "Mark deleted", onSelect: () => onSetState(itemId, "cancelled") },
        { label: "Remove from this day", onSelect: () => onDelete(itemId) },
      ];
    },
    [items, onPromote, onMoveToDay, onSetState, onDelete],
  );

  function commitDraft() {
    const title = draft.trim();
    if (!title) return;
    onCreate(title);
    setDraft("");
    draftRef.current?.focus();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center justify-end gap-2 border-b border-rule px-3 py-1">
        <button
          type="button"
          onClick={gridState.reset}
          title="Clear sort, column widths and collapsed groups for this day list"
          className="rounded border border-rule px-2 py-0.5 text-[0.75rem] text-ink-muted transition-colors hover:border-rule-strong hover:bg-surface-raised hover:text-ink"
        >
          Reset this grid
        </button>
      </div>
      {gridState.sort && (
        <SortChip
          sort={gridState.sort}
          columnLabel={sortColumnLabel(gridState.sort, DAY_COLUMNS)}
          onClear={gridState.clearSort}
        />
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <DataGrid<DayColumnCtx, DailyItemView>
          rows={rows}
          columns={gridState.columns}
          columnCtx={columnCtx}
          selectedId={selectedId}
          onSelect={setSelectedId}
          ariaLabel="Today's task list"
          rowDrag={rowDrag}
          rowMenu={rowMenu}
          rowLabel={(row) => row.node.title}
          enableSort
          sort={gridState.sort}
          onSortChange={gridState.toggleSort}
          filters={gridState.filters}
          onFilterChange={gridState.setFilter}
          widths={gridState.widths}
          onResizeColumn={gridState.setWidth}
          onResetColumnWidth={gridState.clearWidth}
          collapsedGroups={gridState.collapsedGroups}
          onToggleGroup={gridState.toggleGroup}
          empty={<p className="p-4 text-[0.8125rem] text-ink-faint">{emptyHint}</p>}
        />
      </div>

      {/* The habit this tab exists for: write it down, then decide what it is worth. */}
      <div className="flex flex-none items-center gap-2 border-t border-rule px-3 py-2">
        <span aria-hidden className="text-[0.8125rem] text-ink-faint">
          +
        </span>
        <input
          ref={draftRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitDraft();
            } else if (event.key === "Escape") {
              setDraft("");
            }
          }}
          onBlur={commitDraft}
          placeholder="What are you doing today?"
          aria-label="Add an item to this day"
          className="w-full border-none bg-transparent text-[0.8125rem] text-ink outline-none placeholder:text-ink-faint/70"
        />
      </div>
    </div>
  );
}
