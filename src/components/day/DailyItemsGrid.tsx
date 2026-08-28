"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NodeState, PriorityLetter } from "@/db/schema";
import { DataGrid, type RowDrag } from "@/components/grid/DataGrid";
import type { RowSwipe } from "@/components/grid/CompactRow";
import type { MenuItem } from "@/components/grid/ContextMenu";
import { useGridState } from "@/components/grid/useGridState";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import type { GridRow } from "@/lib/tree/slice";
import {
  DAY_LETTERS,
  isDayItemSettled,
  planDayAssign,
  planDayClear,
  planDayDrop,
  planDayDropOnLetter,
  type DayAssignment,
} from "@/lib/day/priority";
import { INSERT_AFTER, OPEN_RECORD } from "@/lib/commands/chords";
import type { DailyItemView } from "@/lib/day/types";
import { shiftDateKey } from "@/lib/schedule/geometry";
import { copyAsText, writeClipboardText } from "@/lib/tree/copyAsText";
import { isTypingTarget } from "@/lib/keyboard";
import { CommandBar } from "@/components/grid/CommandBar";
import { rowMenuFor } from "@/components/grid/rowMenu";
import {
  buildGridCommands,
  type GridCommandCapabilities,
} from "@/lib/grid/commandDeck";
import { useRegisterCommands } from "@/components/shell/CommandProvider";

