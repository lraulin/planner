"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PriorityLetter } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import type { GridRow } from "@/lib/tree/slice";
import type { WishListRow } from "@/lib/detail/wishTypes";
import { OPEN_RECORD } from "@/lib/commands/chords";
import { updateNodeItemAction } from "@/app/plan/outline/detail-actions";
import { NodeDetailDrawer } from "@/components/detail/NodeDetailDrawer";
import { DataGrid } from "@/components/grid/DataGrid";
import type { MenuItem } from "@/components/grid/ContextMenu";
import { rowMenuFor } from "@/components/grid/rowMenu";
import type { GridCommandCapabilities } from "@/lib/grid/commandDeck";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { collectDistinctValues } from "@/lib/grid/distinct";
import type { GridDefaults } from "@/components/grid/useGridState";
import { useModuleViews } from "@/components/grid/useModuleViews";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import { copyAsText, writeClipboardText } from "@/lib/tree/copyAsText";
import { outlineSelectPath } from "@/lib/url/viewState";
import { ToolbarSelect } from "./tabChrome";
import { isTypingTarget } from "@/lib/keyboard";
import {
  wishesColumns,
  WISHES_COLUMN_IDS,
  type WishesColumnCtx,
} from "./wishesColumns";

/**
 * One built-in view. The Wish List is a single list by nature; what it gains from views is
 * somewhere to keep "the ones I'm actually considering" as a named filter set.
 */
const WISHES_VIEWS = [{ id: "wishes", label: "All Wishes" }] as const;

function viewDefaults(): GridDefaults {
  return { order: [...WISHES_COLUMN_IDS] };
}

/**
 * Wish List tab.
 *
 * Rows are `node_items`, not `nodes` — the only grid whose payload is not an OutlineNode.
 * It still goes through DataGrid the way Notes does, so column filters, sort, widths and
 * group collapse share the same persistence rail as every other tab.
 *
 * `?detail=` opens the **owning** result area / node, not the wish item itself — wishes
 * have no standalone detail form.
 */
