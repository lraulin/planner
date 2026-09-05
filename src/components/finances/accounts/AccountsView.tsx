"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { BankLinkRow } from "@/lib/banksync/queries";
import {
  operationalAccountRows,
  type OperationalAccount,
} from "@/lib/finances/accountOperations";
import type { DashboardData } from "@/lib/finances/dashboardQueries";
import { accountPoolBreakdown } from "@/lib/finances/accountPool";
import { formatUsd } from "@/lib/finances/money";
import { customFilter } from "@/lib/grid/customFilter";
import { RefreshBanksButton, BankSnapshotPaste } from "./AccountOperations";
import type { GridRow } from "@/lib/tree/slice";
import type { FinanceAccountRow } from "@/lib/finances/types";
import { deleteAccountAction, listAccountsAction } from "@/app/finances/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { DataGrid } from "@/components/grid/DataGrid";
import {
  FileImportDialog,
  useFileImportCommand,
} from "@/components/import/FileImportHost";
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
import { FinanceImportPanel } from "../FinanceImportPanel";
import { AccountDrawer } from "./AccountDrawer";
import { UrlLink } from "@/components/url/UrlLink";
import {
  ACCOUNT_COLUMN_IDS,
  accountColumns,
  type AccountColumnCtx,
} from "./accountColumns";

const ACCOUNT_VIEWS = [
  { id: "open", label: "Open accounts" },
  { id: "all", label: "All accounts" },
] as const;

function viewDefaults(viewId: string): GridDefaults {
  return {
    order: [...ACCOUNT_COLUMN_IDS],
    filters:
      viewId === "open"
        ? { closed: customFilter("and", [{ op: "blank", value: "" }]) }
        : {},
    sorts: [{ columnId: "name", direction: "asc" }],
  };
}

function deleteMessage(account: FinanceAccountRow): string {
  return `Delete ${account.name} and its ${account.transactionCount} transactions?`;
}

