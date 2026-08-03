"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NodeState, PriorityLetter } from "@/db/schema";
import { DataGrid, type RowDrag } from "@/components/grid/DataGrid";
import type { RowSwipe } from "@/components/grid/CompactRow";
import type { MenuItem } from "@/components/grid/ContextMenu";
import { SortChip, sortColumnLabel } from "@/components/grid/SortChip";
import { useGridState } from "@/components/grid/useGridState";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
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
import { shiftDateKey } from "@/lib/schedule/geometry";
import { copyAsText, writeClipboardText } from "@/lib/tree/copyAsText";
import { isTypingTarget } from "@/lib/keyboard";
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
  onDeleteTask,
  onMoveToDay,
  onOpenTask,
  emptyHint,
}: {
  items: DailyItemView[];
  onCreate: (title: string) => void;
  onToggleComplete: (itemId: string, done: boolean) => void;
  onSetState: (itemId: string, state: NodeState) => void;
  onApplyPriorities: (assignments: DayAssignment[]) => void;
  onRename: (itemId: string, title: string) => void;
  onPromote: (itemId: string) => void;
  /** Remove the day line only — a linked task is left alone. */
  onDelete: (itemId: string) => void;
  /** Hard-delete the underlying task (node-backed rows only). */
  onDeleteTask: (itemId: string, nodeId: string) => void;
  onMoveToDay: (itemId: string, day: string) => void;
  /** Open the task detail form for a node-backed row. */
  onOpenTask: (nodeId: string, title: string) => void;
  emptyHint: string;
}) {
  const [draft, setDraft] = useState("");
  const draftRef = useRef<HTMLInputElement>(null);

  const gridState = useGridState("day", DAY_COLUMNS, DAY_COLUMN_IDS);
  const rows = useMemo(() => buildRows(items), [items]);
  const orderedIds = useMemo(
    () => rows.flatMap((row) => (row.kind === "node" ? [row.id] : [])),
    [rows],
  );
  const multi = useMultiSelect(orderedIds, null);
  const { selectedId, selectedIds, select, selectOne, move } = multi;

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
    (dragIds: readonly string[], targetId: string, zone: string): DayAssignment[] => {
      if (targetId === UNRANKED_GROUP) return planDayClear(items, dragIds);

      const letter = letterFromGroup(targetId);
      if (letter !== null) return planDayDropOnLetter(items, dragIds, letter);

      // "inside" has no meaning in a flat list; treat it as landing after the row.
      return planDayDrop(
        items,
        dragIds,
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
      resolve: (dragIds, targetId, zone) =>
        planFor(dragIds, targetId, zone).length > 0 ? { depth: 0 } : null,
      onDrop: (dragIds, targetId, zone) => {
        if (dragIds[0]) selectOne(dragIds[0]);
        onApplyPriorities(planFor(dragIds, targetId, zone));
      },
    };
  }, [gridState.sort, planFor, onApplyPriorities, selectOne]);

  const copySelectionAsText = useCallback(() => {
    const text = copyAsText(
      orderedIds
        .map((id) => items.find((item) => item.id === id))
        .filter((item): item is DailyItemView => item != null)
        .map((item) => ({ id: item.id, name: item.title, depth: 0 })),
      selectedIds,
    );
    void writeClipboardText(text);
  }, [orderedIds, items, selectedIds]);

  const rowMenu = useCallback(
    (itemId: string): MenuItem[] => {
      const item = items.find((entry) => entry.id === itemId);
      if (!item) return [];
      const multiCount = selectedIds.has(itemId) ? selectedIds.size : 1;
      const block = selectedIds.has(itemId)
        ? orderedIds.filter((id) => selectedIds.has(id))
        : [itemId];

      const tomorrow = shiftDateKey(item.day, 1);

      return [
        {
          label: multiCount > 1 ? `Copy as text (${multiCount})` : "Copy as text",
          shortcut: "⌘C",
          onSelect: copySelectionAsText,
        },
        ...(item.nodeId
          ? [
              {
                label: "Open task",
                shortcut: "Enter",
                onSelect: () => onOpenTask(item.nodeId!, item.title),
              },
            ]
          : [
              {
                label: "Promote to task…",
                onSelect: () => onPromote(itemId),
              },
            ]),
        { label: "Move to tomorrow", onSelect: () => onMoveToDay(itemId, tomorrow) },
        // Ranking is a drag on desktop and drag is off on touch, so the same moves have to
        // exist as named commands or A/B/C/D is unreachable from a phone entirely.
        ...DAY_LETTERS.map((letter) => ({
          label: multiCount > 1 ? `Rank ${letter} (${multiCount})` : `Rank ${letter}`,
          onSelect: () => onApplyPriorities(planDayDropOnLetter(items, block, letter)),
        })),
        {
          label: multiCount > 1 ? `Clear rank (${multiCount})` : "Clear rank",
          onSelect: () => onApplyPriorities(planDayClear(items, block)),
        },
        {
          label: "Mark in progress",
          onSelect: () => onSetState(itemId, "in_progress"),
        },
        { label: "Mark delegated", onSelect: () => onSetState(itemId, "delegated") },
        // Cancel = "not doing this" (stays on the day with an X). Delete removes the line
        // or the task. They used to share one mislabelled "Mark deleted" entry.
        {
          label: "Mark cancelled",
          onSelect: () => onSetState(itemId, "cancelled"),
        },
        { label: "Remove from this day", onSelect: () => onDelete(itemId) },
        ...(item.nodeId
          ? [
              {
                label: "Delete task…",
                onSelect: () => onDeleteTask(itemId, item.nodeId!),
              },
            ]
          : []),
      ];
    },
    [
      items,
      orderedIds,
      selectedIds,
      onPromote,
      onMoveToDay,
      onSetState,
      onDelete,
      onDeleteTask,
      onOpenTask,
      onApplyPriorities,
      copySelectionAsText,
    ],
  );

  // ⌘C / Enter / arrows when the day list has focus and no field is editing.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (!selectedId) return;

      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        (event.key === "c" || event.key === "C")
      ) {
        event.preventDefault();
        copySelectionAsText();
        return;
      }
      if (event.key === "Enter") {
        const item = items.find((entry) => entry.id === selectedId);
        if (item?.nodeId) {
          event.preventDefault();
          onOpenTask(item.nodeId, item.title);
        }
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1, event.shiftKey);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1, event.shiftKey);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedId, items, copySelectionAsText, move, onOpenTask]);

  /**
   * The two things done to a day item most often, and both reversible — swipe right ticks it
   * off, swipe left pushes it to tomorrow. `responsive.md` keeps anything without a way back
   * off a gesture, which is why "Remove from this day" stays in the long-press menu.
   */
  const rowSwipe = useCallback(
    (itemId: string): RowSwipe => {
      const item = items.find((entry) => entry.id === itemId);
      if (!item) return {};

      const tomorrow = shiftDateKey(item.day, 1);

      const done = item.completedAt !== null || item.state === "completed";
      const cancelled = item.state === "cancelled";

      return {
        right: {
          label: cancelled || done ? "Reopen" : "Complete",
          run: () => {
            if (cancelled) onSetState(itemId, "not_started");
            else onToggleComplete(itemId, !done);
          },
        },
        left: {
          label: "Tomorrow",
          run: () => onMoveToDay(itemId, tomorrow),
        },
      };
    },
    [items, onToggleComplete, onSetState, onMoveToDay],
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
      {/* Hidden below `md`: it resets column widths and sort, neither of which a compact
          row has. A whole bar for a control with nothing to do is not worth 32px there. */}
      <div className="hidden flex-none items-center justify-end gap-2 border-b border-rule px-3 py-1 md:flex">
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
          blocksDrag
        />
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <DataGrid<DayColumnCtx, DailyItemView>
          rows={rows}
          columns={gridState.columns}
          columnCtx={columnCtx}
          selectedId={selectedId}
          selectedIds={selectedIds}
          onSelect={select}
          ariaLabel="Today's task list"
          rowDrag={rowDrag}
          rowMenu={rowMenu}
          rowSwipe={rowSwipe}
          onOpenDetail={(itemId) => {
            const item = items.find((entry) => entry.id === itemId);
            if (item?.nodeId) onOpenTask(item.nodeId, item.title);
          }}
          rowLabel={(row) => row.node.title}
          rowNumbers
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
          // `enterkeyhint` turns the soft keyboard's return key into "done", which is what
          // Enter does here. There is no separate Add button because the row commits on blur
          // too, so tapping anywhere else also files the line.
          enterKeyHint="done"
          className="min-h-tap w-full border-none bg-transparent text-[0.8125rem] text-ink outline-none placeholder:text-ink-faint/70 md:min-h-0"
        />
      </div>
    </div>
  );
}