export function WishesGrid({
  initialWishes,
  initialNodes,
}: {
  initialWishes: WishListRow[];
  initialNodes: OutlineNode[];
}) {
  /** Optimistic patches on top of the server list — same idea as the node grids. */
  const [patches, setPatches] = useState<Record<string, Partial<WishListRow>>>({});
  // Keep patches until server props refresh — clearing on action settle flickers the old list.
  const [baselineWishes, setBaselineWishes] = useState(initialWishes);
  if (initialWishes !== baselineWishes) {
    setBaselineWishes(initialWishes);
    if (Object.keys(patches).length > 0) setPatches({});
  }
  const [scopeId, setScopeId] = useState("");
  const { detail: detailNodeId, setDetail: setDetailNodeId } = useViewStateUrl();
  const router = useRouter();
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const views = useModuleViews({
    moduleId: "wishes",
    defaultViews: WISHES_VIEWS,
    defaultViewId: "wishes",
    columns: wishesColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;

  const rows = useMemo(
    () =>
      initialWishes.map((row) =>
        patches[row.id] ? { ...row, ...patches[row.id] } : row,
      ),
    [initialWishes, patches],
  );

  const byNodeId = useMemo(() => {
    const map = new Map<string, OutlineNode>();
    for (const node of initialNodes) map.set(node.id, node);
    return map;
  }, [initialNodes]);

  const resultAreas = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of initialWishes) {
      if (row.resultAreaId && row.resultAreaName) {
        seen.set(row.resultAreaId, row.resultAreaName);
      }
    }
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [initialWishes]);

  const gridRows: GridRow<WishListRow>[] = useMemo(() => {
    const filtered = scopeId
      ? rows.filter((row) => row.resultAreaId === scopeId)
      : rows;

    // Group by result area. Same shape DataGrid already understands for Projects/Goals.
    type Display =
      | { kind: "group"; id: string; label: string; count: number }
      | { kind: "wish"; row: WishListRow };

    const out: Display[] = [];
    let currentArea: string | null | undefined = undefined;
    let groupStart = 0;

    const flushCount = (end: number) => {
      if (out.length === 0) return;
      const header = out[groupStart];
      if (header?.kind === "group") {
        header.count = end - groupStart - 1;
      }
    };

    for (const row of filtered) {
      const areaKey = row.resultAreaId ?? "";
      if (areaKey !== currentArea) {
        flushCount(out.length);
        currentArea = areaKey;
        groupStart = out.length;
        out.push({
          kind: "group",
          id: `group:${areaKey}`,
          label: row.resultAreaName ?? "(No Result Area)",
          count: 0,
        });
      }
      out.push({ kind: "wish", row });
    }
    flushCount(out.length);

    return out.map((entry): GridRow<WishListRow> => {
      if (entry.kind === "group") {
        return {
          kind: "group",
          id: entry.id,
          label: entry.label,
          count: entry.count,
          depth: 0,
          collapsed: false,
        };
      }
      return {
        kind: "node",
        id: entry.row.id,
        node: entry.row,
        depth: 0,
      };
    });
  }, [rows, scopeId]);

  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        wishesColumns,
        gridRows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [gridRows],
  );

  const rowIds = useMemo(
    () => gridRows.flatMap((row) => (row.kind === "node" ? [row.id] : [])),
    [gridRows],
  );
  const { order, onIdsChange } = useNavigableIds(rowIds);
  const multi = useMultiSelect(order, null);
  const { selectedId, selectedIds, select, move } = multi;

  const patchRow = useCallback((id: string, changes: Partial<WishListRow>) => {
    setPatches((current) => ({
      ...current,
      [id]: { ...current[id], ...changes },
    }));
  }, []);

  const apply = useCallback(
    (action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
      setError(null);
      startTransition(async () => {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          // Rejected: revert immediately. Success waits for `initialWishes` above.
          setPatches({});
        }
      });
    },
    [],
  );

  const selectedWish = selectedId
    ? (rows.find((row) => row.id === selectedId) ?? null)
    : null;
  const detailNode = detailNodeId ? (byNodeId.get(detailNodeId) ?? null) : null;

  const columnCtx: WishesColumnCtx = useMemo(
    () => ({
      onPriorityChange: (row, letter: PriorityLetter | null, rank: number | null) => {
        patchRow(row.id, { priorityLetter: letter, priorityRank: rank });
        apply(() =>
          updateNodeItemAction(row.id, {
            priorityLetter: letter,
            priorityRank: rank,
          }),
        );
      },
      onTitleChange: (row, title) => {
        patchRow(row.id, { title });
        apply(() => updateNodeItemAction(row.id, { title }));
      },
      onDescriptionChange: (row, description) => {
        patchRow(row.id, { description });
        apply(() => updateNodeItemAction(row.id, { description }));
      },
    }),
    [patchRow, apply],
  );

  const copySelectionAsText = useCallback(() => {
    const text = copyAsText(
      order
        .map((id) => rows.find((row) => row.id === id))
        .filter((row): row is WishListRow => row != null)
        .map((row) => ({ id: row.id, name: row.title, depth: 0 })),
      selectedIds,
    );
    void writeClipboardText(text);
  }, [order, rows, selectedIds]);

  const capabilitiesFor = useCallback(
    (wishId: string | null, count: number): GridCommandCapabilities => {
      const wish = wishId ? (rows.find((row) => row.id === wishId) ?? null) : null;
      return {
        selection: { id: wishId, count, label: wish?.title },
        actions: { onCopyAsText: copySelectionAsText },
        pageCommands: [
          /*
           * `record.open` by id, overriding the built-in — see `buildGridCommands`.
           *
           * A wish is a row on a Goal, so opening one opens its **owner**. The hand-written row menu
           * here already said "Open owner" while the toolbar button said "Open": the same command,
           * named two things, in the two places that had to agree. Overriding the built-in is how one
           * name reaches every surface.
           */
          {
            id: "record.open",
            label: "Open owner",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "open",
            toolbar: 50,
            rowMenu: true,
            bindings: OPEN_RECORD,
            keywords: "goal parent node",
            disabled: wish === null,
            title: wish ? undefined : "Select a row first",
            run: () => wish && setDetailNodeId(wish.nodeId),
          },
          {
            id: "record.view-in-outline",
            label: "View in Outline",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "go-to",
            rowMenu: true,
            keywords: "tree hierarchy locate find reveal",
            disabled: wish === null,
            title: wish ? undefined : "Select a row first",
            run: () => wish && router.push(outlineSelectPath(wish.nodeId)),
          },
        ],
      };
    },
    [rows, copySelectionAsText, setDetailNodeId, router],
  );

  const commandCapabilities = useMemo(
    () => capabilitiesFor(selectedId, selectedIds.size),
    [capabilitiesFor, selectedId, selectedIds.size],
  );

  const rowMenu = useCallback(
    // `null` is the blank area below the rows — the same menu with nothing selected.
    (wishId: string | null): MenuItem[] => {
      const count =
        wishId && selectedIds.has(wishId) ? selectedIds.size : wishId ? 1 : 0;
      return rowMenuFor(capabilitiesFor(wishId, count));
    },
    [selectedIds, capabilitiesFor],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (detailNodeId) return;
      if (isTypingTarget(event.target)) return;
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
  }, [detailNodeId, selectedWish, setDetailNodeId, copySelectionAsText, move]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Wish List"
        allColumns={wishesColumns}
        distinctValues={distinctValues}
        counts={counts}
        error={error}
        views={views}
        left={
          <ToolbarSelect
            label="Result Area"
            value={scopeId}
            onChange={setScopeId}
            options={[{ value: "", label: "All Result Areas" }, ...resultAreas]}
          />
        }
        commandCapabilities={commandCapabilities}
      />

      <DataGrid<WishesColumnCtx, WishListRow>
        rows={gridRows}
        columns={gridState.columns}
        allColumns={wishesColumns}
        columnCtx={columnCtx}
        selectedId={selectedId}
        selectedIds={selectedIds}
        onSelect={select}
        onOpenDetail={(id) => {
          const wish = rows.find((row) => row.id === id);
          if (wish) setDetailNodeId(wish.nodeId);
        }}
        ariaLabel="Wish List"
        rowMenu={rowMenu}
        rowNumbers
        rowLabel={(row) => row.node.title || "Untitled wish"}
        enableFilters
        enableSort
        sorts={gridState.sorts}
        onSortChange={gridState.toggleSort}
        onSetSort={gridState.setSort}
        filters={gridState.filters}
        onFilterChange={gridState.setFilter}
        advancedFilter={gridState.advancedFilter}
        search={gridState.search}
        distinctValues={distinctValues}
        onCountsChange={setCounts}
        onNavigableIdsChange={onIdsChange}
        widths={gridState.widths}
        onResizeColumn={gridState.setWidth}
        onResetColumnWidth={gridState.clearWidth}
        columnControls={gridState.columnControls}
        collapsedGroups={gridState.collapsedGroups}
        onToggleGroup={gridState.toggleGroup}
        density={gridState.density}
        empty={
          <div className="flex h-full items-center justify-center p-8 text-[0.9375rem] text-ink-muted">
            No wishes yet. Add them on a Result Area&apos;s Wishes tab.
          </div>
        }
      />

      <NodeDetailDrawer
        node={detailNode}
        nodes={initialNodes}
        onClose={() => setDetailNodeId(null)}
      />
    </div>
  );
}
