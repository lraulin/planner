"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { formatUsd } from "@/lib/finances/money";
import { FINANCE_GROUP_BY_VALUES } from "@/lib/finances/grouping";
import type { FinanceAccountRow, TransactionListRow } from "@/lib/finances/types";
import {
  claimedPayeeMap,
  trackAsBillRefusal,
  type ClaimedPayee,
} from "@/lib/finances/registerBillDraft";
import { parseRegisterQuery } from "@/lib/finances/registerQuery";
import type { RegisterPrepared } from "@/lib/finances/registerQuery";
import {
  deleteTransactionAction,
  getTransactionAction,
  listAccountsAction,
  setTransactionBudgetCategoryAction,
  upcomingBillsAction,
} from "@/app/finances/actions";
import { DateText } from "@/components/date/DateText";
import { useToday } from "@/components/grid/useToday";
import {
  UPCOMING_HORIZON_DAYS,
  type UpcomingBillRow,
} from "@/lib/finances/commitments";
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
import { optionsFilter } from "@/lib/grid/customFilter";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { isTypingTarget } from "@/lib/keyboard";
import { useRegisterSource } from "./useRegisterSource";
import { useSearchParams } from "next/navigation";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import { FinanceImportPanel } from "./FinanceImportPanel";
import { TransactionDrawer } from "./TransactionDrawer";
import { RuleDrawer } from "./rules/RuleDrawer";
import {
  createRuleRefusal,
  ruleDraftFromTransaction,
} from "@/lib/finances/rules/fromTransaction";
import { TrackAsBillDialog } from "./TrackAsBillDialog";
import { NewEnvelopeDialog } from "./NewEnvelopeDialog";
import type { EnvelopePickerOption } from "@/lib/finances/budget/groupEnvelopeOptions";
import type { EnvelopeKind } from "@/db/schema";
import {
  FINANCE_COLUMN_IDS,
  financeColumns,
  type FinanceColumnCtx,
} from "./financeColumns";

const FINANCE_VIEWS = [
  { id: "all", label: "All Transactions" },
  { id: "uncategorized", label: "Uncategorized" },
  { id: "tag", label: "Tag" },
] as const;

function viewDefaults(
  viewId: string,
  tag: string | null,
  collapsedYears: string[],
): GridDefaults {
  return {
    order: [...FINANCE_COLUMN_IDS],
    // A register is read newest first; anything else is a deliberate choice the user makes.
    sorts: [{ columnId: "date", direction: "desc" }],
    // Year then month so a skipped statement is a missing header, not a hole in a flat list.
    groupBy: ["year", "month"],
    collapsedGroups: collapsedYears,
    filters:
      viewId === "uncategorized"
        ? { category: optionsFilter(["Uncategorized"]) }
        : viewId === "tag" && tag
          ? { tags: optionsFilter([tag]) }
          : {},
  };
}

