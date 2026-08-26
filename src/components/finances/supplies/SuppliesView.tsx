"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  createSupplyItemAction,
  createSupplyOptionAction,
  deleteSupplyItemAction,
  deleteSupplyOptionAction,
  listSupplyItemsAction,
  setSupplyOptionInUseAction,
  updateSupplyItemAction,
  updateSupplyOptionAction,
} from "@/app/finances/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import type { MenuItem } from "@/components/grid/ContextMenu";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridToolbar } from "@/components/grid/GridToolbar";
import type { GridDefaults } from "@/components/grid/useGridState";
import { useModuleViews } from "@/components/grid/useModuleViews";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { formatUsd } from "@/lib/finances/money";
import type { SupplyItemRow } from "@/lib/finances/supplies/queries";
import {
  supplyGrandTotals,
  supplyGroups,
  supplyItemRows,
  type SupplyGridRow,
} from "@/lib/finances/supplies/rows";
import type { GridRow } from "@/lib/tree/slice";
import { SuggestFromAmazonDialog } from "./SuggestFromAmazonDialog";
import {
  SUPPLIES_COLUMN_IDS,
  suppliesColumns,
  type SuppliesColumnCtx,
} from "./suppliesColumns";

const SUPPLY_VIEWS = [{ id: "all", label: "All Supplies" }] as const;

/**
 * Units/mo is off by default and available from Show Fields. Fourteen columns overflow a
 * laptop, and this is the one that restates the Rate column in different units rather than
 * carrying a fact of its own.
 */
function viewDefaults(): GridDefaults {
  return {
    order: SUPPLIES_COLUMN_IDS.filter((id) => id !== "unitsPerMonth"),
    sorts: [],
  };
}

/**
 * The recurring-consumable worksheet: what you rebuy, how fast, and at what price.
 *
 * Rows nest one level — an item, then every offer for it. Only the offer marked in use
 * contributes to a total, so a comparison row can sit on the sheet permanently without
 * inflating anything. Group headers subtotal by label and, where the whole group is funded
 * from one envelope, print that envelope's assignment beside the estimate; that comparison is
 * the point of the page, and it is read-only — nothing here writes the budget.
 */
