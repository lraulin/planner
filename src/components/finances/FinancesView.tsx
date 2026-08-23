"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { GridRow } from "@/lib/tree/slice";
import { formatUsd } from "@/lib/finances/money";
import { FINANCE_GROUP_BY_VALUES, groupTransactions } from "@/lib/finances/grouping";
import type { FinanceAccountRow, TransactionListRow } from "@/lib/finances/types";
import {
  claimedPayeeMap,
  trackAsBillRefusal,
  type ClaimedPayee,
} from "@/lib/finances/registerBillDraft";
import {
  deleteTransactionAction,
  listAccountsAction,
  listTransactionsAction,
  setTransactionBudgetCategoryAction,
  unlinkTransactionAction,
  upcomingOccurrencesAction,
} from "@/app/finances/actions";
import { DateText } from "@/components/date/DateText";
import { useToday } from "@/components/grid/useToday";
import { useSetting } from "@/components/settings/SettingsProvider";
import { SCHEDULES_SCOPE } from "@/lib/settings/scopes";
import { SCHEDULES_CODEC } from "./schedules/schedulesSetting";
import { LinkScheduleDialog } from "./schedules/LinkScheduleDialog";
import type { UpcomingOccurrence } from "@/lib/finances/schedules/upcoming";
import {
  UPCOMING_LENGTH_LABELS,
  UPCOMING_LENGTH_PRESETS,
} from "@/lib/finances/schedules/status";
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
import { FinanceImportPanel } from "./FinanceImportPanel";
import { TransactionDrawer } from "./TransactionDrawer";
import { RuleDrawer } from "./rules/RuleDrawer";
import {
  createRuleRefusal,
  ruleDraftFromTransaction,
} from "@/lib/finances/rules/fromTransaction";
import { TrackAsBillDialog } from "./TrackAsBillDialog";
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

