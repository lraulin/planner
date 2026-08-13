"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  createMetricAction,
  deleteMetricAction,
  getMetricDetailAction,
  listMetricsAction,
} from "@/app/metrics/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { DataGrid } from "@/components/grid/DataGrid";
import type { MenuItem } from "@/components/grid/ContextMenu";
import { rowMenuFor } from "@/components/grid/rowMenu";
import { catalogCapabilities } from "@/components/grid/catalogCommands";
import { formatBindings } from "@/lib/commands/bindings";
import { INSERT_AFTER } from "@/lib/commands/chords";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { collectDistinctValues } from "@/lib/grid/distinct";
import type { GridDefaults } from "@/components/grid/useGridState";
import { useModuleViews } from "@/components/grid/useModuleViews";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { useSetting, type SettingCodec } from "@/components/settings/SettingsProvider";
import { useIsCompact } from "@/components/shell/useIsCompact";
import { ToolbarButton, ToolbarToggle } from "@/components/tabs/tabChrome";
import { isTypingTarget } from "@/lib/keyboard";
import type { GridRow } from "@/lib/tree/slice";
import {
  clampPerformanceHeight,
  COMPACT_PERFORMANCE_HEIGHT,
  DEFAULT_PERFORMANCE_HEIGHT,
  METRICS_LAYOUT_SCOPE,
  parseMetricsLayout,
  serializeMetricsLayout,
  type MetricsLayoutSettings,
} from "@/lib/metrics/layout";
import type { MetricDetail, MetricListRow } from "@/lib/metrics/types";
import type { OutlineNode } from "@/lib/tree/types";
import { MetricChart } from "./MetricChart";
import { MetricDrawer } from "./MetricDrawer";
import {
  metricsColumns,
  METRICS_COLUMN_IDS,
  type MetricsColumnCtx,
} from "./metricsColumns";

const LAYOUT_CODEC: SettingCodec<MetricsLayoutSettings> = {
  parse: parseMetricsLayout,
  serialize: serializeMetricsLayout,
};

/**
 * The empty state's buttons are the only place in Metrics that names a key, and it named `Insert`
 * — hand-typed, and a key this keyboard does not have. `catalogCapabilities` binds the create
 * command, so ask the binding what it is rather than restating it.
 */
const CREATE_CHORD = formatBindings(INSERT_AFTER);

/**
 * One built-in view. Metrics is a single list by nature; what views add is somewhere to keep
 * "the ones I am actually tracking this quarter" as a named filter set.
 */
const METRICS_VIEWS = [{ id: "metrics", label: "All Metrics" }] as const;

function viewDefaults(): GridDefaults {
  return { order: [...METRICS_COLUMN_IDS] };
}

/**
 * Metrics tab: the list of all metrics (standalone or goal-owned), an optional performance
 * graph for the selection, and the drawer for create/edit.
 *
 * The list is `DataGrid`, like every other module list. It used to be a hand-written
 * `<table>` with eight fixed `<th>`s, which cost Metrics — and only Metrics — click-to-sort,
 * per-column filters, Show Fields, saved views and persisted column widths. Compact rows,
 * the row menu and the command row come with the grid too.
 *
 * The three lens switches stay in `METRICS_LAYOUT_SCOPE` and are passed through the toolbar's
 * `left` slot rather than becoming `GridToolbar` switches. They already have values stored
 * per user, and `GridToolbar`'s switches live in the grid's own settings scope — adopting
 * them would silently reset everyone's Active only / Group by Owner / Show Performance to the
 * defaults. The pane's own Show Legend / Show Objective sit in that same scope, so keeping all
 * six together is also the more coherent split.
 */
