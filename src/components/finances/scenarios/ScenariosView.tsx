"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  clearScenarioOverrideAction,
  createScenarioAction,
  createScenarioLineAction,
  deleteScenarioAction,
  deleteScenarioLineAction,
  duplicateScenarioAction,
  loadScenarioWorkspaceAction,
  moveScenarioLineAction,
  seedScenarioFromSpendingAction,
  setScenarioOverrideAction,
  updateScenarioAction,
  updateScenarioLineAction,
} from "@/app/finances/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import type { MenuItem } from "@/components/grid/ContextMenu";
import { DataGrid, type RowDrag } from "@/components/grid/DataGrid";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { rowMenuFor } from "@/components/grid/rowMenu";
import type { GridDefaults } from "@/components/grid/useGridState";
import { useModuleViews } from "@/components/grid/useModuleViews";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { useToast } from "@/components/shell/ToastProvider";
import { INSERT_AFTER, INSERT_CHILD } from "@/lib/commands/chords";
import type { GridCommandCapabilities } from "@/lib/grid/commandDeck";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { selectionMoveRoots } from "@/lib/grid/selection";
import { isTypingTarget } from "@/lib/keyboard";
import { budgetEnvelopeLabel } from "@/lib/finances/budget/hierarchy";
import type { BudgetEnvelopeCatalog } from "@/lib/finances/budget/queries";
import { formatUsd } from "@/lib/finances/money";
import { flattenLines, type ScenarioLineNode } from "@/lib/finances/scenarios/compose";
import {
  billRowId,
  incomeRowId,
  lineRowId,
  parseRowId,
  scenarioGridRows,
  sectionMonthlyCents,
  SECTION_IDS,
  type ScenarioGridNode,
} from "@/lib/finances/scenarios/gridRows";
import type { ScenarioWorkspace } from "@/lib/finances/scenarios/workspace";
import { AddFromSuppliesDialog } from "./AddFromSuppliesDialog";
import { ScenarioNameDialog } from "./ScenarioNameDialog";
import {
  SCENARIO_COLUMN_IDS,
  scenarioColumns,
  type ScenariosColumnCtx,
} from "./scenarioColumns";

const SCENARIO_VIEWS = [{ id: "all", label: "All rows" }] as const;

/** Pay period and Year restate Monthly in other units; they are one Show Fields away. */
function viewDefaults(): GridDefaults {
  return {
    order: SCENARIO_COLUMN_IDS.filter((id) => id !== "payPeriod" && id !== "yearly"),
    sorts: [],
  };
}

type Dialog =
  | { type: "new" }
  | { type: "rename" }
  | { type: "duplicate" }
  | { type: "deleteScenario" }
  | { type: "supplies" }
  | { type: "deleteLines"; ids: string[] };

type Result = { ok: true; id?: string } | { ok: false; error: string };

function signed(cents: number): string {
  return formatUsd(cents);
}

/**
 * A planning worksheet for a month that does not exist yet: will income cover the life about
 * to be lived? Regular income and bills arrive live and can be switched off or repriced for
 * this scenario only; lines cover everything else. Nothing here writes the budget.
 */
