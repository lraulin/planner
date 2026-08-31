"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
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
import { rowMenuFor } from "@/components/grid/rowMenu";
import type { GridDefaults } from "@/components/grid/useGridState";
import { useModuleViews } from "@/components/grid/useModuleViews";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { useIsCompact } from "@/components/shell/useIsCompact";
import { INSERT_AFTER } from "@/lib/commands/chords";
import { collectDistinctValues } from "@/lib/grid/distinct";
import type { GridCommandCapabilities } from "@/lib/grid/commandDeck";
import { isTypingTarget } from "@/lib/keyboard";
import { formatUsd } from "@/lib/finances/money";
import type { BudgetEnvelopeCatalog } from "@/lib/finances/budget/queries";
import type { EnvelopeCatalog } from "@/lib/finances/budget/groupEnvelopeOptions";
import type { SupplyItemRow } from "@/lib/finances/supplies/queries";
import {
  itemIdsOfSelection,
  supplyDeleteTargets,
  supplyRowTotals,
  supplyGroups,
  supplyItemRows,
  type SupplyDeleteTargets,
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
function deleteCopy(
  targets: SupplyDeleteTargets,
  items: readonly SupplyItemRow[],
): { title: string; message: string } {
  const itemCount = targets.itemIds.length;
  const offerCount = targets.optionIds.length;
  const itemName =
    items.find((item) => item.id === targets.itemIds[0])?.name ?? "this item";
  const offer = items
    .flatMap((item) => item.options)
    .find((option) => option.id === targets.optionIds[0]);
  const offerName = offer?.vendor || offer?.brand || "this offer";

  if (itemCount > 0 && offerCount === 0) {
    return itemCount === 1
      ? {
          title: "Delete this item?",
          message: `"${itemName}" and every offer under it will be removed from the worksheet.`,
        }
      : {
          title: `Delete ${itemCount} items?`,
          message: `${itemCount} items and every offer under them will be removed from the worksheet.`,
        };
  }
  if (itemCount === 0 && offerCount > 0) {
    return offerCount === 1
      ? {
          title: "Delete this offer?",
          message: `"${offerName}" will be removed. The item keeps its other offers.`,
        }
      : {
          title: `Delete ${offerCount} offers?`,
          message: `${offerCount} offers will be removed. Their items keep any remaining offers.`,
        };
  }
  return {
    title: `Delete ${itemCount} items and ${offerCount} offers?`,
    message:
      "Selected items (with every offer under them) and the extra selected offers will be removed from the worksheet.",
  };
}

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
  const [deleting, setDeleting] = useState<SupplyDeleteTargets | null>(null);
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
  const {
    selectedId,
    selectedIds,
    select,
    headerState,
    toggleSelectAll,
    selectOne,
    selectAll,
    move,
  } = useMultiSelect(order, null);
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
    const groupLabel =
      selectedItemIds[0] != null
        ? (items.find((item) => item.id === selectedItemIds[0])?.groupLabel ?? "")
        : "";
    setError(null);
    startTransition(async () => {
      const result = await createSupplyItemAction({
        name: "New item",
        rate: { rateBasis: "units_per_day", unitsPerDayMilli: 1000 },
        ...(groupLabel !== "" ? { groupLabel } : {}),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const next = await listSupplyItemsAction();
      if (!next.ok) {
        setError(next.error);
        return;
      }
      setItems(next.data);
      if (result.id) selectOne(result.id);
    });
  }, [items, selectedItemIds, selectOne]);

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

  const requestDelete = useCallback(
    (ids: readonly string[]) => {
      const targets = supplyDeleteTargets(new Set(ids), items, order);
      if (targets.itemIds.length + targets.optionIds.length === 0) return;
      setDeleting(targets);
    },
    [items, order],
  );

  const capabilitiesFor = useCallback(
    (rowId: string | null, count: number): GridCommandCapabilities => {
      const rawIds =
        count > 1 ? order.filter((id) => selectedIds.has(id)) : rowId ? [rowId] : [];
      const targets = supplyDeleteTargets(new Set(rawIds), items, order);
      const ids = [...targets.itemIds, ...targets.optionIds];
      const itemId = itemIdOf(rowId);
      const selectedItem = items.find((item) => item.id === (ids[0] ?? rowId));
      const canPick = compact && items.length >= 2;
      const enough = selectedItemIds.length >= 2;
      const mergeDisabled = !enough && !canPick;
      return {
        selection: {
          id: rowId,
          count: ids.length,
          label: selectedItem?.name,
          ids,
        },
        actions: {
          onDelete: requestDelete,
          onSelectAll: selectAll,
        },
        pageCommands: [
          {
            id: "grid.create",
            label: "New item",
            group: "record",
            menu: "new",
            section: "New",
            icon: "new",
            toolbar: 10,
            rowMenu: true,
            bindings: INSERT_AFTER,
            run: addItem,
          },
          {
            id: "supplies.add-offer",
            label: "Add offer",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "new",
            rowMenu: true,
            disabled: itemId === null,
            title:
              itemId === null
                ? "Select an item or one of its offers first."
                : undefined,
            run: () => {
              if (itemId) commit(() => createSupplyOptionAction({ itemId }));
            },
          },
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
    },
    [
      order,
      selectedIds,
      items,
      itemIdOf,
      compact,
      selectedItemIds,
      requestDelete,
      selectAll,
      addItem,
      commit,
      requestMerge,
    ],
  );

  const commandCapabilities = useMemo(
    () => capabilitiesFor(selectedId, selectedIds.size),
    [capabilitiesFor, selectedId, selectedIds.size],
  );

  const rowMenu = useCallback(
    (rowId: string | null): MenuItem[] => {
      const count = rowId && selectedIds.has(rowId) ? selectedIds.size : rowId ? 1 : 0;
      return rowMenuFor(capabilitiesFor(rowId, count));
    },
    [capabilitiesFor, selectedIds],
  );

  const pendingDeleteCopy = deleting ? deleteCopy(deleting, items) : null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (deleting !== null || isTypingTarget(event.target)) return;
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
  }, [deleting, move]);

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
          <button
            type="button"
            disabled={pending}
            className="min-h-tap rounded border border-rule px-3 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0 md:py-1.5"
            onClick={() => setSuggesting(true)}
          >
            Suggest from Amazon
          </button>
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
        title={pendingDeleteCopy?.title ?? "Delete?"}
        message={pendingDeleteCopy?.message ?? ""}
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const targets = deleting;
          setDeleting(null);
          if (!targets) return;
          commit(async () => {
            for (const id of targets.itemIds) {
              const result = await deleteSupplyItemAction(id);
              if (!result.ok) return result;
            }
            for (const id of targets.optionIds) {
              const result = await deleteSupplyOptionAction(id);
              if (!result.ok) return result;
            }
            return { ok: true as const };
          });
        }}
      />
    </div>
  );
}
