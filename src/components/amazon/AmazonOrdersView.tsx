"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { AMAZON_GROUP_BY_VALUES } from "@/lib/amazon/grouping";
import { formatUsd } from "@/lib/finances/money";
import type { AmazonItemListRow } from "@/lib/amazon/types";
import {
  parseAmazonOrdersQuery,
  type AmazonOrdersPrepared,
} from "@/lib/amazon/ordersQuery";
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
import { useToday } from "@/components/grid/useToday";
import { isTypingTarget } from "@/lib/keyboard";
import type { MenuItem } from "@/components/grid/ContextMenu";
import {
  addSupplyFromAmazonItemAction,
  addSupplyOptionFromAmazonAction,
  listSupplyItemsAction,
} from "@/app/finances/actions";
import { SupplyItemPickerDialog } from "@/components/finances/supplies/SupplyItemPickerDialog";
import type { SupplyItemRow } from "@/lib/finances/supplies/queries";
import {
  amazonColumns,
  AMAZON_COLUMN_IDS,
  type AmazonColumnCtx,
} from "./amazonColumns";
import { useAmazonSource } from "./useAmazonSource";

const AMAZON_VIEWS = [
  { id: "all", label: "All Orders" },
  { id: "by-order", label: "By order" },
] as const;

function viewDefaults(viewId: string, collapsedYears: string[]): GridDefaults {
  if (viewId === "by-order") {
    return {
      order: [...AMAZON_COLUMN_IDS],
      sorts: [{ columnId: "date", direction: "desc" }],
      groupBy: ["order"],
    };
  }
  return {
    order: [...AMAZON_COLUMN_IDS],
    sorts: [{ columnId: "date", direction: "desc" }],
    groupBy: ["year", "month"],
    collapsedGroups: collapsedYears,
  };
}

function subscribeNever() {
  return () => {};
}

/** False during SSR and hydration; true after the client has painted the shell. */
function useIsClient() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