export function ScenariosView({
  initial,
  catalog,
}: {
  initial: ScenarioWorkspace;
  catalog: BudgetEnvelopeCatalog;
}) {
  const [data, setData] = useState(initial);
  const [seenInitial, setSeenInitial] = useState(initial);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  if (initial !== seenInitial) {
    setSeenInitial(initial);
    setData(initial);
  }

  const scenarioId = data.selectedId;
  const scenarioIdRef = useRef(scenarioId);
  useEffect(() => {
    scenarioIdRef.current = scenarioId;
  }, [scenarioId]);

  const detail = data.detail;
  const composition = detail?.composition ?? null;

  const columns = useMemo(() => scenarioColumns(), []);
  const views = useModuleViews({
    moduleId: "scenarios",
    builtIn: SCENARIO_VIEWS,
    defaultViewId: "all",
    columns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;

  const gridRows = useMemo(
    () => (composition ? scenarioGridRows(composition) : []),
    [composition],
  );
  const lineIndex = useMemo(
    () =>
      new Map<string, ScenarioLineNode>(
        composition
          ? flattenLines([...composition.incomeLines, ...composition.expenseLines]).map(
              (line) => [line.id, line],
            )
          : [],
      ),
    [composition],
  );
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

  /** Re-read the whole workspace, optionally switching scenario. Reports errors inline. */
  const reload = useCallback(async (next?: string | null) => {
    const result = await loadScenarioWorkspaceAction(next ?? scenarioIdRef.current);
    if (result.ok) setData(result.data);
    else setError(result.error);
    return result.ok ? result.data : null;
  }, []);

  /** Every write goes through here: report the message inline, then re-read. */
  const commit = useCallback(
    (work: () => Promise<Result>, after?: (id: string | undefined) => void) => {
      setError(null);
      startTransition(async () => {
        const result = await work();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        await reload();
        after?.(result.id);
      });
    },
    [reload],
  );

  const chooseScenario = useCallback(
    (id: string) => {
      setError(null);
      startTransition(async () => {
        await reload(id);
        selectOne(null);
        window.history.replaceState(null, "", `?scenario=${id}`);
      });
    },
    [reload, selectOne],
  );

  const afterScenarioWrite = useCallback(
    (work: () => Promise<Result>) => {
      setError(null);
      startTransition(async () => {
        const result = await work();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        await reload(result.id ?? undefined);
        if (result.id) window.history.replaceState(null, "", `?scenario=${result.id}`);
        selectOne(null);
      });
    },
    [reload, selectOne],
  );

  const linkOptions = useMemo(
    () => ({
      envelopes: catalog.envelopes
        .filter((envelope) => envelope.kind !== "income")
        .map((envelope) => ({ id: envelope.id, label: envelope.label })),
      groups: catalog.groups
        .filter((group) => group.kind !== "income")
        .map((group) => ({
          id: group.id,
          label: budgetEnvelopeLabel(catalog.groups, {
            groupId: group.parentGroupId,
            name: group.name,
          }),
        })),
    }),
    [catalog],
  );

  const ctx: ScenariosColumnCtx = useMemo(
    () => ({
      pending,
      supplyItemNames: new Map(data.supply.items.map((item) => [item.id, item.name])),
      supplyGroupNames: new Map(
        data.supply.groups.map((group) => [group.id, group.name]),
      ),
      linkOptions,
      onPatchLine: (lineId, edit) =>
        commit(() => updateScenarioLineAction(lineId, edit)),
      onSetOverride: (envelopeId, value) => {
        if (scenarioId) {
          commit(() => setScenarioOverrideAction(scenarioId, envelopeId, value));
        }
      },
    }),
    [pending, data.supply, linkOptions, commit, scenarioId],
  );

  /** The line a grid row id names, or null for a bill, an income or a header. */
  const lineOfRow = useCallback(
    (rowId: string | null): ScenarioLineNode | null => {
      const parsed = rowId ? parseRowId(rowId) : null;
      return parsed?.kind === "line" ? (lineIndex.get(parsed.id) ?? null) : null;
    },
    [lineIndex],
  );

  const nodeOfRow = useCallback(
    (rowId: string): ScenarioGridNode | null => {
      const row = gridRows.find((candidate) => candidate.id === rowId);
      return row?.kind === "node" ? row.node : null;
    },
    [gridRows],
  );

  const addLine = useCallback(
    (anchor: ScenarioLineNode | null, anchorRow: string | null, subLine: boolean) => {
      if (!scenarioId) return;
      const anchorNode = anchorRow ? nodeOfRow(anchorRow) : null;
      const kind =
        anchor?.kind ??
        (anchorNode?.kind === "income" ? ("income" as const) : ("expense" as const));
      commit(
        () =>
          createScenarioLineAction(scenarioId, {
            name: "New line",
            kind,
            ...(subLine && anchor
              ? { parentId: anchor.id }
              : anchor
                ? { parentId: anchor.parentId, afterId: anchor.id }
                : {}),
          }),
        (id) => {
          if (id) selectOne(lineRowId(id));
        },
      );
    },
    [scenarioId, nodeOfRow, commit, selectOne],
  );

  const requestDelete = useCallback(
    (ids: readonly string[]) => {
      const lineIds = ids.flatMap((id) => {
        const parsed = parseRowId(id);
        return parsed?.kind === "line" ? [parsed.id] : [];
      });
      const roots = selectionMoveRoots(
        new Set(lineIds),
        lineIds,
        (id) => lineIndex.get(id)?.parentId ?? null,
      );
      if (roots.length > 0) setDialog({ type: "deleteLines", ids: roots });
    },
    [lineIndex],
  );

  const capabilitiesFor = useCallback(
    (rowId: string | null, count: number): GridCommandCapabilities => {
      const ids =
        count > 1 ? order.filter((id) => selectedIds.has(id)) : rowId ? [rowId] : [];
      const anchor = lineOfRow(rowId);
      const envelopeNodes = ids.flatMap((id) => {
        const node = nodeOfRow(id);
        return node && node.kind !== "line" ? [node] : [];
      });
      const canSwitch = envelopeNodes.length > 0;
      const allOn = envelopeNodes.every((node) => node.row.included);
      const anyOverride = envelopeNodes.some((node) => node.row.overridden);
      const noScenario = scenarioId === null;
      const noScenarioTitle = "Create a scenario first.";
      const setEnvelopes = (included: boolean) => {
        if (!scenarioId) return;
        commit(async () => {
          for (const node of envelopeNodes) {
            const result = await setScenarioOverrideAction(
              scenarioId,
              node.row.envelopeId,
              {
                included,
                monthlyCents: node.row.overrideMonthlyCents,
              },
            );
            if (!result.ok) return result;
          }
          return { ok: true as const };
        });
      };

      return {
        selection: {
          id: rowId,
          count: ids.length,
          label: anchor?.name,
          ids,
        },
        actions: { onDelete: requestDelete, onSelectAll: selectAll },
        pageCommands: [
          {
            id: "grid.create",
            label: "New line",
            group: "record",
            menu: "new",
            section: "New",
            icon: "new",
            toolbar: 10,
            rowMenu: true,
            bindings: INSERT_AFTER,
            disabled: noScenario,
            title: noScenario ? noScenarioTitle : undefined,
            run: () => addLine(anchor, rowId, false),
          },
          {
            id: "scenarios.new-subline",
            label: "New sub-line",
            group: "record",
            menu: "new",
            section: "New",
            icon: "new",
            rowMenu: true,
            bindings: INSERT_CHILD,
            disabled: anchor === null,
            title: anchor === null ? "Select a line to split." : undefined,
            run: () => addLine(anchor, rowId, true),
          },
          {
            id: "scenarios.add-from-supplies",
            label: "Add from Supplies…",
            group: "record",
            menu: "new",
            section: "New",
            icon: "new",
            disabled: noScenario,
            title: noScenario ? noScenarioTitle : undefined,
            run: () => setDialog({ type: "supplies" }),
          },
          {
            id: "scenarios.seed",
            label: "Add lines from last year's spending",
            group: "record",
            menu: "new",
            section: "New",
            icon: "new",
            disabled: noScenario || !detail || detail.uncovered.length === 0,
            title: noScenario
              ? noScenarioTitle
              : !detail || detail.uncovered.length === 0
                ? "Nothing from the last twelve months is left uncovered."
                : undefined,
            run: () => {
              if (!scenarioId) return;
              setError(null);
              startTransition(async () => {
                const result = await seedScenarioFromSpendingAction(scenarioId);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                await reload();
                toast.success(
                  `Added ${result.data ?? 0} line${result.data === 1 ? "" : "s"} from last year's spending.`,
                );
              });
            },
          },
          {
            id: "scenarios.include",
            label: allOn ? "Exclude from scenario" : "Include in scenario",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "convert",
            rowMenu: true,
            disabled: !canSwitch || noScenario,
            title: !canSwitch ? "Select a bill or Regular income row." : undefined,
            run: () => setEnvelopes(!allOn),
          },
          {
            id: "scenarios.clear-override",
            label: "Clear override",
            group: "record",
            menu: "item",
            section: "Item",
            icon: "convert",
            rowMenu: true,
            disabled: !anyOverride || noScenario,
            title: !anyOverride ? "Nothing selected differs from today." : undefined,
            run: () => {
              if (!scenarioId) return;
              commit(async () => {
                for (const node of envelopeNodes) {
                  if (!node.row.overridden) continue;
                  const result = await clearScenarioOverrideAction(
                    scenarioId,
                    node.row.envelopeId,
                  );
                  if (!result.ok) return result;
                }
                return { ok: true as const };
              });
            },
          },
          {
            id: "scenarios.new-scenario",
            label: "New scenario…",
            group: "record",
            menu: "new",
            section: "Scenario",
            icon: "new",
            run: () => setDialog({ type: "new" }),
          },
          {
            id: "scenarios.duplicate",
            label: "Duplicate scenario…",
            group: "record",
            menu: "item",
            section: "Scenario",
            icon: "new",
            disabled: noScenario,
            title: noScenario ? noScenarioTitle : undefined,
            run: () => setDialog({ type: "duplicate" }),
          },
          {
            id: "scenarios.rename",
            label: "Rename scenario…",
            group: "record",
            menu: "item",
            section: "Scenario",
            icon: "convert",
            disabled: noScenario,
            title: noScenario ? noScenarioTitle : undefined,
            run: () => setDialog({ type: "rename" }),
          },
          {
            id: "scenarios.delete",
            label: "Delete scenario…",
            group: "record",
            menu: "item",
            section: "Danger",
            icon: "delete",
            destructive: true,
            disabled: noScenario,
            title: noScenario ? noScenarioTitle : undefined,
            run: () => setDialog({ type: "deleteScenario" }),
          },
        ],
      };
    },
    [
      order,
      selectedIds,
      lineOfRow,
      nodeOfRow,
      scenarioId,
      detail,
      requestDelete,
      selectAll,
      addLine,
      commit,
      reload,
      toast,
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

  /** Drag a line to reorder it or file it under another; bills and income do not move. */
  const rowDrag: RowDrag = useMemo(() => {
    const inside = (candidateId: string, ancestorId: string) => {
      let cursor: string | null = candidateId;
      for (let hops = 0; cursor !== null && hops < 1000; hops++) {
        if (cursor === ancestorId) return true;
        cursor = lineIndex.get(cursor)?.parentId ?? null;
      }
      return false;
    };
    const dragged = (dragIds: readonly string[]) => {
      const lines = dragIds.map((id) => lineOfRow(id));
      return lines.every((line) => line !== null) ? lines : null;
    };
    return {
      resolve: (dragIds, targetId, zone) => {
        const lines = dragged(dragIds);
        const target = lineOfRow(targetId);
        if (!lines || !target || lines.length === 0) return null;
        if (lines.some((line) => line.kind !== target.kind)) return null;
        if (lines.some((line) => inside(target.id, line.id))) return null;
        return { depth: zone === "inside" ? target.depth + 1 : target.depth };
      },
      onDrop: (dragIds, targetId, zone) => {
        const lines = dragged(dragIds);
        const target = lineOfRow(targetId);
        if (!lines || !target) return;
        const ids = lines.map((line) => line.id);
        const roots = selectionMoveRoots(
          new Set(ids),
          ids,
          (id) => lineIndex.get(id)?.parentId ?? null,
        );
        if (roots.length === 0 || roots.some((id) => inside(target.id, id))) return;
        // Any sort would put the line straight back where it came from.
        if (gridState.sorts.length > 0) gridState.clearSort();
        selectOne(lineRowId(roots[0]));
        commit(async () => {
          let previous: string | null = null;
          for (const id of roots) {
            const to: Parameters<typeof moveScenarioLineAction>[1] =
              previous !== null
                ? {
                    parentId: zone === "inside" ? target.id : target.parentId,
                    afterId: previous,
                  }
                : zone === "inside"
                  ? { parentId: target.id }
                  : zone === "before"
                    ? { parentId: target.parentId, beforeId: target.id }
                    : { parentId: target.parentId, afterId: target.id };
            const result = await moveScenarioLineAction(id, to);
            if (!result.ok) return result;
            previous = id;
          }
          return { ok: true as const };
        });
      },
    };
  }, [lineIndex, lineOfRow, gridState, commit, selectOne]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (dialog !== null || isTypingTarget(event.target)) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1, event.shiftKey);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1, event.shiftKey);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dialog, move]);

  const deleteCopy = useMemo(() => {
    if (dialog?.type !== "deleteLines") return null;
    const lines = dialog.ids.flatMap((id) => {
      const line = lineIndex.get(id);
      return line ? [line] : [];
    });
    const subLines = lines.reduce(
      (sum, line) => sum + flattenLines(line.children).length,
      0,
    );
    const title =
      lines.length === 1 ? "Delete this line?" : `Delete ${lines.length} lines?`;
    const message =
      subLines > 0
        ? `${lines.length === 1 ? `"${lines[0].name}"` : `${lines.length} lines`} and ${subLines} sub-line${subLines === 1 ? "" : "s"} under ${lines.length === 1 ? "it" : "them"} will be removed from this scenario.`
        : `${lines.length === 1 ? `"${lines[0].name}"` : `${lines.length} lines`} will be removed from this scenario. Nothing else changes.`;
    return { title, message };
  }, [dialog, lineIndex]);

  const scenarioName = detail?.scenario.name ?? "";

  if (data.summaries.length === 0 || !scenarioId || !detail || !composition) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-surface p-8 text-center">
        <p className="text-[0.9375rem] text-ink-muted">No scenarios yet.</p>
        <p className="max-w-md text-[0.8125rem] text-ink-faint">
          A scenario tests your income against a month you have not lived yet — rent
          becoming a mortgage, a bill ending, a new cost starting.
        </p>
        <button
          type="button"
          disabled={pending}
          className="min-h-tap rounded bg-ink px-4 text-[0.8125rem] text-surface md:min-h-0 md:py-1.5"
          onClick={() => setDialog({ type: "new" })}
        >
          New scenario
        </button>
        {error ? (
          <p className="text-[0.8125rem] text-[var(--chart-spend)]">{error}</p>
        ) : null}
        {dialog?.type === "new" ? (
          <ScenarioNameDialog
            title="New scenario"
            description="It starts as today: live bills and Regular income, no lines."
            initialName="Today"
            confirmLabel="Create"
            onClose={() => setDialog(null)}
            onSubmit={(name) => {
              setDialog(null);
              afterScenarioWrite(() => createScenarioAction(name));
            }}
          />
        ) : null}
      </div>
    );
  }

  const remainderTone =
    composition.remainderCents < 0 ? "text-[var(--chart-spend)]" : "text-ink";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div
        role="tablist"
        aria-label="Scenarios"
        className="flex flex-wrap gap-2 border-b border-rule px-3 py-2"
      >
        {data.summaries.map((summary) => {
          const active = summary.id === scenarioId;
          return (
            <button
              key={summary.id}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={pending}
              title={
                summary.incomplete
                  ? "A Regular income has no expected amount, so income is a floor."
                  : undefined
              }
              className={`flex min-h-tap items-baseline gap-2 rounded border px-3 py-1 text-[0.8125rem] md:min-h-0 ${
                active
                  ? "border-select-edge bg-select text-ink"
                  : "border-rule text-ink-muted hover:bg-surface-raised"
              }`}
              onClick={() => (active ? undefined : chooseScenario(summary.id))}
            >
              <span className="font-medium">{summary.name}</span>
              <span
                className={`tabular text-[0.75rem] ${
                  summary.remainderCents < 0
                    ? "text-[var(--chart-spend)]"
                    : "text-ink-muted"
                }`}
              >
                {summary.incomplete ? "≥ " : ""}
                {signed(summary.remainderCents)}
              </span>
            </button>
          );
        })}
      </div>

      <GridToolbar
        grid={gridState}
        gridLabel="Scenarios"
        allColumns={columns}
        distinctValues={distinctValues}
        counts={counts}
        error={error}
        views={views}
        commandCapabilities={commandCapabilities}
      />

      <DataGrid<ScenariosColumnCtx, ScenarioGridNode>
        rows={gridRows}
        columns={gridState.columns}
        allColumns={columns}
        columnCtx={ctx}
        selectedId={selectedId}
        selectedIds={selectedIds}
        selectAllState={headerState}
        onToggleSelectAll={toggleSelectAll}
        onSelect={select}
        ariaLabel="Scenario worksheet"
        rowMenu={rowMenu}
        rowLabel={(row) =>
          row.node.kind === "line" ? row.node.line.name : row.node.row.name
        }
        gutter="handle"
        rowDrag={rowDrag}
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
        groupTotals={(nodes, header) => {
          // Sections and bill groups subtotal what the grid is showing under them.
          if (
            header.id !== SECTION_IDS.income &&
            header.id !== SECTION_IDS.bills &&
            header.id !== SECTION_IDS.lines &&
            !header.id.startsWith("bills:")
          ) {
            return null;
          }
          return { monthly: formatUsd(sectionMonthlyCents(nodes)) };
        }}
        empty={
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-[0.9375rem] text-ink-muted">
            <p>Nothing in this scenario yet.</p>
          </div>
        }
      />

      <footer className="border-t border-rule bg-surface px-3 py-2 text-[0.8125rem]">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span>
            <span className="text-ink-muted">Income </span>
            <span className="tabular text-ink">
              {formatUsd(composition.incomeCents)}
            </span>
          </span>
          <span>
            <span className="text-ink-muted">Expenses </span>
            <span className="tabular text-ink">
              {formatUsd(composition.expenseCents)}
            </span>
          </span>
          <span>
            <span className="text-ink-muted">Remainder </span>
            <span className={`tabular text-[0.9375rem] font-semibold ${remainderTone}`}>
              {composition.incomplete ? "≥ " : ""}
              {formatUsd(composition.remainderCents)}
            </span>
            <span className="text-ink-faint"> / month</span>
          </span>
        </div>
        {composition.incomplete ? (
          <p className="mt-1 text-[0.75rem] text-ink-muted">
            Income is a floor: {composition.incompleteNames.join(", ")}{" "}
            {composition.incompleteNames.length === 1 ? "has" : "have"} no expected
            amount. Type one in its Monthly cell to count it here.
          </p>
        ) : null}
        <details className="mt-1">
          <summary className="cursor-pointer text-[0.75rem] text-ink-muted">
            Uncovered spending
            {detail.uncovered.length > 0
              ? ` · ${detail.uncovered.length} envelope${detail.uncovered.length === 1 ? "" : "s"}, ${formatUsd(
                  detail.uncovered.reduce((sum, row) => sum + row.monthlyCents, 0),
                )}/mo`
              : " · none"}
          </summary>
          {detail.uncovered.length === 0 ? (
            <p className="mt-1 text-[0.75rem] text-ink-faint">
              {detail.actualMonths === 0
                ? "No completed month of spending to compare against yet."
                : "Everything you spent in the last twelve months is a bill here or linked from a line."}
            </p>
          ) : (
            <ul className="mt-1 divide-y divide-rule rounded border border-rule">
              {detail.uncovered.map((row) => (
                <li
                  key={row.envelopeId}
                  className="flex items-center justify-between gap-3 px-2 py-1"
                >
                  <span className="truncate text-ink">{row.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="tabular text-ink-muted">
                      {formatUsd(row.monthlyCents)}/mo
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      className="rounded border border-rule px-2 py-0.5 text-[0.75rem] text-ink hover:bg-surface-raised"
                      onClick={() =>
                        commit(
                          () =>
                            createScenarioLineAction(scenarioId, {
                              name: row.name,
                              kind: "expense",
                              source: {
                                type: "manual",
                                amountCents: row.monthlyCents,
                                cadence: { unit: "month", n: 1 },
                              },
                              link: { envelopeId: row.envelopeId },
                            }),
                          (id) => {
                            if (id) selectOne(lineRowId(id));
                          },
                        )
                      }
                    >
                      Add line
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </details>
      </footer>

      {dialog?.type === "new" ? (
        <ScenarioNameDialog
          title="New scenario"
          description="It starts as today: live bills and Regular income, no lines."
          initialName="New scenario"
          confirmLabel="Create"
          onClose={() => setDialog(null)}
          onSubmit={(name) => {
            setDialog(null);
            afterScenarioWrite(() => createScenarioAction(name));
          }}
        />
      ) : null}
      {dialog?.type === "rename" ? (
        <ScenarioNameDialog
          title="Rename scenario"
          initialName={scenarioName}
          confirmLabel="Rename"
          onClose={() => setDialog(null)}
          onSubmit={(name) => {
            setDialog(null);
            commit(() => updateScenarioAction(scenarioId, { name }));
          }}
        />
      ) : null}
      {dialog?.type === "duplicate" ? (
        <ScenarioNameDialog
          title="Duplicate scenario"
          description="Copies every line and override. The copy is independent."
          initialName={`${scenarioName} copy`}
          confirmLabel="Duplicate"
          onClose={() => setDialog(null)}
          onSubmit={(name) => {
            setDialog(null);
            afterScenarioWrite(() => duplicateScenarioAction(scenarioId, name));
          }}
        />
      ) : null}
      {dialog?.type === "supplies" ? (
        <AddFromSuppliesDialog
          groups={data.supply.groups}
          items={data.supply.items}
          onClose={() => setDialog(null)}
          onPick={({ name, source }) => {
            setDialog(null);
            commit(
              () =>
                createScenarioLineAction(scenarioId, { name, kind: "expense", source }),
              (id) => {
                if (id) selectOne(lineRowId(id));
              },
            );
          }}
        />
      ) : null}

      <ConfirmDialog
        open={dialog?.type === "deleteScenario"}
        title="Delete this scenario?"
        message={`"${scenarioName}" and its ${detail.lineCount} line${detail.lineCount === 1 ? "" : "s"} will be removed. Your budget, bills and Supplies are not touched.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          afterScenarioWrite(async () => {
            const result = await deleteScenarioAction(scenarioId);
            if (!result.ok) return result;
            // Fall back to the first remaining scenario rather than the one just removed.
            const others = data.summaries.filter(
              (summary) => summary.id !== scenarioId,
            );
            return { ok: true as const, id: others[0]?.id };
          });
        }}
      />
      <ConfirmDialog
        open={dialog?.type === "deleteLines"}
        title={deleteCopy?.title ?? "Delete?"}
        message={deleteCopy?.message ?? ""}
        confirmLabel="Delete"
        destructive
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          const ids = dialog?.type === "deleteLines" ? dialog.ids : [];
          setDialog(null);
          commit(async () => {
            for (const id of ids) {
              const result = await deleteScenarioLineAction(id);
              if (!result.ok) return result;
            }
            return { ok: true as const };
          });
        }}
      />
    </div>
  );
}

// Row id helpers re-exported for the page's tests and for any caller that needs to select a
// bill or income row by its envelope id.
export { billRowId, incomeRowId };
