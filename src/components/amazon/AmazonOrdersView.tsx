"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GridRow } from "@/lib/tree/slice";
import { AMAZON_GROUP_BY_VALUES, groupAmazonItems } from "@/lib/amazon/grouping";
import type { AmazonItemListRow } from "@/lib/amazon/types";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { FileImportHost } from "@/components/import/FileImportHost";
import { AmazonImportPanel } from "@/components/settings/AmazonImportPanel";
import { AmazonSnapshotPanel } from "@/components/amazon/AmazonSnapshotPanel";
import { AmazonReviewDrawer } from "@/components/amazon/AmazonReviewDrawer";
import { useRegisterCommands } from "@/components/shell/CommandProvider";
import { useModuleViews } from "@/components/grid/useModuleViews";
import type { GridDefaults } from "@/components/grid/useGridState";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { isTypingTarget } from "@/lib/keyboard";
import type { MenuItem } from "@/components/grid/ContextMenu";
import {
  addSupplyFromAmazonItemAction,
  addSupplyOptionFromAmazonAction,
  listSupplyItemsAction,
} from "@/app/finances/actions";
import { SupplyItemPickerDialog } from "@/components/finances/supplies/SupplyItemPickerDialog";
import type { SupplyItemRow } from "@/lib/finances/supplies/queries";
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
      "bill",
      "match",
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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [supplyPicker, setSupplyPicker] = useState<{
    asin: string;
    items: SupplyItemRow[];
  } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const router = useRouter();

  const reviewCommands = useMemo(
    () => [
      {
        id: "amazon.review-matches",
        label: "Review Amazon matches…",
        group: "view" as const,
        menu: "item" as const,
        icon: "open" as const,
        keywords: "amazon subscribe save match review charge",
        run: () => setReviewOpen(true),
      },
    ],
    [],
  );
  useRegisterCommands(reviewCommands);

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

  /**
   * The discovery path for the Supplies worksheet: you notice you keep rebuying something
   * while looking at what you bought. Adding lands on the worksheet, because the rate it
   * infers is a guess that wants correcting where the totals are visible.
   */
  const rowMenu = useCallback(
    (rowId: string | null): MenuItem[] => {
      const row = rows.find((candidate) => candidate.id === rowId);
      const asin = row?.asin ?? "";
      return [
        {
          label: "Review Amazon match…",
          disabled: row?.matchLabel !== "Review",
          title:
            row?.matchLabel === "Review"
              ? undefined
              : "This line has no unresolved Amazon charge.",
          onSelect: () => setReviewOpen(true),
        },
        {
          label: "Add to Supplies…",
          disabled: pending || asin === "",
          title: asin === "" ? "This line item has no ASIN to track." : undefined,
          onSelect: () => {
            setError(null);
            startTransition(async () => {
              const listed = await listSupplyItemsAction();
              if (!listed.ok) {
                setError(listed.error);
                return;
              }
              if (listed.data.length === 0) {
                const result = await addSupplyFromAmazonItemAction(asin);
                if (result.ok) router.push("/finances/supplies");
                else setError(result.error);
                return;
              }
              setSupplyPicker({ asin, items: listed.data });
            });
          },
        },
      ];
    },
    [rows, pending, router],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Amazon orders"
        allColumns={amazonColumns}
        distinctValues={distinctValues}
        counts={counts}
        error={error}
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
        rowMenu={rowMenu}
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

      {supplyPicker ? (
        <SupplyItemPickerDialog
          items={supplyPicker.items}
          title="Add to Supplies"
          description="Create a new item, or attach this product as an offer on one you already track. Either way you will land on the worksheet."
          allowNewItem
          onClose={() => setSupplyPicker(null)}
          onPick={(choice) => {
            const asin = supplyPicker.asin;
            setSupplyPicker(null);
            startTransition(async () => {
              const result =
                choice.kind === "new"
                  ? await addSupplyFromAmazonItemAction(asin)
                  : await addSupplyOptionFromAmazonAction(choice.itemId, asin);
              if (result.ok) router.push("/finances/supplies");
              else setError(result.error);
            });
          }}
        />
      ) : null}

      <FileImportHost
        commandId="import.amazon"
        label="Import Amazon orders…"
        keywords="amazon orders slim json data request"
        title="Import Amazon orders"
      >
        <AmazonImportPanel embedded />
      </FileImportHost>
      <FileImportHost
        commandId="import.amazon-snapshot"
        label="Import Amazon subscription snapshot…"
        keywords="amazon subscribe save snapshot payments bills"
        title="Import Amazon subscription snapshot"
        width="max-w-2xl"
      >
        <AmazonSnapshotPanel />
      </FileImportHost>
      <AmazonReviewDrawer open={reviewOpen} onClose={() => setReviewOpen(false)} />
    </div>
  );
}
