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
import { useIsCompact } from "@/components/shell/useIsCompact";
import { collectDistinctValues } from "@/lib/grid/distinct";
import type { GridCommandCapabilities } from "@/lib/grid/commandDeck";
import { formatUsd } from "@/lib/finances/money";
import type { BudgetEnvelopeCatalog } from "@/lib/finances/budget/queries";
import type { EnvelopeCatalog } from "@/lib/finances/budget/groupEnvelopeOptions";
import type { SupplyItemRow } from "@/lib/finances/supplies/queries";
import {
  itemIdsOfSelection,
  supplyRowTotals,
  supplyGroups,
  supplyItemRows,
  type SupplyGridRow,
} from "@/lib/finances/supplies/rows";
import type { GridRow } from "@/lib/tree/slice";
import { SuggestFromAmazonDialog } from "./SuggestFromAmazonDialog";
import { SupplyMergeDialog } from "./SupplyMergeDialog";
import { SupplyMergePickerDialog } from "./SupplyMergePickerDialog";
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
function fundingCatalog(catalog: BudgetEnvelopeCatalog): EnvelopeCatalog {
  return {
    groups: catalog.groups
      .filter((group) => group.kind !== "income")
      .map((group) => ({
        id: group.id,
        name: group.name,
        parentGroupId: group.parentGroupId,
        sortKey: group.sortKey,
        hidden: group.hidden,
      })),
    envelopes: catalog.envelopes.filter((envelope) => envelope.kind !== "income"),
  };
}

export function SuppliesView({
  initialItems,
  catalog,
}: {
  initialItems: SupplyItemRow[];
  catalog: BudgetEnvelopeCatalog;
}) {
  const [items, setItems] = useState(initialItems);
  const [seenServerItems, setSeenServerItems] = useState(initialItems);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [pendingMerge, setPendingMerge] = useState<
    readonly { id: string; name: string }[] | null
  >(null);
  const [choosingMerge, setChoosingMerge] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
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

  /** The group behind a header id — the rows are built by hand below, so is the lookup. */
  const groupFor = useCallback(
    (headerId: string) =>
      groups.find((candidate) => `group:${candidate.label}` === headerId) ?? null,
    [groups],
  );

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
  const { selectedId, selectedIds, select, headerState, toggleSelectAll, selectOne } =
    useMultiSelect(order, null);
  const compact = useIsCompact();
  const selectedItemIds = useMemo(
    () => itemIdsOfSelection(selectedIds, items),
    [selectedIds, items],
  );

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
      catalog: fundingCatalog(catalog),
      pending,
      onPatchItem: (itemId, edit) => commit(() => updateSupplyItemAction(itemId, edit)),
      onPatchOption: (optionId, edit) =>
        commit(() => updateSupplyOptionAction(optionId, edit)),
      onSetInUse: (optionId) => commit(() => setSupplyOptionInUseAction(optionId)),
    }),
    [catalog, pending, commit],
  );

  const requestMerge = useCallback(() => {
    const selected = selectedItemIds
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is SupplyItemRow => item !== undefined);
    if (selected.length >= 2) setPendingMerge(selected);
    else if (compact && items.length >= 2) setChoosingMerge(true);
  }, [selectedItemIds, items, compact]);

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
      const mergeDisabled =
        selectedItemIds.length < 2 && !(compact && items.length >= 2);
      return [
        { label: "New item", icon: "new", onSelect: addItem },
        {
          label:
            selectedItemIds.length >= 2
              ? "Merge selected items…"
              : "Select items to merge…",
          disabled: mergeDisabled,
          title: mergeDisabled ? "Select two different items to merge." : undefined,
          onSelect: requestMerge,
        },
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
    [items, itemIdOf, addItem, commit, requestMerge, selectedItemIds, compact],
  );

  const commandCapabilities: GridCommandCapabilities = useMemo(() => {
    const canPick = compact && items.length >= 2;
    const enough = selectedItemIds.length >= 2;
    const mergeDisabled = !enough && !canPick;
    const selectedItem = items.find((item) => item.id === selectedItemIds[0]);
    return {
      selection: {
        id: selectedId,
        count: selectedItemIds.length,
        label: selectedItem?.name,
        ids: selectedItemIds,
      },
      actions: {},
      pageCommands: [
        {
          id: "supplies.merge",
          label: enough ? "Merge selected items…" : "Select items to merge…",
          group: "record",
          menu: "item",
          section: "Item",
          icon: "convert",
          rowMenu: true,
          disabled: mergeDisabled,
          title: mergeDisabled ? "Select two different items to merge." : undefined,
          run: requestMerge,
        },
      ],
    };
  }, [compact, items, selectedId, selectedItemIds, requestMerge]);

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
        commandCapabilities={commandCapabilities}
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

      {notice !== null && (
        <div className="flex items-start gap-3 border-b border-rule px-4 py-2 text-[0.8125rem] text-ink-muted">
          <span className="min-w-0 flex-1">{notice}</span>
          <button
            type="button"
            className="shrink-0 text-ink-muted hover:text-ink"
            onClick={() => setNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}

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
        // The periods go in their own columns, so `est.` / `/mo` / `/yr` go: Biweekly,
        // Monthly and Yearly are written directly above each figure.
        groupTotals={(nodes) => {
          // Summed from the rows the grid is showing, so a filtered group's subtotal adds
          // up to the rows under it the way its count already restates.
          const totals = supplyRowTotals(nodes);
          return {
            biweekly: formatUsd(totals.biweeklyCents),
            monthly: formatUsd(totals.monthlyCents),
            yearly: formatUsd(totals.yearlyCents),
          };
        }}
        // Which envelope pays for the group is a fact about the group, not a column.
        groupNote={(_nodes, header) => {
          const group = groupFor(header.id);
          if (!group?.envelopeName) return null;
          return `funded from ${group.envelopeName}${
            group.envelopeBudgetedCents === null
              ? ""
              : ` · budgeted ${formatUsd(group.envelopeBudgetedCents)}/mo`
          }`;
        }}
        footerTotals={(nodes) => {
          const totals = supplyRowTotals(nodes);
          return {
            biweekly: formatUsd(totals.biweeklyCents),
            monthly: formatUsd(totals.monthlyCents),
            yearly: formatUsd(totals.yearlyCents),
          };
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

      {suggesting ? (
        <SuggestFromAmazonDialog
          items={items}
          onClose={() => setSuggesting(false)}
          onAdded={refresh}
        />
      ) : null}

      {choosingMerge ? (
        <SupplyMergePickerDialog
          items={items}
          initiallySelected={new Set(selectedItemIds)}
          onClose={() => setChoosingMerge(false)}
          onContinue={(chosen) => {
            setChoosingMerge(false);
            setPendingMerge(chosen);
          }}
        />
      ) : null}

      {pendingMerge ? (
        <SupplyMergeDialog
          items={pendingMerge}
          onClose={() => setPendingMerge(null)}
          onMerged={(message) => {
            setPendingMerge(null);
            setNotice(message);
            selectOne(null);
            refresh();
          }}
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