/** Balance strip above the register — statement-anchored when a snapshot exists. */
function AccountBalances({ accounts }: { accounts: FinanceAccountRow[] }) {
  if (accounts.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-rule bg-surface-raised px-3 py-1.5">
      {accounts.map((account) => {
        const mismatch = account.balanceMismatchCents !== 0;
        const title = mismatch
          ? `Statement ${formatUsd(account.statementClosingCents ?? 0)} as of ${account.statementPeriodEnd}. Ledger sum ${formatUsd(account.ledgerBalanceCents)}.`
          : account.statementPeriodEnd
            ? `Statement ${formatUsd(account.statementClosingCents ?? 0)} as of ${account.statementPeriodEnd}.`
            : "Sum of imported transactions.";
        return (
          <span
            key={account.id}
            title={title}
            className="flex items-baseline gap-1.5 text-[0.8125rem]"
          >
            {account.url ? (
              <a
                href={account.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-ink-muted underline-offset-2 hover:underline"
              >
                {account.name}
              </a>
            ) : (
              <span className="text-ink-muted">{account.name}</span>
            )}
            <span
              className={`tabular font-medium ${
                account.balanceCents < 0 || mismatch ? "text-priority-a" : "text-ink"
              }`}
            >
              {formatUsd(account.balanceCents)}
            </span>
            {mismatch ? (
              <span className="text-[0.75rem] text-ink-muted">
                ledger {formatUsd(account.ledgerBalanceCents)}
              </span>
            ) : null}
          </span>
        );
      })}
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
  initialClaimed,
  envelopes,
  initialUpcoming = [],
  payees,
}: {
  initialTransactions: TransactionListRow[];
  initialAccounts: FinanceAccountRow[];
  initialClaimed: readonly ClaimedPayee[];
  /** Budget envelopes, in budget order. Empty until a budget exists. */
  envelopes: readonly { id: string; name: string }[];
  /** Unposted schedule occurrences. Not transactions; never mixed into `rows`. */
  initialUpcoming?: UpcomingOccurrence[];
  payees: readonly { id: string; name: string }[];
}) {
  const [rows, setRows] = useState(initialTransactions);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [claimed, setClaimed] = useState(initialClaimed);
  const [seenServerRows, setSeenServerRows] = useState(initialTransactions);
  const [seenClaimed, setSeenClaimed] = useState(initialClaimed);
  const [billRowId, setBillRowId] = useState<string | null>(null);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [groupIds, setGroupIds] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TransactionListRow | null>(null);
  const [upcoming, setUpcoming] = useState(initialUpcoming);
  const [linkRowId, setLinkRowId] = useState<string | null>(null);
  const [ruleRowId, setRuleRowId] = useState<string | null>(null);
  const today = useToday();
  const { value: scheduleSettings, patch: patchScheduleSettings } = useSetting(
    SCHEDULES_SCOPE,
    SCHEDULES_CODEC,
  );
  const {
    open: importOpen,
    openImport,
    closeImport: closeFileImport,
  } = useFileImportCommand({
    id: "import.finance",
    label: "Import transactions…",
    keywords: "csv statement bank card chase capital one pdf coinbase paypal",
  });
  const [pending, startTransition] = useTransition();
  const { detail: openId, setDetail: setOpenId } = useViewStateUrl();

  if (initialTransactions !== seenServerRows || initialClaimed !== seenClaimed) {
    setSeenServerRows(initialTransactions);
    setSeenClaimed(initialClaimed);
    setRows(initialTransactions);
    setAccounts(initialAccounts);
    setClaimed(initialClaimed);
  }

  const views = useModuleViews({
    moduleId: "finances",
    builtIn: FINANCE_VIEWS,
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

  useEffect(() => {
    if (!today) return;
    startTransition(async () => {
      const preview = await upcomingOccurrencesAction(
        today,
        scheduleSettings.upcomingLength,
      );
      if (preview.ok) setUpcoming(preview.data);
    });
  }, [today, scheduleSettings.upcomingLength]);

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
      if (today) {
        const preview = await upcomingOccurrencesAction(
          today,
          scheduleSettings.upcomingLength,
        );
        if (preview.ok) setUpcoming(preview.data);
      }
    });
  }, [today, scheduleSettings.upcomingLength]);

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

  const claimedByPayee = useMemo(() => claimedPayeeMap(claimed), [claimed]);

  const capabilitiesFor = useCallback(
    (rowId: string | null, count: number) => {
      const row = rowId ? rows.find((entry) => entry.id === rowId) : undefined;
      const cannotTrack =
        rowId === null ? "Select a row first" : trackAsBillRefusal(row, claimedByPayee);
      const cannotCreateRule = createRuleRefusal(row);
      return catalogCapabilities({
        // A transaction is not typed in, it arrives from the bank — so the catalog's
        // "make a new one" verb is the import, not a blank row.
        createLabel: "Import transactions…",
        openLabel: "Open transaction",
        selection: {
          id: rowId,
          count,
          label: row?.description,
        },
        onCreate: openImport,
        onOpen: openDrawer,
        onDelete: requestDelete,
        pageCommands: [
          {
            id: "record.create-rule",
            label: "Create rule from transaction…",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "convert",
            rowMenu: true,
            keywords: "rule categorise classify merchant payee",
            disabled: cannotCreateRule !== null,
            title: cannotCreateRule ?? undefined,
            run: () => {
              if (rowId && !cannotCreateRule) setRuleRowId(rowId);
            },
          },
          {
            id: "record.link-schedule",
            label: "Link to schedule…",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "convert",
            rowMenu: true,
            keywords: "schedule recurring",
            disabled: !rowId,
            title: rowId ? undefined : "Select a row first",
            run: () => {
              if (rowId) setLinkRowId(rowId);
            },
          },
          {
            id: "record.unlink-schedule",
            label: "Unlink from schedule",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "delete",
            rowMenu: true,
            disabled: !row?.scheduleId,
            title: row?.scheduleId ? undefined : "This row is not linked to a schedule",
            run: () => {
              if (!rowId || !row?.scheduleId) return;
              startTransition(async () => {
                const result = await unlinkTransactionAction(rowId);
                if (!result.ok) setError(result.error);
                else refresh();
              });
            },
          },
          {
            id: "record.track-as-bill",
            label: "Track as bill…",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "convert",
            rowMenu: true,
            keywords: "bill subscription recurring declare",
            disabled: Boolean(cannotTrack),
            title: cannotTrack ?? undefined,
            run: () => {
              if (rowId && !cannotTrack) setBillRowId(rowId);
            },
          },
        ],
      });
    },
    [rows, claimedByPayee, openImport, openDrawer, requestDelete, refresh],
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
      if (openId || ruleRowId || pendingDelete || isTypingTarget(event.target)) return;
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
  }, [openId, ruleRowId, pendingDelete, move]);

  const ruleSource = ruleRowId ? rows.find((row) => row.id === ruleRowId) : undefined;

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

      {upcoming.length > 0 || scheduleSettings.upcomingLength !== "7" ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule bg-surface-raised px-3 py-1.5">
          <span className="text-[0.75rem] font-medium uppercase tracking-wider text-ink-muted">
            Upcoming
          </span>
          <select
            className="bg-transparent text-[0.8125rem] text-ink"
            value={scheduleSettings.upcomingLength}
            onChange={(event) => {
              const next = event.target.value;
              patchScheduleSettings((current) => ({
                ...current,
                upcomingLength: next,
              }));
              if (!today) return;
              startTransition(async () => {
                const result = await upcomingOccurrencesAction(today, next);
                if (result.ok) setUpcoming(result.data);
              });
            }}
          >
            {UPCOMING_LENGTH_PRESETS.map((value) => (
              <option key={value} value={value}>
                {UPCOMING_LENGTH_LABELS[value]}
              </option>
            ))}
          </select>
          {upcoming.map((row) => (
            <span
              key={`${row.scheduleId}:${row.date}`}
              className="flex items-baseline gap-1.5 text-[0.8125rem]"
            >
              <span className="text-ink">{row.name}</span>
              <DateText dateKey={row.date} className="text-ink-muted" />
              <span className="tabular text-ink-muted">
                {formatUsd(row.amountCents)}
              </span>
            </span>
          ))}
        </div>
      ) : null}

      <DataGrid<FinanceColumnCtx, TransactionListRow>
        rows={gridRows}
        columns={gridState.columns}
        allColumns={financeColumns}
        columnCtx={{
          envelopes,
          pending,
          onSetEnvelope: (transactionId, categoryId) => {
            setError(null);
            startTransition(async () => {
              const result = await setTransactionBudgetCategoryAction(
                transactionId,
                categoryId,
              );
              if (!result.ok) setError(result.error ?? "Could not set the envelope.");
              else refresh();
            });
          },
        }}
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

      <FileImportDialog
        open={importOpen}
        onClose={closeImport}
        title="Import transactions"
      >
        <FinanceImportPanel embedded />
      </FileImportDialog>

      {linkRowId && (
        <LinkScheduleDialog
          transactionId={linkRowId}
          onClose={() => setLinkRowId(null)}
          onLinked={() => {
            setLinkRowId(null);
            refresh();
          }}
        />
      )}
      {billRowId && (
        <TrackAsBillDialog
          rows={rows}
          selectedId={billRowId}
          onClose={() => setBillRowId(null)}
          onSaved={(entry) => {
            setClaimed((current) => [...current, entry]);
            setBillRowId(null);
          }}
        />
      )}
      <TransactionDrawer
        transactionId={openId}
        onClose={closeDrawer}
        onChanged={refresh}
      />
      {ruleSource ? (
        <RuleDrawer
          rule={null}
          initialDraft={ruleDraftFromTransaction(ruleSource)}
          payees={payees}
          accounts={accounts.map(({ id, name }) => ({ id, name }))}
          open
          onClose={() => setRuleRowId(null)}
          onSaved={() => undefined}
        />
      ) : null}
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
