"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { GridRow } from "@/lib/tree/slice";
import type { BudgetEnvelopeOption } from "@/lib/finances/budget/queries";
import type { PayeeRow } from "@/lib/finances/payees/queries";
import {
  deletePayeeAction,
  listPayeesAction,
  seedPayeesAction,
  updatePayeeDetailsAction,
} from "@/app/finances/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { DataGrid } from "@/components/grid/DataGrid";
import type { MenuItem } from "@/components/grid/ContextMenu";
import { rowMenuFor } from "@/components/grid/rowMenu";
import { catalogCapabilities } from "@/components/grid/catalogCommands";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { useModuleViews } from "@/components/grid/useModuleViews";
import type { GridDefaults } from "@/components/grid/useGridState";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { isTypingTarget } from "@/lib/keyboard";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import { useIsCompact } from "@/components/shell/useIsCompact";
import { PayeeDrawer } from "./PayeeDrawer";
import { PayeeMergeDialog } from "./PayeeMergeDialog";
import { PayeeMergePickerDialog } from "./PayeeMergePickerDialog";
import { PAYEE_COLUMN_IDS, payeeColumns, type PayeeColumnCtx } from "./payeeColumns";

const PAYEE_VIEWS = [{ id: "all", label: "All Payees" }] as const;
const NO_PAYEES_SELECTED: ReadonlySet<string> = new Set();

function viewDefaults(): GridDefaults {
  return {
    order: [...PAYEE_COLUMN_IDS],
    sorts: [{ columnId: "name", direction: "asc" }],
  };
}

function deleteMessage(payee: PayeeRow): string {
  // Naming the charge count matters because the answer is surprising in the right direction:
  // the transactions survive. Only the pointer goes.
  return payee.transactionCount === 0
    ? `Delete ${payee.name}?`
    : `Delete ${payee.name}? Its ${payee.transactionCount} charges stay in the register and lose their payee until the next rebuild.`;
}