export function MetricsView({
  initialMetrics,
  goals,
}: {
  initialMetrics: MetricListRow[];
  goals: OutlineNode[];
}) {
  const router = useRouter();
  const compact = useIsCompact();
  const [rows, setRows] = useState(initialMetrics);
  const [drawerDetail, setDrawerDetail] = useState<MetricDetail | null>(null);
  /** True while create/open is in flight so keyboard shortcuts do not double-fire. */
  const [drawerPending, setDrawerPending] = useState(false);
  const [chartDetail, setChartDetail] = useState<MetricDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [pendingDelete, setPendingDelete] = useState<MetricListRow | null>(null);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });

  const { value: layout, patch: patchLayout } = useSetting(
    METRICS_LAYOUT_SCOPE,
    LAYOUT_CODEC,
  );
  const {
    performanceHeight,
    activeOnly,
    groupByOwner,
    showPerformance,
    showLegend,
    showObjective,
  } = layout;

  const setPerformanceHeight = useCallback(
    (height: number) => {
      patchLayout((current) => ({
        ...current,
        performanceHeight: clampPerformanceHeight(height),
      }));
    },
    [patchLayout],
  );

  /** Flip one switch. `patch` takes a recipe so the other keys in the scope survive. */
  const toggle = useCallback(
    (
      key: keyof MetricsLayoutSettings &
        (
          | "activeOnly"
          | "groupByOwner"
          | "showPerformance"
          | "showLegend"
          | "showObjective"
        ),
    ) => patchLayout((current) => ({ ...current, [key]: !current[key] })),
    [patchLayout],
  );

  const views = useModuleViews({
    moduleId: "metrics",
    builtIn: METRICS_VIEWS,
    defaultViewId: "metrics",
    columns: metricsColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;

  const refreshList = useCallback(() => {
    startTransition(async () => {
      const result = await listMetricsAction();
      if (!result.ok || !Array.isArray(result.data)) {
        setError(result.ok ? "Could not reload metrics." : result.error);
        return;
      }
      setRows(result.data);
      router.refresh();
    });
  }, [router]);

  const loadChart = useCallback((metricId: string) => {
    startTransition(async () => {
      const result = await getMetricDetailAction(metricId);
      if (result.ok && result.data && !Array.isArray(result.data)) {
        setChartDetail(result.data);
      }
    });
  }, []);

  const openDrawer = useCallback((id: string) => {
    setDrawerPending(true);
    startTransition(async () => {
      const result = await getMetricDetailAction(id);
      setDrawerPending(false);
      if (!result.ok || !result.data || Array.isArray(result.data)) {
        setError(result.ok ? "Metric not found." : result.error);
        return;
      }
      setDrawerDetail(result.data);
      setChartDetail(result.data);
    });
  }, []);

  /**
   * Active only narrows the row set before the grid sees it, rather than becoming a filter on
   * the Active column: it is a lens the user leaves on for weeks, and a column filter would
   * show up as a removable chip that fights with the switch.
   */
  const visible = useMemo(
    () => (activeOnly ? rows.filter((row) => row.active) : rows),
    [rows, activeOnly],
  );

  const gridRows: GridRow<MetricListRow>[] = useMemo(() => {
    if (!groupByOwner) {
      return visible.map((row) => ({
        kind: "node" as const,
        id: row.id,
        node: row,
        depth: 0,
      }));
    }

    // Ownerless first, then owners alphabetically — the order the hand-written table used.
    const byOwner = new Map<string, MetricListRow[]>();
    for (const row of visible) {
      const key = row.ownerNodeId ?? "";
      const list = byOwner.get(key) ?? [];
      list.push(row);
      byOwner.set(key, list);
    }
    const groups = Array.from(byOwner.entries()).sort((a, b) => {
      if (a[0] === "") return -1;
      if (b[0] === "") return 1;
      return (a[1][0]?.ownerName ?? "").localeCompare(b[1][0]?.ownerName ?? "");
    });

    return groups.flatMap(([key, groupRows]): GridRow<MetricListRow>[] => [
      {
        kind: "group",
        id: `group:${key}`,
        label: `Owner: ${key === "" ? "None" : (groupRows[0]?.ownerName ?? "Unknown")}`,
        count: groupRows.length,
        depth: 0,
        collapsed: false,
      },
      ...groupRows.map((row) => ({
        kind: "node" as const,
        id: row.id,
        node: row,
        depth: 0,
      })),
    ]);
  }, [visible, groupByOwner]);

  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        metricsColumns,
        gridRows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [gridRows],
  );

  const rowIds = useMemo(
    () => gridRows.flatMap((row) => (row.kind === "node" ? [row.id] : [])),
    [gridRows],
  );
  const { order, onIdsChange } = useNavigableIds(rowIds);
  const multi = useMultiSelect(order, initialMetrics[0]?.id ?? null);
  const { selectedId, selectedIds, select, move } = multi;

  const selected = selectedId
    ? (rows.find((row) => row.id === selectedId) ?? null)
    : null;

  /**
   * The graph follows the selection. An effect rather than a call inside each handler because
   * the selection moves from a click, an arrow key, a filter that prunes the old row, and a
   * delete — `useMultiSelect` owns the last two, so no click handler can see them.
   */
  useEffect(() => {
    if (!showPerformance || !selectedId) return;
    if (chartDetail?.id === selectedId) return;
    loadChart(selectedId);
  }, [showPerformance, selectedId, chartDetail?.id, loadChart]);

  const createNew = useCallback(() => {
    setDrawerPending(true);
    startTransition(async () => {
      const result = await createMetricAction({ title: "New Metric" });
      if (!result.ok || !result.id) {
        setDrawerPending(false);
        setError(result.ok ? "Create failed." : result.error);
        return;
      }
      const detail = await getMetricDetailAction(result.id);
      setDrawerPending(false);
      if (detail.ok && detail.data && !Array.isArray(detail.data)) {
        setDrawerDetail(detail.data);
        setChartDetail(detail.data);
      }
      refreshList();
    });
  }, [refreshList]);

  const requestDelete = useCallback(
    (id: string) => {
      const row = rows.find((entry) => entry.id === id);
      if (row) setPendingDelete(row);
    },
    [rows],
  );

  /**
   * Metrics had **no** `⋯` and no palette entries at all — its commands existed as two toolbar
   * buttons and a hand-written row menu, which is `navigation.md`'s "no command is palette-only"
   * broken rather than merely unpolished. Same three verbs as the other catalogs, so the same
   * builder.
   */
  const capabilitiesFor = useCallback(
    (rowId: string | null, count: number) =>
      catalogCapabilities({
        createLabel: "New metric",
        openLabel: "Open metric",
        selection: {
          id: rowId,
          count,
          label: rows.find((entry) => entry.id === rowId)?.title,
        },
        onCreate: createNew,
        onOpen: openDrawer,
        onDelete: requestDelete,
      }),
    [rows, createNew, openDrawer, requestDelete],
  );

  const commandCapabilities = useMemo(
    () => capabilitiesFor(selectedId, selectedIds.size),
    [capabilitiesFor, selectedId, selectedIds.size],
  );

  const rowMenu = useCallback(
    // `null` is the blank area below the rows — the same menu with nothing selected.
    (metricId: string | null): MenuItem[] => {
      const count =
        metricId && selectedIds.has(metricId) ? selectedIds.size : metricId ? 1 : 0;
      return rowMenuFor(capabilitiesFor(metricId, count));
    },
    [selectedIds, capabilitiesFor],
  );

  const columnCtx: MetricsColumnCtx = useMemo(
    () => ({ onOpen: openDrawer }),
    [openDrawer],
  );

  // Arrow keys walk the grid's own order. Same document-level handler as the Wish List.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (drawerDetail || drawerPending || pendingDelete) return;
      if (isTypingTarget(event.target)) return;
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
  }, [drawerDetail, drawerPending, pendingDelete, move]);

  const chartSource =
    chartDetail && selected && chartDetail.id === selected.id ? chartDetail : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Metrics"
        allColumns={metricsColumns}
        distinctValues={distinctValues}
        counts={counts}
        error={error}
        views={views}
        left={
          <>
            <ToolbarToggle
              checked={activeOnly}
              onChange={() => toggle("activeOnly")}
              label="Active only"
            />
            <ToolbarToggle
              checked={groupByOwner}
              onChange={() => toggle("groupByOwner")}
              label="Group by Owner"
            />
            <ToolbarToggle
              checked={showPerformance}
              onChange={() => toggle("showPerformance")}
              label="Show Performance"
            />
          </>
        }
        commandCapabilities={commandCapabilities}
      />

      <DataGrid<MetricsColumnCtx, MetricListRow>
        rows={gridRows}
        columns={gridState.columns}
        allColumns={metricsColumns}
        columnCtx={columnCtx}
        selectedId={selectedId}
        selectedIds={selectedIds}
        onSelect={select}
        onOpenDetail={openDrawer}
        ariaLabel="Metrics"
        rowMenu={rowMenu}
        rowNumbers
        rowLabel={(row) => row.node.title || "Untitled"}
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
          <EmptyState
            filtered={rows.length > 0}
            onCreate={createNew}
            onShowInactive={() =>
              patchLayout((current) => ({ ...current, activeOnly: false }))
            }
            busy={busy}
          />
        }
      />

      {showPerformance && selected && (
        <>
          {/*
            Drag is mouse-shaped (`responsive.md`), so below `md` the handle is gone and the
            pane takes a fixed compact height instead. Growing the graph on a phone means
            hiding the list it belongs to, which is what the Show Performance switch already
            does — one control rather than a gesture with no touch equivalent.
          */}
          {!compact && (
            <PerformanceResizeHandle
              height={performanceHeight}
              onResize={setPerformanceHeight}
              onReset={() => setPerformanceHeight(DEFAULT_PERFORMANCE_HEIGHT)}
            />
          )}
          <div
            className="flex flex-none flex-col overflow-hidden border-t border-rule bg-surface"
            style={{ height: compact ? COMPACT_PERFORMANCE_HEIGHT : performanceHeight }}
          >
            <div className="flex flex-none flex-wrap items-center gap-x-4 px-3 pt-1 md:pt-2">
              <ToolbarToggle
                checked={showLegend}
                onChange={() => toggle("showLegend")}
                label="Show Legend"
              />
              <ToolbarToggle
                checked={showObjective}
                onChange={() => toggle("showObjective")}
                label="Show Objective"
              />
              {!chartSource && (
                <button
                  type="button"
                  className="min-h-tap text-[0.8125rem] text-ink-muted underline md:min-h-0"
                  onClick={() => loadChart(selected.id)}
                >
                  Load graph
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 p-3 pt-1 md:pt-2">
              <MetricChart
                title={chartSource?.title ?? selected.title}
                question={chartSource?.question ?? selected.question}
                units={chartSource?.units ?? selected.units}
                entries={chartSource?.entries ?? []}
                objectiveTarget={
                  chartSource?.objectiveTarget ?? selected.objectiveTarget
                }
                metricType={chartSource?.metricType ?? selected.metricType}
                showLegend={showLegend}
                showObjective={showObjective}
                compact={compact}
              />
            </div>
          </div>
        </>
      )}

      <MetricDrawer
        detail={drawerDetail}
        goals={goals}
        onClose={() => setDrawerDetail(null)}
        onChanged={(metricId) => {
          refreshList();
          loadChart(metricId);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this metric?"
        message={
          pendingDelete
            ? `"${pendingDelete.title || "Untitled"}" and all tracking values will be removed. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (!target) return;
          startTransition(async () => {
            const result = await deleteMetricAction(target.id);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            if (drawerDetail?.id === target.id) setDrawerDetail(null);
            if (chartDetail?.id === target.id) setChartDetail(null);
            refreshList();
          });
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

/**
 * Horizontal split handle between the metrics list and the performance pane.
 * Drag up to grow the graph; double-click resets to the default height.
 * Same idea as column resize in DataGrid (pointermove on document).
 */
function PerformanceResizeHandle({
  height,
  onResize,
  onReset,
}: {
  height: number;
  onResize: (height: number) => void;
  onReset: () => void;
}) {
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;

    const onMove = (move: PointerEvent) => {
      onResize(startHeight - (move.clientY - startY));
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize performance pane"
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      className="h-1.5 flex-none cursor-row-resize border-t border-rule bg-surface-raised hover:bg-select-edge/40"
    />
  );
}

function EmptyState({
  filtered,
  onCreate,
  onShowInactive,
  busy,
}: {
  /** True when metrics exist but Active only (or a column filter) hides them all. */
  filtered: boolean;
  onCreate: () => void;
  onShowInactive: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      {filtered ? (
        <>
          <p className="text-[0.9375rem] text-ink-muted">
            No metrics match this view. Turn off Active only to see inactive ones, or
            create a new metric.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <ToolbarButton onClick={onShowInactive}>Show inactive</ToolbarButton>
            <ToolbarButton onClick={onCreate} disabled={busy} title={CREATE_CHORD}>
              New Metric
            </ToolbarButton>
          </div>
        </>
      ) : (
        <>
          <p className="max-w-sm text-[0.9375rem] text-ink-muted">
            No metrics yet. Create one here, or add metrics on a goal form.
          </p>
          <ToolbarButton onClick={onCreate} disabled={busy} title={CREATE_CHORD}>
            New Metric
          </ToolbarButton>
        </>
      )}
    </div>
  );
}