import { TabToolbar } from "@/components/tabs/tabChrome";
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

  const gridState = useGridState("day", DAY_COLUMNS, { order: DAY_COLUMN_IDS });
  const rows = useMemo(() => buildRows(items), [items]);
  const rowIds = useMemo(
    () => rows.flatMap((row) => (row.kind === "node" ? [row.id] : [])),
    [rows],
  );
  const { order, onIdsChange } = useNavigableIds(rowIds);
  const multi = useMultiSelect(order, null);
  const {
    selectedId,
    selectedIds,
    select,
    selectOne,
    selectAll,
    toggleSelectAll,
    headerState,
    move,
  } = multi;

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
      order
        .map((id) => items.find((item) => item.id === id))
        .filter((item): item is DailyItemView => item != null)
        .map((item) => ({ id: item.id, name: item.title, depth: 0 })),
      selectedIds,
    );
    void writeClipboardText(text);
  }, [order, items, selectedIds]);

  const focusDraft = useCallback(() => {
    document.querySelector<HTMLInputElement>("[data-day-quick-entry]")?.focus();
  }, []);

  /**
   * Everything this day can do, for one row.
   *
   * This used to be two lists: three page commands for the toolbar, and a hand-written thirteen-item
   * right-click menu with `Rank A`, `Move to tomorrow`, `Mark delegated` and the rest reachable *only*
   * by right-click. They were legal — a context menu is a visible path — but absent from the menus,
   * the panel and the palette, so `⌘K` could not answer "how do I rank this B". One list now, and
   * every surface gets all of it.
   *
   * Parameterised by row rather than closing over the selection, because right-clicking an unselected
   * row has to rank *that* row.
   */
  const capabilitiesFor = useCallback(
    (itemId: string | null, count: number): GridCommandCapabilities => {
      const item = itemId ? (items.find((entry) => entry.id === itemId) ?? null) : null;
      const nodeId = item?.nodeId ?? null;
      // A right-click inside the selection ranks the whole selection; outside it, just that row.
      const block =
        itemId && selectedIds.has(itemId)
          ? order.filter((id) => selectedIds.has(id))
          : itemId
            ? [itemId]
            : [];
      const suffix = count > 1 ? ` (${count})` : "";
      const noRow = item ? undefined : "Select a row first";

      return {
        selection: { id: itemId, count, label: item?.title },
        actions: {
          onCopyAsText: copySelectionAsText,
          onSelectAll: selectAll,
          onOpen: () => {
            if (item && nodeId) onOpenTask(nodeId, item.title);
          },
        },
        pageCommands: [
          {
            id: "day.create",
            label: "New day item",
            group: "record",
            menu: "new",
            section: "New",
            icon: "new",
            toolbar: 10,
            bindings: INSERT_AFTER,
            run: focusDraft,
          },
          /*
           * `record.open` by id, so this replaces the built-in rather than sitting beside it — see
           * `buildGridCommands`. A day line that came from a task opens the task; one typed straight
           * into the day has no task to open, and `Promote to task…` is the command that gives it
           * one. Two different verbs, so two rows, each disabled when it is the wrong one.
           */
          {
            id: "record.open",
            label: "Open task",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "open",
            toolbar: 50,
            rowMenu: true,
            bindings: OPEN_RECORD,
            disabled: nodeId === null,
            title:
              noRow ??
              (nodeId ? undefined : "This line is not a task yet — promote it first"),
            run: () => {
              if (item && nodeId) onOpenTask(nodeId, item.title);
            },
          },
          {
            id: "day.promote",
            label: "Promote to task…",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "convert",
            rowMenu: true,
            keywords: "make real project outline",
            disabled: item === null || nodeId !== null,
            title: noRow ?? (nodeId ? "Already a task" : undefined),
            run: () => itemId && onPromote(itemId),
          },
          {
            id: "day.move-tomorrow",
            label: "Move to tomorrow",
            group: "record",
            menu: "organize",
            section: "Move",
            icon: "move-down",
            toolbar: 30,
            rowMenu: true,
            keywords: "defer push postpone",
            disabled: item === null,
            title: noRow,
            run: () => {
              if (item && itemId) onMoveToDay(itemId, shiftDateKey(item.day, 1));
            },
          },
          // Ranking is a drag on desktop and drag is off on touch, so the same moves have to
          // exist as named commands or A/B/C/D is unreachable from a phone entirely.
          ...DAY_LETTERS.map((letter) => ({
            id: `day.rank-${letter}`,
            label: `Rank ${letter}${suffix}`,
            group: "record" as const,
            menu: "organize" as const,
            section: "Rank",
            icon: "priority" as const,
            rowMenu: true,
            disabled: item === null,
            title: noRow,
            run: () => onApplyPriorities(planDayDropOnLetter(items, block, letter)),
          })),
          {
            id: "day.rank-clear",
            label: `Clear rank${suffix}`,
            group: "record",
            menu: "organize",
            section: "Rank",
            icon: "priority",
            rowMenu: true,
            disabled: item === null,
            title: noRow,
            run: () => onApplyPriorities(planDayClear(items, block)),
          },
          ...(
            [
              ["in_progress", "Mark in progress"],
              ["delegated", "Mark delegated"],
              // Cancel = "not doing this" (stays on the day with an X). Remove takes the line off
              // the day; Delete task… deletes the task itself. All three used to be one
              // mislabelled "Mark deleted".
              ["cancelled", "Mark cancelled"],
            ] as const
          ).map(([state, label]) => ({
            id: `day.state-${state}`,
            label,
            group: "record" as const,
            menu: "organize" as const,
            section: "State",
            icon: "convert" as const,
            rowMenu: true,
            disabled: item === null,
            title: noRow,
            run: () => itemId && onSetState(itemId, state),
          })),
          {
            id: "day.remove",
            label: "Remove from this day",
            group: "record",
            menu: "item",
            section: "Danger",
            icon: "delete",
            rowMenu: true,
            destructive: true,
            disabled: item === null,
            title: noRow,
            run: () => itemId && onDelete(itemId),
          },
          {
            id: "day.delete-task",
            label: "Delete task…",
            group: "record",
            menu: "item",
            section: "Danger",
            icon: "delete",
            rowMenu: true,
            destructive: true,
            disabled: nodeId === null,
            title: noRow ?? (nodeId ? undefined : "This line is not a task"),
            run: () => {
              if (itemId && nodeId) onDeleteTask(itemId, nodeId);
            },
          },
          {
            id: "day.reset-grid",
            label: "Reset this grid",
            group: "view",
            menu: "view",
            section: "Layout",
            icon: "reset",
            run: gridState.reset,
          },
        ],
      };
    },
    [
      items,
      order,
      selectedIds,
      copySelectionAsText,
      selectAll,
      onOpenTask,
      onPromote,
      onMoveToDay,
      onSetState,
      onDelete,
      onDeleteTask,
      onApplyPriorities,
      focusDraft,
      gridState.reset,
    ],
  );

  const commandCapabilities = useMemo(
    () => capabilitiesFor(selectedId, selectedIds.size),
    [capabilitiesFor, selectedId, selectedIds.size],
  );
  const commands = useMemo(
    () => buildGridCommands(commandCapabilities),
    [commandCapabilities],
  );
  useRegisterCommands(commands);

  const rowMenu = useCallback(
    // `null` is the blank area below the rows — the same menu with nothing selected.
    (itemId: string | null): MenuItem[] => {
      const count =
        itemId && selectedIds.has(itemId) ? selectedIds.size : itemId ? 1 : 0;
      return rowMenuFor(capabilitiesFor(itemId, count));
    },
    [selectedIds, capabilitiesFor],
  );

  // Arrows only. ⌘C and Enter are `bindings` on the commands now — see `CommandKeys`.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (!selectedId) return;

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
  }, [selectedId, move]);

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

      const settled = isDayItemSettled(item);
      const cancelled = item.state === "cancelled";

      return {
        right: {
          label: settled ? "Reopen" : "Complete",
          tone: "positive",
          icon: "complete",
          run: () => {
            if (cancelled) onSetState(itemId, "not_started");
            else onToggleComplete(itemId, !settled);
          },
        },
        left: {
          // Not the list tabs' Delete. Pushing an item to tomorrow is what you do to a day
          // that did not go to plan, it is reversible, and removing an item from a day is
          // not the same act as deleting the task — so this view keeps its own left action
          // and the neutral-to-positive rail that goes with a reschedule.
          label: "Tomorrow",
          tone: "positive",
          icon: "schedule",
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
      {/*
        No lens row: the Day grid has no view picker, no scope and no grouping controls — its
        rows are one date's list. Below `md` the shell's `⋯` is the catalog.
      */}
      <TabToolbar
        commandRow={
          <CommandBar commands={commands} selection={commandCapabilities.selection} />
        }
      />
      <div className="min-h-0 flex-1 overflow-auto">
        <DataGrid<DayColumnCtx, DailyItemView>
          rows={rows}
          columns={gridState.columns}
          allColumns={DAY_COLUMNS}
          columnCtx={columnCtx}
          selectedId={selectedId}
          selectedIds={selectedIds}
          selectAllState={headerState}
          onToggleSelectAll={toggleSelectAll}
          gutter="handle"
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
          enableSort
          sorts={gridState.sorts}
          onSortChange={gridState.toggleSort}
          onSetSort={gridState.setSort}
          filters={gridState.filters}
          onFilterChange={gridState.setFilter}
          widths={gridState.widths}
          onResizeColumn={gridState.setWidth}
          onResetColumnWidth={gridState.clearWidth}
          columnControls={gridState.columnControls}
          collapsedGroups={gridState.collapsedGroups}
          onToggleGroup={gridState.toggleGroup}
          onNavigableIdsChange={onIdsChange}
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
          data-day-quick-entry
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
