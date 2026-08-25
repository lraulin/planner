"use client";

import { useEffect, useMemo, useState } from "react";
import type { GridRow } from "@/lib/tree/slice";
import { AMAZON_GROUP_BY_VALUES, groupAmazonItems } from "@/lib/amazon/grouping";
import type { AmazonItemListRow } from "@/lib/amazon/types";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { FileImportHost } from "@/components/import/FileImportHost";
import { AmazonImportPanel } from "@/components/settings/AmazonImportPanel";
import { useModuleViews } from "@/components/grid/useModuleViews";
import type { GridDefaults } from "@/components/grid/useGridState";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { isTypingTarget } from "@/lib/keyboard";
import { amazonColumns, type AmazonColumnCtx } from "./amazonColumns";

const AMAZON_VIEWS = [{ id: "all", label: "All Orders" }] as const;

function viewDefaults(): GridDefaults {
  return {
    order: [
      "date",
      "product",
      "qty",
      "paid",
      "payment",
      "sns",
      "status",
      "channel",
      "orderId",
      "refunded",
    ],
    sorts: [{ columnId: "date", direction: "desc" }],
    groupBy: ["year", "month"],
  };
}

export function AmazonOrdersView({
  initialItems,
}: {
  initialItems: AmazonItemListRow[];
}) {
  const [rows, setRows] = useState(initialItems);
  const [seen, setSeen] = useState(initialItems);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [groupIds, setGroupIds] = useState<readonly string[]>([]);

  if (initialItems !== seen) {
    setSeen(initialItems);
    setRows(initialItems);
  }

  const views = useModuleViews({
    moduleId: "amazon",
    builtIn: AMAZON_VIEWS,
    defaultViewId: "all",
    columns: amazonColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;

  const gridRows: GridRow<AmazonItemListRow>[] = useMemo(
    () => groupAmazonItems(rows, gridState.groupBy),
    [rows, gridState.groupBy],
  );
  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        amazonColumns,
        gridRows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [gridRows],
  );
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const { order, onIdsChange } = useNavigableIds(rowIds);
  const { selectedId, selectedIds, select, toggleSelectAll, headerState, move } =
    useMultiSelect(order, null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1, event.shiftKey);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1, event.shiftKey);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [move]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Amazon orders"
        allColumns={amazonColumns}
        distinctValues={distinctValues}
        counts={counts}
        views={views}
        groupDimensions={AMAZON_GROUP_BY_VALUES}
        groupIds={groupIds}
      />

      <DataGrid<AmazonColumnCtx, AmazonItemListRow>
        rows={gridRows}
        columns={gridState.columns}
        allColumns={amazonColumns}
        columnCtx={{}}
        selectedId={selectedId}
        selectedIds={selectedIds}
        selectAllState={headerState}
        onToggleSelectAll={toggleSelectAll}
        onSelect={select}
        ariaLabel="Amazon orders"
        rowLabel={(row) => row.node.productName || "Amazon item"}
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
        onGroupIdsChange={setGroupIds}
        density={gridState.density}
        empty={
          <p className="mx-auto max-w-lg p-6 text-center text-[0.9375rem] text-ink-muted">
            No Amazon orders yet. Run{" "}
            <code className="text-ink">npm run amazon:slim</code> on the privacy-request
            zip, then import the JSON from File → Import Amazon orders…
          </p>
        }
      />

      <FileImportHost
        commandId="import.amazon"
        label="Import Amazon orders…"
        keywords="amazon orders slim json data request"
        title="Import Amazon orders"
      >
        <AmazonImportPanel embedded />
      </FileImportHost>
    </div>
  );
}