export function PayeesView({
  initialPayees,
  envelopes,
}: {
  initialPayees: PayeeRow[];
  envelopes: readonly BudgetEnvelopeOption[];
}) {
  const compact = useIsCompact();
  const [rows, setRows] = useState(initialPayees);
  const [seenServerRows, setSeenServerRows] = useState(initialPayees);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PayeeRow | null>(null);
  const [pendingMerge, setPendingMerge] = useState<PayeeRow[] | null>(null);
  const [choosingMerge, setChoosingMerge] = useState(false);
  const [pending, startTransition] = useTransition();
  const { detail: openId, setDetail: setOpenId } = useViewStateUrl();

  if (initialPayees !== seenServerRows) {
    setSeenServerRows(initialPayees);
    setRows(initialPayees);
  }

  const views = useModuleViews({
    moduleId: "finance-payees",
    builtIn: PAYEE_VIEWS,
    defaultViewId: "all",
    columns: payeeColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;

  const gridRows: GridRow<PayeeRow>[] = useMemo(
    () => rows.map((node) => ({ kind: "node" as const, id: node.id, node, depth: 0 })),
    [rows],
  );
  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        payeeColumns,
        gridRows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [gridRows],
  );
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const { order, onIdsChange } = useNavigableIds(rowIds);
  const multi = useMultiSelect(order, null);
  const {
    selectedId,
    selectedIds,
    select,
    selectAll,
    toggleSelectAll,
    headerState,
    move,
  } = multi;
  const clearSelection = multi.selectOne;

  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await listPayeesAction();
      if (result.ok) setRows(result.data);
      else setError(result.error);
    });
  }, []);

  /**
   * Read the register and create whatever payees it implies.
   *
   * Idempotent, so this is a button rather than a one-time setup step: pressing it after an
   * import folds the new merchants in, and pressing it twice does nothing.
   */
  const rebuild = useCallback(() => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await seedPayeesAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const summary = result.data;
      if (!summary) {
        setNotice("Register rebuild finished.");
        refresh();
        return;
      }
      const parts = [
        `${summary.createdPayees} payees created`,
        `${summary.addedAliases} spellings claimed`,
        `${summary.assigned} charges assigned`,
      ];
      if (summary.unresolved > 0) {
        parts.push(`${summary.unresolved} charges name no merchant`);
      }
      if (summary.conflicts.length > 0) {
        // The planner refuses to guess when one merchant's spellings sit on two payees, so
        // the money that would have moved is money that did not — say which.
        parts.push(
          `${summary.conflicts.length} split across payees and left alone: ${summary.conflicts
            .map((entry) => entry.name)
            .join(", ")}`,
        );
      }
      setNotice(parts.join(" · "));
      refresh();
    });
  }, [refresh]);

  const openDrawer = useCallback((id: string) => setOpenId(id), [setOpenId]);
  const closeDrawer = useCallback(() => {
    setOpenId(null);
    refresh();
  }, [setOpenId, refresh]);

  const rename = useCallback(
    (payeeId: string, name: string) => {
      const payee = rows.find((entry) => entry.id === payeeId);
      if (!payee) return;
      setError(null);
      startTransition(async () => {
        const result = await updatePayeeDetailsAction(payeeId, {
          name,
          notes: payee.notes,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        refresh();
      });
    },
    [rows, refresh],
  );

  const requestDelete = useCallback(
    (id: string) => {
      const row = rows.find((entry) => entry.id === id);
      if (row) setPendingDelete(row);
    },
    [rows],
  );

  const confirmDelete = useCallback(() => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const result = await deletePayeeAction(target.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (openId === target.id) closeDrawer();
      else refresh();
    });
  }, [pendingDelete, openId, closeDrawer, refresh]);

  const requestMerge = useCallback(() => {
    const selected = rows.filter((row) => selectedIds.has(row.id));
    if (selected.length >= 2) setPendingMerge(selected);
    else setChoosingMerge(true);
  }, [rows, selectedIds]);

  const finishMerge = useCallback(
    (message: string) => {
      setPendingMerge(null);
      setNotice(message);
      clearSelection(null);
      refresh();
    },
    [clearSelection, refresh],
  );

  const capabilitiesFor = useCallback(
    (rowId: string | null, count: number) =>
      catalogCapabilities({
        createLabel: "Rebuild from register…",
        openLabel: "Edit aliases…",
        selection: {
          id: rowId,
          count,
          label: rows.find((entry) => entry.id === rowId)?.name,
        },
        onCreate: rebuild,
        onOpen: openDrawer,
        onDelete: (ids) => {
          if (ids[0]) requestDelete(ids[0]);
        },
        onSelectAll: selectAll,
        pageCommands: [
          {
            id: "payees.merge",
            label: count >= 2 ? "Merge selected payees…" : "Select payees to merge…",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "convert",
            rowMenu: true,
            run: requestMerge,
          },
        ],
      }),
    [rows, rebuild, openDrawer, requestDelete, requestMerge, selectAll],
  );

  const commandCapabilities = useMemo(
    () => capabilitiesFor(selectedId, selectedIds.size),
    [capabilitiesFor, selectedId, selectedIds.size],
  );

  const rowMenu = useCallback(
    (id: string | null): MenuItem[] => rowMenuFor(capabilitiesFor(id, id ? 1 : 0)),
    [capabilitiesFor],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        openId ||
        pendingDelete ||
        pendingMerge ||
        choosingMerge ||
        isTypingTarget(event.target)
      )
        return;
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
  }, [openId, pendingDelete, pendingMerge, choosingMerge, move]);

  const openPayee = openId ? (rows.find((row) => row.id === openId) ?? null) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Payees"
        allColumns={payeeColumns}
        distinctValues={distinctValues}
        counts={counts}
        error={error}
        views={views}
        commandCapabilities={commandCapabilities}
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

      <DataGrid<PayeeColumnCtx, PayeeRow>
        rows={gridRows}
        columns={gridState.columns}
        allColumns={payeeColumns}
        columnCtx={{ compact, pending, onRename: rename }}
        selectedId={selectedId}
        selectedIds={selectedIds}
        selectAllState={headerState}
        onToggleSelectAll={toggleSelectAll}
        onSelect={select}
        onOpenDetail={openDrawer}
        ariaLabel="Payees"
        rowMenu={rowMenu}
        rowLabel={(row) => row.node.name || "Payee"}
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
          <div className="mx-auto w-full max-w-2xl p-6 text-center">
            <p className="mb-4 text-[0.9375rem] text-ink-muted">
              No payees yet. Build them from the merchants already in your register.
            </p>
            <button
              type="button"
              className="min-h-tap rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0"
              onClick={rebuild}
            >
              Rebuild from register
            </button>
          </div>
        }
      />

      <PayeeDrawer
        payee={openPayee}
        envelopes={envelopes}
        onClose={closeDrawer}
        onChanged={refresh}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this payee?"
        message={pendingDelete ? deleteMessage(pendingDelete) : ""}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      {pendingMerge && (
        <PayeeMergeDialog
          payees={pendingMerge}
          onClose={() => setPendingMerge(null)}
          onMerged={finishMerge}
        />
      )}
      {choosingMerge && (
        <PayeeMergePickerDialog
          payees={rows}
          initiallySelected={selectedIds.size >= 2 ? selectedIds : NO_PAYEES_SELECTED}
          onClose={() => setChoosingMerge(false)}
          onContinue={(selected) => {
            setChoosingMerge(false);
            setPendingMerge(selected);
          }}
        />
      )}
    </div>
  );
}