export function SuppliesView({
  initialItems,
  envelopes,
}: {
  initialItems: SupplyItemRow[];
  envelopes: { id: string; name: string }[];
}) {
  const [items, setItems] = useState(initialItems);
  const [seenServerItems, setSeenServerItems] = useState(initialItems);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [deleting, setDeleting] = useState<{
    id: string;
    label: string;
    kind: "item" | "option";
  } | null>(null);
  const [pending, startTransition] = useTransition();

  if (initialItems !== seenServerItems) {
    setSeenServerItems(initialItems);
    setItems(initialItems);
  }

  const views = useModuleViews({
    moduleId: "supplies",
    builtIn: SUPPLY_VIEWS,
    defaultViewId: "all",
    columns: useMemo(() => suppliesColumns(), []),
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;

  const groups = useMemo(() => supplyGroups(items), [items]);
  const grandTotals = useMemo(() => supplyGrandTotals(groups), [groups]);

  /**
   * Group headers are built here rather than by the grid's own grouping: the header has to
   * carry a subtotal and an envelope, and the dimension is a free-text field the user edits
   * in the same grid.
   */
  const gridRows: GridRow<SupplyGridRow>[] = useMemo(
    () =>
      groups.flatMap((group): GridRow<SupplyGridRow>[] => [
        {
          kind: "group",
          id: `group:${group.label}`,
          label: group.label === "" ? "Ungrouped" : group.label,
          count: group.items.length,
          depth: 0,
          collapsed: false,
        },
        ...group.items.flatMap((head) =>
          supplyItemRows(head.item).map((node, index) => ({
            kind: "node" as const,
            id: node.id,
            node,
            depth: index === 0 ? 0 : 1,
            branch:
              index === 0
                ? {
                    hasChildren: head.item.options.length > 0,
                    childCount: head.item.options.length,
                  }
                : undefined,
          })),
        ),
      ]),
    [groups],
  );

  const columns = useMemo(() => suppliesColumns(), []);
  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        columns,
        gridRows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [columns, gridRows],
  );

  const rowIds = useMemo(
    () => gridRows.flatMap((row) => (row.kind === "node" ? [row.id] : [])),
    [gridRows],
  );
  const { order, onIdsChange } = useNavigableIds(rowIds);
  const { selectedId, selectedIds, select, headerState, toggleSelectAll } =
    useMultiSelect(order, null);

  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await listSupplyItemsAction();
      if (result.ok) setItems(result.data);
      else setError(result.error);
    });
  }, []);

  /** Every write goes through here: report the message inline, then re-read the worksheet. */
  const commit = useCallback(
    (work: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
      setError(null);
      startTransition(async () => {
        const result = await work();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const next = await listSupplyItemsAction();
        if (next.ok) setItems(next.data);
        else setError(next.error);
      });
    },
    [],
  );

  const ctx: SuppliesColumnCtx = useMemo(
    () => ({
      envelopes,
      pending,
      onPatchItem: (itemId, edit) => commit(() => updateSupplyItemAction(itemId, edit)),
      onPatchOption: (optionId, edit) =>
        commit(() => updateSupplyOptionAction(optionId, edit)),
      onSetInUse: (optionId) => commit(() => setSupplyOptionInUseAction(optionId)),
    }),
    [envelopes, pending, commit],
  );

  const addItem = useCallback(() => {
    commit(() =>
      createSupplyItemAction({
        name: "New item",
        rate: { rateBasis: "units_per_day", unitsPerDayMilli: 1000 },
      }),
    );
  }, [commit]);

  /** Which item a row belongs to, so "Add offer" works from an offer row as well. */
  const itemIdOf = useCallback(
    (rowId: string | null): string | null => {
      if (!rowId) return null;
      if (items.some((item) => item.id === rowId)) return rowId;
      return (
        items.find((item) => item.options.some((option) => option.id === rowId))?.id ??
        null
      );
    },
    [items],
  );

  const rowMenu = useCallback(
    (rowId: string | null): MenuItem[] => {
      const itemId = itemIdOf(rowId);
      const item = items.find((candidate) => candidate.id === itemId) ?? null;
      const option = items
        .flatMap((candidate) => candidate.options)
        .find((candidate) => candidate.id === rowId);
      return [
        { label: "New item", icon: "new", onSelect: addItem },
        {
          label: "Add offer",
          // Disabled with a reason rather than hidden — `components/navigation.md`.
          disabled: itemId === null,
          title:
            itemId === null ? "Select an item or one of its offers first." : undefined,
          onSelect: () => {
            if (itemId) commit(() => createSupplyOptionAction({ itemId }));
          },
        },
        "separator",
        {
          label: "Delete offer",
          disabled: option === undefined,
          title: option === undefined ? "Select an offer to delete." : undefined,
          destructive: true,
          onSelect: () => {
            if (option)
              setDeleting({
                id: option.id,
                kind: "option",
                label: option.vendor || option.brand || "this offer",
              });
          },
        },
        {
          label: "Delete item",
          disabled: item === null,
          title: item === null ? "Select an item to delete." : undefined,
          destructive: true,
          onSelect: () => {
            if (item) setDeleting({ id: item.id, kind: "item", label: item.name });
          },
        },
      ];
    },
    [items, itemIdOf, addItem, commit],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Supplies"
        allColumns={columns}
        distinctValues={distinctValues}
        counts={counts}
        error={error}
        views={views}
        right={
          <>
            <button
              type="button"
              disabled={pending}
              className="min-h-tap rounded border border-rule px-3 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0 md:py-1.5"
              onClick={addItem}
            >
              New item
            </button>
            <button
              type="button"
              disabled={pending}
              className="min-h-tap rounded border border-rule px-3 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0 md:py-1.5"
              onClick={() => setSuggesting(true)}
            >
              Suggest from Amazon
            </button>
          </>
        }
      />

      <DataGrid<SuppliesColumnCtx, SupplyGridRow>
        rows={gridRows}
        columns={gridState.columns}
        allColumns={columns}
        columnCtx={ctx}
        selectedId={selectedId}
        selectedIds={selectedIds}
        selectAllState={headerState}
        onToggleSelectAll={toggleSelectAll}
        onSelect={select}
        ariaLabel="Supplies worksheet"
        rowMenu={rowMenu}
        rowLabel={(row) =>
          row.node.kind === "item"
            ? row.node.item.name
            : `${row.node.option.vendor || "Offer"} for ${row.node.item.name}`
        }
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
        groupSummary={(_nodes, header) => {
          const group = groups.find(
            (candidate) => `group:${candidate.label}` === header.id,
          );
          if (!group) return null;
          return (
            <span className="tabular flex flex-wrap items-center gap-x-3 text-[0.75rem]">
              <span className="text-ink-muted">
                est.{" "}
                <span className="text-ink">{formatUsd(group.totals.monthlyCents)}</span>
                /mo
              </span>
              <span className="text-ink-muted">
                {formatUsd(group.totals.yearlyCents)}/yr
              </span>
              {group.envelopeName ? (
                <span className="text-ink-faint">
                  funded from {group.envelopeName}
                  {group.envelopeBudgetedCents === null
                    ? ""
                    : ` · budgeted ${formatUsd(group.envelopeBudgetedCents)}/mo`}
                </span>
              ) : null}
            </span>
          );
        }}
        empty={
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-[0.9375rem] text-ink-muted">
            <p>Nothing on the worksheet yet.</p>
            <p className="text-[0.8125rem] text-ink-faint">
              Add an item, or let Amazon suggest what you already rebuy.
            </p>
          </div>
        }
      />

      <footer className="tabular flex flex-wrap gap-x-5 gap-y-1 border-t border-rule bg-surface px-3 py-2 text-[0.8125rem]">
        <span className="text-ink-muted">All supplies</span>
        <span className="text-ink-muted">
          Biweekly{" "}
          <span className="text-ink">{formatUsd(grandTotals.biweeklyCents)}</span>
        </span>
        <span className="text-ink-muted">
          Monthly{" "}
          <span className="text-ink">{formatUsd(grandTotals.monthlyCents)}</span>
        </span>
        <span className="text-ink-muted">
          Yearly <span className="text-ink">{formatUsd(grandTotals.yearlyCents)}</span>
        </span>
      </footer>

      {suggesting ? (
        <SuggestFromAmazonDialog
          onClose={() => setSuggesting(false)}
          onAdded={refresh}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        title={deleting?.kind === "item" ? "Delete this item?" : "Delete this offer?"}
        message={
          deleting?.kind === "item"
            ? `"${deleting.label}" and every offer under it will be removed from the worksheet.`
            : `"${deleting?.label ?? ""}" will be removed. The item keeps its other offers.`
        }
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (!target) return;
          commit(() =>
            target.kind === "item"
              ? deleteSupplyItemAction(target.id)
              : deleteSupplyOptionAction(target.id),
          );
        }}
      />
    </div>
  );
}