export function AmazonOrdersView({
  initialPrepared,
  todayKey,
  defaultCollapsedGroups,
}: {
  initialPrepared: AmazonOrdersPrepared;
  todayKey: string;
  defaultCollapsedGroups: string[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [supplyPicker, setSupplyPicker] = useState<{
    asin: string;
    items: SupplyItemRow[];
  } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewChargeId, setReviewChargeId] = useState<string | null>(null);
  const router = useRouter();
  const today = useToday();
  const isClient = useIsClient();

  const reviewCommands = useMemo(
    () => [
      {
        id: "amazon.review-matches",
        label: "Review Amazon matches…",
        group: "view" as const,
        menu: "item" as const,
        icon: "open" as const,
        keywords: "amazon subscribe save match review charge",
        run: () => {
          setReviewChargeId(null);
          setReviewOpen(true);
        },
      },
    ],
    [],
  );
  useRegisterCommands(reviewCommands);

  const defaultsFor = useCallback(
    (viewId: string) => viewDefaults(viewId, defaultCollapsedGroups),
    [defaultCollapsedGroups],
  );
  const views = useModuleViews({
    moduleId: "amazon",
    builtIn: AMAZON_VIEWS,
    defaultViewId: "all",
    columns: amazonColumns,
    defaultsFor,
  });
  const gridState = views.grid;

  const ordersQuery = useMemo(
    () =>
      parseAmazonOrdersQuery({
        search: gridState.search,
        filters: gridState.filters,
        advancedFilter: gridState.advancedFilter,
        sorts: gridState.sorts,
        groupBy: gridState.groupBy,
        collapsedGroups: [...gridState.collapsedGroups],
        visibleColumnIds: gridState.columns.map((column) => column.id),
        today: today ?? todayKey,
      }),
    [
      gridState.search,
      gridState.filters,
      gridState.advancedFilter,
      gridState.sorts,
      gridState.groupBy,
      gridState.collapsedGroups,
      gridState.columns,
      today,
      todayKey,
    ],
  );
  const source = useAmazonSource({
    initial: initialPrepared,
    query: ordersQuery,
  });
  const {
    index,
    gridRows,
    pendingRowIds,
    distinctValues,
    counts,
    groupIds,
    error: sourceError,
    onVisibleRange,
    loadExportRows,
    rowById,
    groupPaidCents,
    groupMatch,
  } = source;

  const openReview = useCallback((chargeId: string | null) => {
    setReviewChargeId(chargeId);
    setReviewOpen(true);
  }, []);
  const { order, onIdsChange } = useNavigableIds(index.nodeIds);
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

  const displayError = error ?? sourceError;

  const rowMenu = useCallback(
    (rowId: string | null): MenuItem[] => {
      const row = rowById(rowId);
      const asin = row?.asin ?? "";
      return [
        {
          label: "Review Amazon match…",
          disabled: row?.matchLabel !== "Review",
          title:
            row?.matchLabel === "Review"
              ? undefined
              : "This line has no unresolved Amazon charge.",
          onSelect: () => openReview(row?.chargeId ?? null),
        },
        {
          label: "Add to Supplies…",
          disabled: asin === "",
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
    [rowById, router, openReview],
  );

  const columnCtx = useMemo(
    () => ({
      onReview: (row: AmazonItemListRow) => openReview(row.chargeId),
    }),
    [openReview],
  );

  const groupTotals = useCallback(
    (_members: AmazonItemListRow[], group: { id: string }) => {
      const paid = groupPaidCents.get(group.id);
      const match = groupMatch.get(group.id);
      const totals: Record<string, ReactNode> = {};
      if (paid !== undefined) totals.paid = formatUsd(paid);
      if (match?.matchLabel === "Review" && match.chargeId) {
        totals.match = (
          <button
            type="button"
            className="min-h-tap text-left text-[0.8125rem] font-semibold text-[var(--select-edge)] underline-offset-2 hover:underline md:min-h-0"
            onClick={(event) => {
              event.stopPropagation();
              openReview(match.chargeId);
            }}
          >
            Review
          </button>
        );
      } else if (match?.matchLabel) {
        totals.match = match.matchLabel;
      }
      return Object.keys(totals).length > 0 ? totals : null;
    },
    [groupPaidCents, groupMatch, openReview],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Amazon orders"
        allColumns={amazonColumns}
        distinctValues={distinctValues}
        counts={counts}
        error={displayError}
        views={views}
        groupDimensions={AMAZON_GROUP_BY_VALUES}
        groupIds={groupIds}
      />

      <DataGrid<AmazonColumnCtx, AmazonItemListRow>
        rows={isClient ? gridRows : []}
        columns={gridState.columns}
        allColumns={amazonColumns}
        columnCtx={columnCtx}
        onOpenDetail={(id) => {
          const row = rowById(id);
          if (row?.matchLabel === "Review") openReview(row.chargeId);
        }}
        groupTotals={groupTotals}
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
        preparedCounts={counts}
        preparedDisplay
        virtualize={isClient}
        pendingRowIds={pendingRowIds}
        onVisibleRange={onVisibleRange}
        loadExportRows={loadExportRows}
        onNavigableIdsChange={onIdsChange}
        widths={gridState.widths}
        onResizeColumn={gridState.setWidth}
        onResetColumnWidth={gridState.clearWidth}
        columnControls={gridState.columnControls}
        collapsedGroups={gridState.collapsedGroups}
        onToggleGroup={gridState.toggleGroup}
        density={gridState.density}
        empty={
          !isClient ? (
            <div className="min-h-0 flex-1" />
          ) : (
            <p className="mx-auto max-w-lg p-6 text-center text-[0.9375rem] text-ink-muted">
              No Amazon orders yet. Run{" "}
              <code className="text-ink">npm run amazon:slim</code> on the
              privacy-request zip, then import the JSON from File → Import Amazon
              orders…
            </p>
          )
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
      <AmazonReviewDrawer
        open={reviewOpen}
        focusChargeId={reviewChargeId}
        onClose={() => {
          setReviewOpen(false);
          setReviewChargeId(null);
        }}
      />
    </div>
  );
}