function transactionRowLabel(row: { node: TransactionListRow }): string {
  return row.node.description || "Transaction";
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
 * The transaction
 *
 * Every transaction the user has is loaded and the shared grid does the narrowing — its
 * date filter, its account set-filter and its search, all of which persist per user through
 * the `grid:finances` scope. Prior years start collapsed so the DOM is the current year,
 * not six years of history; search still sees every row. Drawer open/close and envelope
 * edits patch the in-memory row; reloading the list on those paths is a freeze.
 */
export function FinancesView({
  initialPrepared,
  initialAccounts,
  initialClaimed,
  envelopes,
  budgetStartMonth,
  initialUpcoming = [],
  payees,
  tags,
  todayKey,
  defaultCollapsedGroups,
}: {
  initialPrepared: RegisterPrepared;
  initialAccounts: FinanceAccountRow[];
  initialClaimed: readonly ClaimedPayee[];
  /** Budget envelopes, in budget order. Empty until a budget exists. */
  envelopes: readonly EnvelopePickerOption[];
  /** First date whose transactions contribute to the envelope budget. */
  budgetStartMonth: string | null;
  /** Unposted schedule occurrences. Not transactions; never mixed into `rows`. */
  initialUpcoming?: UpcomingBillRow[];
  payees: readonly { id: string; name: string }[];
  tags: readonly { tag: string; color: string | null }[];
  /** Calendar today, so year-collapse defaults are available on the first paint. */
  todayKey: string;
  defaultCollapsedGroups: string[];
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [claimed, setClaimed] = useState(initialClaimed);
  const [seenPrepared, setSeenPrepared] = useState(initialPrepared);
  const [seenClaimed, setSeenClaimed] = useState(initialClaimed);
  const [billRowId, setBillRowId] = useState<string | null>(null);
  const [newEnvelope, setNewEnvelope] = useState<{
    transactionId: string;
    kind: Exclude<EnvelopeKind, "bill">;
  } | null>(null);
  const [createdEnvelopes, setCreatedEnvelopes] = useState<EnvelopePickerOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TransactionListRow | null>(null);
  const [upcoming, setUpcoming] = useState(initialUpcoming);
  const [ruleRowId, setRuleRowId] = useState<string | null>(null);
  const today = useToday();
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
  const isClient = useIsClient();
  const { detail: openId, setDetail: setOpenId } = useViewStateUrl();
  // Tag deep-links live on the client so the Register page does not subscribe to
  // searchParams — that subscription reloaded every transaction whenever the
  // drawer wrote `?detail=`.
  const initialTag = useSearchParams().get("tag");

  if (initialPrepared !== seenPrepared || initialClaimed !== seenClaimed) {
    setSeenPrepared(initialPrepared);
    setSeenClaimed(initialClaimed);
    setAccounts(initialAccounts);
    setClaimed(initialClaimed);
  }

  const collapsedYears = defaultCollapsedGroups;
  const defaultsFor = useCallback(
    (viewId: string) => viewDefaults(viewId, initialTag, collapsedYears),
    [initialTag, collapsedYears],
  );
  const views = useModuleViews({
    moduleId: "finances",
    builtIn: FINANCE_VIEWS,
    defaultViewId: "all",
    columns: financeColumns,
    defaultsFor,
  });
  const gridState = views.grid;
  useEffect(() => {
    if (views.base === "uncategorized" || views.base === "tag") {
      gridState.clearViewState();
    }
    // Deep links are task entry points: they must open on their exact row set rather than
    // inheriting an unrelated Register search from the previous visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deep-link mount reset
  }, []);
  const offBudgetAccountIds = useMemo(
    () =>
      new Set(
        accounts.filter((account) => account.offBudget).map((account) => account.id),
      ),
    [accounts],
  );

  const registerQuery = useMemo(
    () =>
      parseRegisterQuery({
        viewId: views.base,
        tag: initialTag,
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
      views.base,
      initialTag,
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
  const register = useRegisterSource({
    initial: initialPrepared,
    query: registerQuery,
  });
  const {
    index,
    gridRows,
    pendingRowIds,
    distinctValues,
    counts,
    groupIds,
    error: registerError,
    onVisibleRange,
    patchRow,
    reload,
    loadExportRows,
    rowById,
    putRow,
  } = register;
  const { order, onIdsChange } = useNavigableIds(index.nodeIds);
  const multi = useMultiSelect(order, null);
  const { selectedId, selectedIds, select, move } = multi;

  useEffect(() => {
    if (!today) return;
    startTransition(async () => {
      const preview = await upcomingBillsAction(today, UPCOMING_HORIZON_DAYS);
      if (preview.ok) setUpcoming(preview.data);
    });
  }, [today]);

  const refresh = useCallback(() => {
    startTransition(async () => {
      await reload();
      const accountRows = await listAccountsAction();
      if (accountRows.ok) setAccounts(accountRows.data);
      if (today) {
        const preview = await upcomingBillsAction(today, UPCOMING_HORIZON_DAYS);
        if (preview.ok) setUpcoming(preview.data);
      }
    });
  }, [reload, today]);

  const closeImport = useCallback(() => {
    closeFileImport();
    refresh();
  }, [closeFileImport, refresh]);

  const envelopeCatalog = useMemo(() => {
    const known = new Set(envelopes.map((envelope) => envelope.id));
    return [
      ...envelopes,
      ...createdEnvelopes.filter((envelope) => !known.has(envelope.id)),
    ];
  }, [envelopes, createdEnvelopes]);
  const envelopeNameById = useMemo(
    () => new Map(envelopeCatalog.map((envelope) => [envelope.id, envelope.name])),
    [envelopeCatalog],
  );

  const claimedByPayee = useMemo(() => claimedPayeeMap(claimed), [claimed]);

  const onSetEnvelope = useCallback(
    (transactionId: string, categoryId: string | null) => {
      setError(null);
      patchRow(transactionId, {
        budgetCategoryId: categoryId,
        budgetCategoryName: categoryId
          ? (envelopeNameById.get(categoryId) ?? null)
          : null,
      });
      startTransition(async () => {
        const result = await setTransactionBudgetCategoryAction(
          transactionId,
          categoryId,
        );
        if (!result.ok) {
          setError(result.error ?? "Could not set the envelope.");
          refresh();
          return;
        }
        if (
          registerQuery.groupBy.includes("category") ||
          registerQuery.filters.category ||
          registerQuery.sorts.some((sort) => sort.columnId === "category") ||
          registerQuery.search.trim() !== ""
        ) {
          void reload();
        }
      });
    },
    [envelopeNameById, refresh, patchRow, reload, registerQuery],
  );

  const onCreateEnvelope = useCallback(
    (transactionId: string, kind: EnvelopeKind) => {
      if (kind === "bill") {
        const row = rowById(transactionId) ?? undefined;
        const refusal = trackAsBillRefusal(row, claimedByPayee);
        if (refusal) {
          setError(refusal);
          return;
        }
        setBillRowId(transactionId);
        return;
      }
      setNewEnvelope({ transactionId, kind });
    },
    [rowById, claimedByPayee],
  );

  const tagColors = useMemo(
    () => Object.fromEntries(tags.map((tag) => [tag.tag, tag.color])),
    [tags],
  );

  const columnCtx = useMemo(
    () => ({
      envelopes: envelopeCatalog,
      budgetStartMonth,
      offBudgetAccountIds,
      tagColors,
      onSetEnvelope,
      onCreateEnvelope,
    }),
    [
      envelopeCatalog,
      budgetStartMonth,
      offBudgetAccountIds,
      tagColors,
      onSetEnvelope,
      onCreateEnvelope,
    ],
  );

  useEffect(() => {
    if (!openId || rowById(openId)) return;
    void getTransactionAction(openId).then((result) => {
      if (result.ok && result.data) putRow(result.data);
    });
  }, [openId, rowById, putRow]);

  const openDrawer = useCallback((id: string) => setOpenId(id), [setOpenId]);
  const closeDrawer = useCallback(() => {
    // Do not refresh here. The Register is every transaction the user has; reloading
    // it on close is a multi-second freeze, and a successful edit already called
    // `onChanged`. Deleting the open row refreshes explicitly below.
    setOpenId(null);
  }, [setOpenId]);

  const requestDelete = useCallback(
    (id: string) => {
      const row = rowById(id);
      if (row) setPendingDelete(row);
    },
    [rowById],
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
      refresh();
    });
  }, [pendingDelete, openId, closeDrawer, refresh]);

  const capabilitiesFor = useCallback(
    (rowId: string | null, count: number) => {
      const row = rowId ? (rowById(rowId) ?? undefined) : undefined;
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
    [rowById, claimedByPayee, openImport, openDrawer, requestDelete],
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

  const ruleSource = ruleRowId ? rowById(ruleRowId) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Transactions"
        allColumns={financeColumns}
        distinctValues={distinctValues}
        counts={counts}
        error={error ?? registerError}
        views={views}
        commandCapabilities={commandCapabilities}
        groupDimensions={FINANCE_GROUP_BY_VALUES}
        groupIds={groupIds}
      />

      <AccountBalances accounts={accounts} />

      {upcoming.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule bg-surface-raised px-3 py-1.5">
          <span className="text-[0.75rem] font-medium uppercase tracking-wider text-ink-muted">
            Upcoming (next {UPCOMING_HORIZON_DAYS} days)
          </span>
          {upcoming.map((row) => (
            <span
              key={`${row.name}:${row.dateKey}`}
              className="flex items-baseline gap-1.5 text-[0.8125rem]"
            >
              <span className="text-ink">{row.name}</span>
              <DateText dateKey={row.dateKey} className="text-ink-muted" />
              <span className="tabular text-ink-muted">
                {formatUsd(row.amountCents)}
              </span>
            </span>
          ))}
        </div>
      ) : null}

      <DataGrid<FinanceColumnCtx, TransactionListRow>
        rows={isClient ? gridRows : []}
        columns={gridState.columns}
        allColumns={financeColumns}
        columnCtx={columnCtx}
        selectedId={selectedId}
        selectedIds={selectedIds}
        onSelect={select}
        onOpenDetail={openDrawer}
        ariaLabel="Transactions"
        rowMenu={rowMenu}
        rowNumbers
        rowLabel={transactionRowLabel}
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
          ) : views.base === "uncategorized" ? (
            <p className="p-8 text-center text-[0.9375rem] text-ink-muted">
              Everything eligible has a Category.
            </p>
          ) : views.base === "tag" ? (
            <p className="p-8 text-center text-[0.9375rem] text-ink-muted">
              No transactions use {initialTag ? `#${initialTag}` : "this tag"}.
            </p>
          ) : (
            <div className="mx-auto w-full max-w-2xl p-6">
              <p className="mb-4 text-center text-[0.9375rem] text-ink-muted">
                No transactions yet. Import a CSV export from your bank to get started.
              </p>
              <div className="rounded border border-rule">
                <FinanceImportPanel />
              </div>
            </div>
          )
        }
      />

      <FileImportDialog
        open={importOpen}
        onClose={closeImport}
        title="Import transactions"
      >
        <FinanceImportPanel embedded />
      </FileImportDialog>

      {billRowId && (
        <TrackAsBillDialog
          selectedId={billRowId}
          onClose={() => setBillRowId(null)}
          onSaved={(entry) => {
            setClaimed((current) => [...current, entry]);
            setBillRowId(null);
            void reload();
          }}
        />
      )}
      {newEnvelope && (
        <NewEnvelopeDialog
          kind={newEnvelope.kind}
          onClose={() => setNewEnvelope(null)}
          onCreated={(id, name) => {
            const transactionId = newEnvelope.transactionId;
            setCreatedEnvelopes((current) => [
              ...current,
              { id, label: name, name, kind: newEnvelope.kind },
            ]);
            setNewEnvelope(null);
            onSetEnvelope(transactionId, id);
          }}
        />
      )}
      <TransactionDrawer
        transactionId={openId}
        row={openId ? rowById(openId) : null}
        envelopes={envelopeCatalog}
        budgetStartMonth={budgetStartMonth}
        offBudgetAccountIds={offBudgetAccountIds}
        managedTags={tags.map((tag) => tag.tag)}
        onClose={closeDrawer}
        onChanged={patchRow}
        onCreateEnvelope={onCreateEnvelope}
      />
      {ruleSource ? (
        <RuleDrawer
          rule={null}
          initialDraft={ruleDraftFromTransaction(ruleSource)}
          payees={payees}
          accounts={accounts.map(({ id, name }) => ({ id, name }))}
          categories={envelopes}
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
