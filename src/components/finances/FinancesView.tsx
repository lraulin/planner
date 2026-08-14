"use client";

import { useCallback, useEffect, useId, useMemo, useState, useTransition } from "react";
import type { GridRow } from "@/lib/tree/slice";
import { formatUsd } from "@/lib/finances/money";
import { FINANCE_GROUP_BY_VALUES, groupTransactions } from "@/lib/finances/grouping";
import type { FinanceAccountRow, TransactionListRow } from "@/lib/finances/types";
import {
  deleteTransactionAction,
  listAccountsAction,
  listTransactionsAction,
} from "@/app/finances/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { ModalShell } from "@/components/detail/ModalShell";
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
import { FinanceImportPanel } from "./FinanceImportPanel";
import { TransactionDrawer } from "./TransactionDrawer";
import {
  FINANCE_COLUMN_IDS,
  financeColumns,
  type FinanceColumnCtx,
} from "./financeColumns";

const FINANCE_VIEWS = [{ id: "all", label: "All Transactions" }] as const;

function viewDefaults(): GridDefaults {
  return {
    order: [...FINANCE_COLUMN_IDS],
    // A register is read newest first; anything else is a deliberate choice the user makes.
    sorts: [{ columnId: "date", direction: "desc" }],
    // Year then month so a skipped statement is a missing header, not a hole in a flat list.
    groupBy: ["year", "month"],
  };
}

/** Balance strip above the register — one figure per account, summed in SQL. */
function AccountBalances({ accounts }: { accounts: FinanceAccountRow[] }) {
  if (accounts.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-rule bg-surface-raised px-3 py-1.5">
      {accounts.map((account) => (
        <span key={account.id} className="flex items-baseline gap-1.5 text-[0.8125rem]">
          <span className="text-ink-muted">{account.name}</span>
          <span
            className={`tabular font-medium ${
              account.balanceCents < 0 ? "text-priority-a" : "text-ink"
            }`}
          >
            {formatUsd(account.balanceCents)}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * The transaction register.
 *
 * Every transaction the user has is loaded and the shared grid does the narrowing — its
 * date filter, its account set-filter and its search, all of which persist per user through
 * the `grid:finances` scope. Two years of four accounts is about 2,000 rows, which the grid
 * handles without help; if that stops being true the fix is a server-side date window in
 * `listTransactions`, which already takes one.
 */
export function FinancesView({
  initialTransactions,
  initialAccounts,
}: {
  initialTransactions: TransactionListRow[];
  initialAccounts: FinanceAccountRow[];
}) {
  const [rows, setRows] = useState(initialTransactions);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [seenServerRows, setSeenServerRows] = useState(initialTransactions);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [groupIds, setGroupIds] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TransactionListRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const importTitleId = useId();
  const [, startTransition] = useTransition();
  const { detail: openId, setDetail: setOpenId } = useViewStateUrl();

  if (initialTransactions !== seenServerRows) {
    setSeenServerRows(initialTransactions);
    setRows(initialTransactions);
    setAccounts(initialAccounts);
  }

  const views = useModuleViews({
    moduleId: "finances",
    defaultViews: FINANCE_VIEWS,
    defaultViewId: "all",
    columns: financeColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;

  const gridRows: GridRow<TransactionListRow>[] = useMemo(
    () => groupTransactions(rows, gridState.groupBy),
    [rows, gridState.groupBy],
  );
  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        financeColumns,
        gridRows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [gridRows],
  );
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const { order, onIdsChange } = useNavigableIds(rowIds);
  const multi = useMultiSelect(order, null);
  const { selectedId, selectedIds, select, move } = multi;

  const refresh = useCallback(() => {
    startTransition(async () => {
      const [transactions, accountRows] = await Promise.all([
        listTransactionsAction(),
        listAccountsAction(),
      ]);
      if (!transactions.ok) {
        setError(transactions.error);
        return;
      }
      setRows(transactions.data);
      // Balances move whenever rows do, so they are refreshed together or they disagree.
      if (accountRows.ok) setAccounts(accountRows.data);
    });
  }, []);

  const openImport = useCallback(() => setImportOpen(true), []);
  const closeImport = useCallback(() => {
    setImportOpen(false);
    refresh();
  }, [refresh]);

  const openDrawer = useCallback((id: string) => setOpenId(id), [setOpenId]);
  const closeDrawer = useCallback(() => {
    setOpenId(null);
    refresh();
  }, [setOpenId, refresh]);

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
      const result = await deleteTransactionAction(target.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (openId === target.id) closeDrawer();
      else refresh();
    });
  }, [pendingDelete, openId, closeDrawer, refresh]);

  const capabilitiesFor = useCallback(
    (rowId: string | null, count: number) =>
      catalogCapabilities({
        // A transaction is not typed in, it arrives from the bank — so the catalog's
        // "make a new one" verb is the import, not a blank row.
        createLabel: "Import transactions…",
        openLabel: "Open transaction",
        selection: {
          id: rowId,
          count,
          label: rows.find((entry) => entry.id === rowId)?.description,
        },
        onCreate: openImport,
        onOpen: openDrawer,
        onDelete: requestDelete,
      }),
    [rows, openImport, openDrawer, requestDelete],
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
      if (openId || pendingDelete || isTypingTarget(event.target)) return;
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
  }, [openId, pendingDelete, move]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Transactions"
        allColumns={financeColumns}
        distinctValues={distinctValues}
        counts={counts}
        error={error}
        views={views}
        commandCapabilities={commandCapabilities}
        groupDimensions={FINANCE_GROUP_BY_VALUES}
        groupIds={groupIds}
      />

      <AccountBalances accounts={accounts} />

      <DataGrid<FinanceColumnCtx, TransactionListRow>
        rows={gridRows}
        columns={gridState.columns}
        allColumns={financeColumns}
        columnCtx={{}}
        selectedId={selectedId}
        selectedIds={selectedIds}
        onSelect={select}
        onOpenDetail={openDrawer}
        ariaLabel="Transactions"
        rowMenu={rowMenu}
        rowNumbers
        rowLabel={(row) => row.node.description || "Transaction"}
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
          <div className="mx-auto w-full max-w-2xl p-6">
            <p className="mb-4 text-center text-[0.9375rem] text-ink-muted">
              No transactions yet. Import a CSV export from your bank to get started.
            </p>
            <div className="rounded border border-rule">
              <FinanceImportPanel />
            </div>
          </div>
        }
      />

      <ModalShell
        open={importOpen}
        onClose={closeImport}
        labelledBy={importTitleId}
        width="max-w-xl"
      >
        <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
          <h2
            id={importTitleId}
            className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-muted"
          >
            Import transactions
          </h2>
          <button
            type="button"
            onClick={closeImport}
            className="min-h-tap px-2 text-[0.875rem] text-ink-muted md:min-h-0"
          >
            Close
          </button>
        </div>
        <FinanceImportPanel embedded />
      </ModalShell>

      <TransactionDrawer
        transactionId={openId}
        onClose={closeDrawer}
        onChanged={refresh}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this transaction?"
        message={`"${pendingDelete?.description ?? ""}" will be removed. It will come back the next time you import a file that contains it.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