export function AccountsView({
  initialAccounts,
  operations,
  links,
  todayKey,
}: {
  initialAccounts: FinanceAccountRow[];
  operations: DashboardData;
  links: BankLinkRow[];
  todayKey: string;
}) {
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [rows, setRows] = useState(initialAccounts);
  const position = accountPoolBreakdown(rows, operations.pending);
  const [seenServerRows, setSeenServerRows] = useState(initialAccounts);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FinanceAccountRow | null>(null);
  const {
    open: importOpen,
    openImport,
    closeImport: closeFileImport,
  } = useFileImportCommand({
    id: "import.finance",
    label: "Import transactions…",
    keywords: "csv statement bank card chase capital one pdf coinbase paypal",
  });
  const [, startTransition] = useTransition();
  const { detail: openId, setDetail: setOpenId } = useViewStateUrl();

  if (initialAccounts !== seenServerRows) {
    setSeenServerRows(initialAccounts);
    setRows(initialAccounts);
  }

  const views = useModuleViews({
    moduleId: "finance-accounts",
    builtIn: ACCOUNT_VIEWS,
    defaultViewId: "open",
    columns: accountColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;

  const gridRows: GridRow<OperationalAccount>[] = useMemo(
    () =>
      operationalAccountRows(
        rows,
        operations.pending,
        new Set(operations.withheldBrowserPendingAccountIds),
        links,
        operations.connections,
        todayKey,
      ).map((node) => ({ kind: "node" as const, id: node.id, node, depth: 0 })),
    [rows, operations, links, todayKey],
  );
  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        accountColumns,
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

  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await listAccountsAction();
      if (result.ok) setRows(result.data);
      else setError(result.error);
    });
  }, []);

  const closeImport = useCallback(() => {
    closeFileImport();
    refresh();
  }, [closeFileImport, refresh]);

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
    [rows, setPendingDelete],
  );

  const confirmDelete = useCallback(() => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteAccountAction(target.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (openId === target.id) closeDrawer();
      else refresh();
    });
  }, [pendingDelete, openId, closeDrawer, refresh, setPendingDelete]);

  const capabilitiesFor = useCallback(
    (rowId: string | null, count: number) =>
      catalogCapabilities({
        createLabel: "Import transactions…",
        openLabel: "Open account",
        selection: {
          id: rowId,
          count,
          label: rows.find((entry) => entry.id === rowId)?.name,
        },
        onCreate: openImport,
        onOpen: openDrawer,
        onDelete: (ids) => {
          if (ids[0]) requestDelete(ids[0]);
        },
        onSelectAll: selectAll,
      }),
    [rows, openImport, openDrawer, requestDelete, selectAll],
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

  const openAccount = gridRows.find((row) => row.kind === "node" && row.id === openId);
  const accountDetail = openAccount?.kind === "node" ? openAccount.node : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div className="flex shrink-0 flex-wrap items-start gap-2 border-b border-rule p-3">
        <RefreshBanksButton />
        <button
          type="button"
          className="min-h-tap rounded border border-rule px-2 py-1 text-sm md:min-h-0"
          onClick={() => setSnapshotOpen(!snapshotOpen)}
        >
          Paste bank snapshot
        </button>
        <button
          type="button"
          className="min-h-tap rounded border border-rule px-2 py-1 text-sm md:min-h-0"
          onClick={openImport}
        >
          Import transactions
        </button>
        <Link href="/finances/budget" className="ml-auto px-2 py-1 text-sm underline">
          Budget
        </Link>
      </div>
      {snapshotOpen && (
        <div className="max-h-[45dvh] shrink-0 overflow-auto p-3">
          <BankSnapshotPaste
            staleAccountNames={rows
              .filter((row) =>
                operations.withheldBrowserPendingAccountIds.includes(row.id),
              )
              .map((row) => row.name)}
          />
        </div>
      )}
      <div className="tabular flex shrink-0 flex-wrap gap-x-5 gap-y-1 border-b border-rule px-3 py-2 text-xs text-ink-muted">
        <span>
          Checking & cash{" "}
          <b className="text-ink">{formatUsd(position.checkingCashCents)}</b>
        </span>
        <span>
          Savings <b className="text-ink">{formatUsd(position.savingsCents)}</b>
        </span>
        <span>
          Card debt <b className="text-ink">{formatUsd(position.cardDebtCents)}</b>
        </span>
        <span>
          Budget pool <b className="text-ink">{formatUsd(position.accountPoolCents)}</b>
        </span>
      </div>
      {operations.connections
        .filter(
          (connection) =>
            connection.reauthRequiredAt || connection.unmatchedAccountCount > 0,
        )
        .map((connection) => (
          <p key={connection.id} className="px-3 py-1 text-xs text-priority-a">
            {connection.label}:{" "}
            {connection.reauthRequiredAt ? "Reconnect bank" : "Match accounts"} in{" "}
            <Link className="underline" href="/settings">
              Settings
            </Link>
          </p>
        ))}
      <GridToolbar
        grid={gridState}
        gridLabel="Accounts"
        allColumns={accountColumns}
        distinctValues={distinctValues}
        counts={counts}
        error={error}
        views={views}
        commandCapabilities={commandCapabilities}
      />

      <DataGrid<AccountColumnCtx, OperationalAccount>
        rows={gridRows}
        columns={gridState.columns}
        allColumns={accountColumns}
        columnCtx={{
          pending: operations.pending,
          staleIds: new Set(operations.withheldBrowserPendingAccountIds),
          onSnapshot: () => setSnapshotOpen(true),
        }}
        selectedId={selectedId}
        selectedIds={selectedIds}
        selectAllState={headerState}
        onToggleSelectAll={toggleSelectAll}
        onSelect={select}
        onOpenDetail={openDrawer}
        ariaLabel="Accounts"
        rowMenu={rowMenu}
        rowLabel={(row) => row.node.name || "Account"}
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
          <div className="mx-auto w-full max-w-2xl p-6">
            <p className="mb-4 text-center text-[0.9375rem] text-ink-muted">
              No accounts yet. Import a statement and they will appear here.
            </p>
            <div className="rounded border border-rule">
              <FinanceImportPanel />
            </div>
          </div>
        }
      />

      <FileImportDialog
        open={importOpen}
        onClose={closeImport}
        title="Import transactions"
      >
        <FinanceImportPanel embedded />
      </FileImportDialog>

      <AccountDrawer
        account={accountDetail}
        onClose={closeDrawer}
        onChanged={refresh}
        summary={
          accountDetail ? (
            <section className="mb-3 space-y-2 rounded border border-rule p-3 text-xs">
              <p className="tabular">
                Working {formatUsd(accountDetail.workingCents)} · Posted / headline{" "}
                {formatUsd(accountDetail.postedCents)} · Pending added{" "}
                {formatUsd(accountDetail.pendingCents)}
              </p>
              <p>
                {accountDetail.balanceSourceLabel} · {accountDetail.freshness}
              </p>
              {accountDetail.url ? (
                <UrlLink
                  value={accountDetail.url}
                  className="inline-block min-h-tap underline"
                >
                  Open banking site
                </UrlLink>
              ) : null}
            </section>
          ) : null
        }
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this account?"
        message={pendingDelete ? deleteMessage(pendingDelete) : ""}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
