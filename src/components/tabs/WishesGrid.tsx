"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { PriorityLetter } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import type { GridRow } from "@/lib/tree/slice";
import type { WishListRow } from "@/lib/detail/wishTypes";
import { updateNodeItemAction } from "@/app/outline/detail-actions";
import { NodeDetailDrawer } from "@/components/detail/NodeDetailDrawer";
import { DataGrid } from "@/components/grid/DataGrid";
import type { MenuItem } from "@/components/grid/ContextMenu";
import { ShowFieldsDialog } from "@/components/grid/ShowFieldsDialog";
import { useGridState } from "@/components/grid/useGridState";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import { ErrorBanner, TabToolbar, ToolbarButton, ToolbarSelect } from "./tabChrome";
import { isTypingTarget } from "@/lib/keyboard";
import {
  wishesColumns,
  WISHES_COLUMN_IDS,
  type WishesColumnCtx,
} from "./wishesColumns";

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
  const [scopeId, setScopeId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { detail: detailNodeId, setDetail: setDetailNodeId } = useViewStateUrl();
  const [showFields, setShowFields] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const gridState = useGridState("wishes", wishesColumns, [...WISHES_COLUMN_IDS]);

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
        if (!result.ok) setError(result.error);
        // Server props refresh on success; drop the optimistic layer either way.
        setPatches({});
      });
    },
    [],
  );

  const selectedWish = selectedId
    ? (rows.find((row) => row.id === selectedId) ?? null)
    : null;
  const detailNode = detailNodeId ? (byNodeId.get(detailNodeId) ?? null) : null;

  const openOwner = useCallback(() => {
    if (!selectedWish) return;
    setDetailNodeId(selectedWish.nodeId);
  }, [selectedWish, setDetailNodeId]);

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

  const rowMenu = useCallback(
    (wishId: string): MenuItem[] => {
      const wish = rows.find((row) => row.id === wishId);
      if (!wish) return [];
      return [
        {
          label: "Open owner",
          shortcut: "Enter",
          onSelect: () => setDetailNodeId(wish.nodeId),
        },
      ];
    },
    [rows, setDetailNodeId],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (detailNodeId) return;
      if (isTypingTarget(event.target)) return;
      if (event.key === "Enter" && selectedWish) {
        event.preventDefault();
        setDetailNodeId(selectedWish.nodeId);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [detailNodeId, selectedWish, setDetailNodeId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <TabToolbar>
        <ToolbarSelect
          label="Result Area"
          value={scopeId}
          onChange={setScopeId}
          options={[{ value: "", label: "All Result Areas" }, ...resultAreas]}
        />
        <ToolbarButton onClick={() => setShowFields(true)}>Show Fields</ToolbarButton>
        <ToolbarButton
          onClick={gridState.clearFilters}
          disabled={!gridState.filtersActive}
          title="Clear every column filter on this view"
        >
          Clear Filters
        </ToolbarButton>
        <ToolbarButton onClick={openOwner} disabled={!selectedWish} title="Enter">
          Open owner
        </ToolbarButton>
      </TabToolbar>

      {error && <ErrorBanner message={error} />}

      <DataGrid<WishesColumnCtx, WishListRow>
        rows={gridRows}
        columns={gridState.columns}
        columnCtx={columnCtx}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onOpenDetail={(id) => {
          const wish = rows.find((row) => row.id === id);
          if (wish) setDetailNodeId(wish.nodeId);
        }}
        ariaLabel="Wish List"
        rowMenu={rowMenu}
        rowLabel={(row) => row.node.title || "Untitled wish"}
        enableFilters
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
        empty={
          <div className="flex h-full items-center justify-center p-8 text-[0.9375rem] text-ink-muted">
            No wishes yet. Add them on a Result Area&apos;s Wishes tab.
          </div>
        }
      />

      <NodeDetailDrawer node={detailNode} onClose={() => setDetailNodeId(null)} />

      <ShowFieldsDialog
        open={showFields}
        allColumns={wishesColumns}
        shownIds={gridState.order}
        onShow={gridState.show}
        onHide={gridState.hide}
        onMove={gridState.move}
        onReset={gridState.resetColumns}
        onClose={() => setShowFields(false)}
      />
    </div>
  );
}
