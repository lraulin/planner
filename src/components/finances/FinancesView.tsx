"use client";

import {
  useCallback,
  useEffect,
  useId,
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
import { monthLabel } from "@/lib/finances/budget/envelope";
import {
  activityEmptyCopy,
  activityViewFilters,
  parseActivityRegisterParams,
} from "@/lib/finances/registerActivity";
import {
  isThisMonthDateFilter,
  THIS_MONTH_DATE_FILTER,
} from "@/lib/finances/registerFields";
import {
  parseRegisterQuery,
  type RegisterPrepared,
  type RegisterTransactionRow,
} from "@/lib/finances/registerQuery";
import {
  deleteTransactionsAction,
  getTransactionAction,
  listAccountsAction,
  setTransactionBudgetCategoriesAction,
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
import {
  catalogCapabilities,
  catalogTargetIds,
} from "@/components/grid/catalogCommands";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { useModuleViews } from "@/components/grid/useModuleViews";
import type { GridDefaults } from "@/components/grid/useGridState";
import { optionsFilter } from "@/lib/grid/customFilter";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { idsForFieldEdit } from "@/lib/grid/selection";
import { isTypingTarget } from "@/lib/keyboard";
import { useRegisterSource } from "./useRegisterSource";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import { FinanceImportPanel } from "./FinanceImportPanel";
import { CategorySelect } from "./CategorySelect";
import { TransactionDrawer } from "./TransactionDrawer";
import { ModalShell } from "@/components/detail/ModalShell";
import { TrackAsBillDialog } from "./TrackAsBillDialog";
import { NewEnvelopeDialog } from "./NewEnvelopeDialog";
import type {
  EnvelopeCatalog,
  EnvelopePickerOption,
} from "@/lib/finances/budget/groupEnvelopeOptions";
import type { EnvelopeKind } from "@/db/schema";
import {
  FINANCE_COLUMN_IDS,
  financeColumns,
  type FinanceColumnCtx,
} from "./financeColumns";

const FINANCE_VIEW_CORE = [
  { id: "all", label: "All Transactions" },
  { id: "uncategorized", label: "Uncategorized" },
] as const;

function viewDefaults(
  viewId: string,
  extras: {
    envelopeName: string | null;
    month: string | null;
  },
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
        : viewId === "activity" && extras.envelopeName && extras.month
          ? activityViewFilters(extras.envelopeName, extras.month)
          : { date: THIS_MONTH_DATE_FILTER },
  };
}

function transactionRowLabel(row: { node: RegisterTransactionRow }): string {
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
/** Stable identity: the split editor resets its draft when this prop changes. */
const EMPTY_SPLIT_CHILDREN: TransactionListRow[] = [];

export function FinancesView({
  initialPrepared,
  initialAccounts,
  initialClaimed,
  catalog,
  initialUpcoming = [],
  payees: _payees,
  todayKey,
  defaultCollapsedGroups,
}: {
  initialPrepared: RegisterPrepared;
  initialAccounts: FinanceAccountRow[];
  initialClaimed: readonly ClaimedPayee[];
  /** Budget groups and envelopes, in budget order. Empty until a budget exists. */
  catalog: EnvelopeCatalog;
  /** Unposted schedule occurrences. Not transactions; never mixed into `rows`. */
  initialUpcoming?: UpcomingBillRow[];
  payees: readonly { id: string; name: string }[];
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
  const [pendingDelete, setPendingDelete] = useState<RegisterTransactionRow[]>([]);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const categoryPickerTitleId = useId();
  const [upcoming, setUpcoming] = useState(initialUpcoming);
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
  const router = useRouter();
  const pathname = usePathname();
  // Activity deep-links live on the client so the Register page does not
  // subscribe to searchParams — that subscription reloaded every transaction
  // whenever the drawer wrote `?detail=`.
  const searchParams = useSearchParams();
  const activityView = useMemo(
    () =>
      parseActivityRegisterParams({
        category: searchParams.get("category"),
        month: searchParams.get("month"),
      }),
    [searchParams],
  );
  const activityActive =
    searchParams.get("view") === "activity" && activityView !== null;
  const activityEnvelopeName = activityView
    ? (catalog.envelopes.find((envelope) => envelope.id === activityView.categoryId)
        ?.name ?? "Activity")
    : null;

  if (initialPrepared !== seenPrepared || initialClaimed !== seenClaimed) {
    setSeenPrepared(initialPrepared);
    setSeenClaimed(initialClaimed);
    setAccounts(initialAccounts);
    setClaimed(initialClaimed);
  }

  const collapsedYears = defaultCollapsedGroups;
  const financeViews = useMemo(
    () =>
      activityActive && activityView && activityEnvelopeName
        ? [
            ...FINANCE_VIEW_CORE,
            {
              id: "activity",
              label: `${activityEnvelopeName} · ${monthLabel(activityView.month)}`,
            },
          ]
        : [...FINANCE_VIEW_CORE],
    [activityActive, activityEnvelopeName, activityView],
  );
  const defaultsFor = useCallback(
    (viewId: string) =>
      viewDefaults(
        viewId,
        {
          envelopeName: activityEnvelopeName,
          month: activityView?.month ?? null,
        },
        collapsedYears,
      ),
    [activityEnvelopeName, activityView, collapsedYears],
  );
  const views = useModuleViews({
    moduleId: "finances",
    builtIn: financeViews,
    defaultViewId: "all",
    columns: financeColumns,
    defaultsFor,
  });
  const gridState = views.grid;
  useEffect(() => {
    if (views.base === "uncategorized" || views.base === "activity") {
      gridState.clearViewState();
    }
    // Deep links are task entry points: they must open on their exact row set rather than
    // inheriting an unrelated Register search from the previous visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deep-link mount reset
  }, []);
  useEffect(() => {
    if (views.base !== "all") return;
    if (isThisMonthDateFilter(gridState.filters.date)) return;
    gridState.setFilter("date", THIS_MONTH_DATE_FILTER);
    // Entering All Transactions reseeds Date. Skip when This Month is already
    // in force (including the view default) so we do not materialise a blob and
    // show Unsaved changes. Changing the band during the visit still works
    // because this effect does not re-run while base stays "all".
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reseed on enter, not on setFilter identity
  }, [views.base]);
  useEffect(() => {
    // Activity is URL-only. A valid activity URL must keep its params; leftover
    // category/month on any other view must not become the next Register visit.
    if (activityActive) return;
    const leftoverView = searchParams.get("view") === "activity";
    if (!searchParams.get("category") && !searchParams.get("month") && !leftoverView) {
      return;
    }
    const next = new URLSearchParams(searchParams.toString());
    next.delete("category");
    next.delete("month");
    if (leftoverView) next.delete("view");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [activityActive, searchParams, pathname, router]);
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
        category: activityView?.categoryId ?? null,
        month: activityView ? searchParams.get("month") : null,
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
      activityView,
      searchParams,
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
    expandedSplitIds,
    toggleSplit,
    refreshSplitChildren,
    childrenByParent,
  } = register;
  const { order, onIdsChange } = useNavigableIds(index.nodeIds);
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

  // Envelopes minted from New {type}… are folded in locally so the picker can show one
  // before the server component reloads. They land at type root — see the spec.
  const envelopeCatalog = useMemo((): EnvelopeCatalog => {
    const known = new Set(catalog.envelopes.map((envelope) => envelope.id));
    return {
      groups: catalog.groups,
      envelopes: [
        ...catalog.envelopes,
        ...createdEnvelopes.filter((envelope) => !known.has(envelope.id)),
      ],
    };
  }, [catalog, createdEnvelopes]);
  const envelopeNameById = useMemo(
    () =>
      new Map(
        envelopeCatalog.envelopes.map((envelope) => [envelope.id, envelope.name]),
      ),
    [envelopeCatalog],
  );

  const claimedByPayee = useMemo(() => claimedPayeeMap(claimed), [claimed]);

  const onSetEnvelope = useCallback(
    (transactionId: string, categoryId: string | null) => {
      const ids = idsForFieldEdit(transactionId, selectedIds, order);
      const name = categoryId ? (envelopeNameById.get(categoryId) ?? null) : null;
      setError(null);
      for (const id of ids) {
        patchRow(id, {
          budgetCategoryId: categoryId,
          budgetCategoryName: name,
        });
      }
      startTransition(async () => {
        const result = await setTransactionBudgetCategoriesAction(ids, categoryId);
        if (!result.ok) {
          setError(result.error ?? "Could not set the envelope.");
          refresh();
          return;
        }
        const { updated, skipped } = result.data ?? {
          updated: ids,
          skipped: [],
        };
        if (skipped.length > 0) {
          setError(
            updated.length === 0
              ? (skipped[0]?.reason ?? "Could not set the envelope.")
              : `Category set on ${updated.length} of ${ids.length} selected transactions.`,
          );
          if (updated.length === 0) refresh();
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
    [envelopeNameById, refresh, patchRow, reload, registerQuery, selectedIds, order],
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

  const columnCtx = useMemo(
    () => ({
      catalog: envelopeCatalog,
      offBudgetAccountIds,
      onSetEnvelope,
      onCreateEnvelope,
      expandedSplitIds,
      onToggleSplit: toggleSplit,
    }),
    [
      envelopeCatalog,
      offBudgetAccountIds,
      onSetEnvelope,
      onCreateEnvelope,
      expandedSplitIds,
      toggleSplit,
    ],
  );

  useEffect(() => {
    if (!openId || rowById(openId)) return;
    void getTransactionAction(openId).then((result) => {
      if (result.ok && result.data) putRow(result.data);
    });
  }, [openId, rowById, putRow]);

  // The drawer's split editor is handed its children rather than fetching them itself
  // (the `set-state-in-effect` rule, and the parent stays the source of truth).
  useEffect(() => {
    if (!openId) return;
    const row = rowById(openId);
    if (!row || row.splitChildCount === 0 || childrenByParent.has(openId)) return;
    void refreshSplitChildren(openId);
  }, [openId, rowById, childrenByParent, refreshSplitChildren]);

  const openDrawer = useCallback((id: string) => setOpenId(id), [setOpenId]);
  const closeDrawer = useCallback(() => {
    // Do not refresh here. The Register is every transaction the user has; reloading
    // it on close is a multi-second freeze, and a successful edit already called
    // `onChanged`. Deleting the open row refreshes explicitly below.
    setOpenId(null);
  }, [setOpenId]);

  const requestDelete = useCallback(
    (ids: readonly string[]) => {
      const rows = ids
        .map((id) => rowById(id))
        .filter((row): row is RegisterTransactionRow => Boolean(row));
      if (rows.length > 0) setPendingDelete(rows);
    },
    [rowById],
  );

  const confirmDelete = useCallback(() => {
    const targets = pendingDelete;
    setPendingDelete([]);
    if (targets.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteTransactionsAction(targets.map((row) => row.id));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (openId && targets.some((row) => row.id === openId)) closeDrawer();
      refresh();
    });
  }, [pendingDelete, openId, closeDrawer, refresh]);

  const capabilitiesFor = useCallback(
    (rowId: string | null, count: number) => {
      const row = rowId ? (rowById(rowId) ?? undefined) : undefined;
      const cannotTrack =
        rowId === null ? "Select a row first" : trackAsBillRefusal(row, claimedByPayee);
      const cannotSplit =
        rowId === null
          ? "Select a row first"
          : row?.parentId
            ? "A split part cannot itself be split."
            : row?.transferGroupId
              ? "A transfer cannot be split."
              : null;
      return catalogCapabilities({
        // A transaction is not typed in, it arrives from the bank — so the catalog's
        // "make a new one" verb is the import, not a blank row.
        createLabel: "Import transactions…",
        openLabel: "Open transaction",
        selection: {
          id: rowId,
          count,
          label: row?.description,
          ids: catalogTargetIds(rowId, count, selectedIds, order),
        },
        onCreate: openImport,
        onOpen: openDrawer,
        onDelete: requestDelete,
        onSelectAll: selectAll,
        pageCommands: [
          {
            id: "record.set-category",
            label: "Set category…",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "convert",
            rowMenu: true,
            keywords: "envelope categorize file",
            disabled: count === 0,
            title: count === 0 ? "Select a row first" : undefined,
            run: () => setCategoryPickerOpen(true),
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
          {
            // A command without a menu entry is not shipped (`components/data-grid`).
            // The editor itself lives in the drawer, so this opens it there.
            id: "record.split",
            label: row?.splitChildCount ? "Edit the split…" : "Split…",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "convert",
            rowMenu: true,
            keywords: "split divide parts share itemize",
            disabled: Boolean(cannotSplit),
            title: cannotSplit ?? undefined,
            run: () => {
              if (rowId && !cannotSplit) openDrawer(rowId);
            },
          },
        ],
      });
    },
    [
      rowById,
      claimedByPayee,
      openImport,
      openDrawer,
      requestDelete,
      selectedIds,
      order,
      selectAll,
    ],
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
      if (openId || pendingDelete.length > 0 || isTypingTarget(event.target)) return;
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

      <DataGrid<FinanceColumnCtx, RegisterTransactionRow>
        rows={isClient ? gridRows : []}
        columns={gridState.columns}
        allColumns={financeColumns}
        columnCtx={columnCtx}
        selectedId={selectedId}
        selectedIds={selectedIds}
        selectAllState={headerState}
        onToggleSelectAll={toggleSelectAll}
        onSelect={select}
        onOpenDetail={openDrawer}
        ariaLabel="Transactions"
        rowMenu={rowMenu}
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
          ) : views.base === "activity" && activityEnvelopeName && activityView ? (
            <p className="p-8 text-center text-[0.9375rem] text-ink-muted">
              {activityEmptyCopy(activityEnvelopeName, activityView.month)}
            </p>
          ) : counts.total === 0 ? (
            <div className="mx-auto w-full max-w-2xl p-6">
              <p className="mb-4 text-center text-[0.9375rem] text-ink-muted">
                No transactions yet. Import a CSV export from your bank to get started.
              </p>
              <div className="rounded border border-rule">
                <FinanceImportPanel />
              </div>
            </div>
          ) : (
            <p className="p-8 text-center text-[0.9375rem] text-ink-muted">
              No transactions match the current filters.
            </p>
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
              {
                id,
                label: name,
                name,
                kind: newEnvelope.kind,
                groupId: null,
                sortKey: name,
                hidden: false,
              },
            ]);
            setNewEnvelope(null);
            onSetEnvelope(transactionId, id);
          }}
        />
      )}
      <TransactionDrawer
        transactionId={openId}
        row={openId ? rowById(openId) : null}
        catalog={envelopeCatalog}
        offBudgetAccountIds={offBudgetAccountIds}
        onClose={closeDrawer}
        onChanged={patchRow}
        onCreateEnvelope={onCreateEnvelope}
        splitChildren={(openId && childrenByParent.get(openId)) || EMPTY_SPLIT_CHILDREN}
        onSplitChanged={() => {
          // The parent's child count and imbalance live in the index, and the expanded
          // children in their own map — a structural change has to refresh both.
          if (openId) void refreshSplitChildren(openId);
          void reload();
        }}
      />
      {categoryPickerOpen ? (
        <ModalShell
          open
          onClose={() => setCategoryPickerOpen(false)}
          labelledBy={categoryPickerTitleId}
        >
          <div className="p-5">
            <h2
              id={categoryPickerTitleId}
              className="text-[0.9375rem] font-semibold text-ink"
            >
              Set category
            </h2>
            <p className="mt-1 text-[0.8125rem] text-ink-muted">
              Applies to {selectedIds.size} selected transaction
              {selectedIds.size === 1 ? "" : "s"}.
            </p>
            <div className="mt-4">
              <CategorySelect
                catalog={envelopeCatalog}
                value={null}
                ariaLabel="Category"
                onChange={(categoryId) => {
                  const id = selectedId;
                  setCategoryPickerOpen(false);
                  if (id) onSetEnvelope(id, categoryId);
                }}
                onCreate={(kind) => {
                  const id = selectedId;
                  setCategoryPickerOpen(false);
                  if (id) onCreateEnvelope(id, kind);
                }}
                className="min-h-tap w-full rounded border border-rule bg-surface px-2 text-base text-ink md:text-[0.8125rem]"
              />
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setCategoryPickerOpen(false)}
                className="min-h-tap rounded border border-rule px-3 text-[0.8125rem] text-ink-muted hover:bg-surface-raised hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
      <ConfirmDialog
        open={pendingDelete.length > 0}
        title={
          pendingDelete.length > 1
            ? `Delete ${pendingDelete.length} transactions?`
            : "Delete this transaction?"
        }
        message={
          pendingDelete.length > 1
            ? `${pendingDelete.length} transactions will be removed. They will come back the next time you import a file that contains them.`
            : `"${pendingDelete[0]?.description ?? ""}" will be removed. It will come back the next time you import a file that contains it.`
        }
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete([])}
      />
    </div>
  );
}
