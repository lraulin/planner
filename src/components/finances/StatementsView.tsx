"use client";

import { useEffect, useMemo, useState } from "react";
import type { GridRow } from "@/lib/tree/slice";
import { formatUsd } from "@/lib/finances/money";
import { reconcileAccounts } from "@/lib/finances/reconcile";
import {
  STATEMENT_GROUP_BY_VALUES,
  groupStatements,
} from "@/lib/finances/statementGrouping";
import type {
  StatementListRow,
  StatementViewRow,
  TransactionListRow,
} from "@/lib/finances/types";
import { DateText } from "@/components/date/DateText";
import { DataGrid } from "@/components/grid/DataGrid";
import { FileImportHost } from "@/components/import/FileImportHost";
import { FinanceImportPanel } from "./FinanceImportPanel";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { useModuleViews } from "@/components/grid/useModuleViews";
import type { GridDefaults } from "@/components/grid/useGridState";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { isTypingTarget } from "@/lib/keyboard";
import { statementColumns, type StatementColumnCtx } from "./statementColumns";

const STATEMENT_VIEWS = [{ id: "all", label: "All Statements" }] as const;

function viewDefaults(): GridDefaults {
  return {
    order: [...statementColumns.map((column) => column.id)],
    sorts: [{ columnId: "periodEnd", direction: "desc" }],
    groupBy: ["account", "year"],
  };
}

function toViewRows(
  statements: readonly StatementListRow[],
  transactions: readonly TransactionListRow[],
): { rows: StatementViewRow[]; holes: ReturnType<typeof reconcileAccounts>["holes"] } {
  const report = reconcileAccounts(statements, transactions);
  const byId = new Map(report.statements.map((row) => [row.statementId, row]));
  return {
    rows: statements.map((statement) => {
      const check = byId.get(statement.id);
      return {
        ...statement,
        registerSumCents: check?.registerSumCents ?? 0,
        registerDeltaCents: check?.registerDeltaCents ?? 0,
        rowCount: check?.rowCount ?? 0,
      };
    }),
    holes: report.holes,
  };
}

export function StatementsView({
  initialStatements,
  initialTransactions,
}: {
  initialStatements: StatementListRow[];
  initialTransactions: TransactionListRow[];
}) {
  const [statements, setStatements] = useState(initialStatements);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [seenStatements, setSeenStatements] = useState(initialStatements);
  const [seenTransactions, setSeenTransactions] = useState(initialTransactions);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [groupIds, setGroupIds] = useState<readonly string[]>([]);

  if (initialStatements !== seenStatements) {
    setSeenStatements(initialStatements);
    setStatements(initialStatements);
  }
  if (initialTransactions !== seenTransactions) {
    setSeenTransactions(initialTransactions);
    setTransactions(initialTransactions);
  }

  const { rows, holes } = useMemo(
    () => toViewRows(statements, transactions),
    [statements, transactions],
  );

  const views = useModuleViews({
    moduleId: "finance-statements",
    builtIn: STATEMENT_VIEWS,
    defaultViewId: "all",
    columns: statementColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;

  const gridRows: GridRow<StatementViewRow>[] = useMemo(
    () => groupStatements(rows, gridState.groupBy),
    [rows, gridState.groupBy],
  );
  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        statementColumns,
        gridRows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [gridRows],
  );
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const { order, onIdsChange } = useNavigableIds(rowIds);
  const { selectedId, selectedIds, select, move } = useMultiSelect(order, null);

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

  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const periodRows = useMemo(() => {
    if (!selected) return [];
    return transactions
      .filter(
        (row) =>
          row.accountId === selected.accountId &&
          row.transactionDate >= selected.periodStart &&
          row.transactionDate <= selected.periodEnd,
      )
      .sort((left, right) => right.transactionDate.localeCompare(left.transactionDate));
  }, [selected, transactions]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      {holes.length > 0 ? (
        <div className="border-b border-rule bg-surface-raised px-3 py-2 text-[0.8125rem] text-priority-a">
          {holes.map((hole) => (
            <p key={`${hole.accountId}:${hole.afterPeriodEnd}`}>
              {hole.accountName}: no statement after{" "}
              <DateText dateKey={hole.afterPeriodEnd} className="inline" /> until{" "}
              <DateText dateKey={hole.beforePeriodStart} className="inline" />. Official
              close moved {formatUsd(hole.discontinuityCents)}.
            </p>
          ))}
        </div>
      ) : null}

      <GridToolbar
        grid={gridState}
        gridLabel="Statements"
        allColumns={statementColumns}
        distinctValues={distinctValues}
        counts={counts}
        views={views}
        groupDimensions={STATEMENT_GROUP_BY_VALUES}
        groupIds={groupIds}
      />

      <DataGrid<StatementColumnCtx, StatementViewRow>
        rows={gridRows}
        columns={gridState.columns}
        allColumns={statementColumns}
        columnCtx={{}}
        selectedId={selectedId}
        selectedIds={selectedIds}
        onSelect={select}
        ariaLabel="Statements"
        rowNumbers
        rowLabel={(row) =>
          `${row.node.accountName} ${row.node.periodStart}–${row.node.periodEnd}`
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
        onGroupIdsChange={setGroupIds}
        density={gridState.density}
        empty={
          <p className="mx-auto max-w-lg p-6 text-center text-[0.9375rem] text-ink-muted">
            No statements yet. Import monthly PDFs from File → Import transactions…
          </p>
        }
      />

      {selected ? (
        <div className="max-h-[40%] min-h-[10rem] overflow-auto border-t border-rule bg-surface-raised px-3 py-2">
          <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[0.8125rem]">
            <span className="font-medium text-ink">{selected.accountName}</span>
            <span className="text-ink-muted">
              <DateText dateKey={selected.periodStart} className="inline" /> –{" "}
              <DateText dateKey={selected.periodEnd} className="inline" />
            </span>
            <span>
              Opening {formatUsd(selected.openingBalanceCents)} · register{" "}
              {formatUsd(selected.registerSumCents)} · closing{" "}
              {formatUsd(selected.closingBalanceCents)}
            </span>
            <span
              className={
                selected.registerDeltaCents === 0 ? "text-ink-muted" : "text-priority-a"
              }
            >
              Delta {formatUsd(selected.registerDeltaCents)}
            </span>
          </div>
          <table className="w-full text-left text-[0.8125rem]">
            <thead className="text-ink-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">Date</th>
                <th className="py-1 pr-3 font-medium">Description</th>
                <th className="py-1 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {periodRows.map((row) => (
                <tr key={row.id} className="border-t border-rule">
                  <td className="py-1 pr-3">
                    <DateText dateKey={row.transactionDate} />
                  </td>
                  <td className="max-w-0 truncate py-1 pr-3" title={row.description}>
                    {row.description}
                  </td>
                  <td
                    className={`py-1 text-right tabular ${
                      row.amountCents < 0 ? "text-priority-a" : "text-ink"
                    }`}
                  >
                    {formatUsd(row.amountCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {periodRows.length === 0 ? (
            <p className="py-2 text-ink-muted">No imported rows in this period.</p>
          ) : null}
        </div>
      ) : null}

      <FileImportHost
        commandId="import.finance"
        label="Import transactions…"
        keywords="csv statement bank card chase capital one pdf"
        title="Import transactions"
      >
        <FinanceImportPanel embedded />
      </FileImportHost>
    </div>
  );
}
