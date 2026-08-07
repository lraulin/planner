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
import { ContextMenu, type MenuItem } from "@/components/grid/ContextMenu";
import { rowMenuFor } from "@/components/grid/rowMenu";
import { catalogCapabilities } from "@/components/grid/catalogCommands";
import { CommandBar } from "@/components/grid/CommandBar";
import { buildGridCommands } from "@/lib/grid/commandDeck";
import { useRegisterCommands } from "@/components/shell/CommandProvider";
import { OverflowMenu } from "@/components/shell/OverflowMenu";
import { useSetting, type SettingCodec } from "@/components/settings/SettingsProvider";
import { useIsCompact } from "@/components/shell/useIsCompact";
import {
  ErrorBanner,
  TabToolbar,
  ToolbarButton,
  ToolbarToggle,
} from "@/components/tabs/tabChrome";
import { isTypingTarget } from "@/lib/keyboard";
import { metricPriorityText } from "@/lib/metrics/compactRow";
import {
  clampPerformanceHeight,
  COMPACT_PERFORMANCE_HEIGHT,
  DEFAULT_PERFORMANCE_HEIGHT,
  METRICS_LAYOUT_SCOPE,
  parseMetricsLayout,
  serializeMetricsLayout,
  type MetricsLayoutSettings,
} from "@/lib/metrics/layout";
import { formatMetricNumber } from "@/lib/metrics/parse";
import type { MetricDetail, MetricListRow } from "@/lib/metrics/types";
import type { OutlineNode } from "@/lib/tree/types";
import { MetricChart } from "./MetricChart";
import { MetricCompactList } from "./MetricCompactList";
import { MetricDrawer } from "./MetricDrawer";

const LAYOUT_CODEC: SettingCodec<MetricsLayoutSettings> = {
  parse: parseMetricsLayout,
  serialize: serializeMetricsLayout,
};

/**
 * Metrics tab: list of all metrics (standalone or goal-owned), optional group by owner,
 * performance graph for the selection, drawer for create/edit.
 *
 * Keyboard and empty-state chrome match Notes / Outline: Insert (or ⌘Return) creates,
 * Enter opens, arrows move selection, Delete removes, right-click teaches the shortcuts.
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
  const [selectedId, setSelectedId] = useState<string | null>(
    initialMetrics[0]?.id ?? null,
  );
  const [drawerDetail, setDrawerDetail] = useState<MetricDetail | null>(null);
  /** True while create/open is in flight so keyboard shortcuts do not double-fire. */
  const [drawerPending, setDrawerPending] = useState(false);
  const [chartDetail, setChartDetail] = useState<MetricDetail | null>(null);
  const [activeOnly, setActiveOnly] = useState(true);
  const [groupByOwner, setGroupByOwner] = useState(false);
  const [showPerformance, setShowPerformance] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [showObjective, setShowObjective] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [pendingDelete, setPendingDelete] = useState<MetricListRow | null>(null);
  const [menu, setMenu] = useState<{ rowId: string; x: number; y: number } | null>(
    null,
  );

  const { value: layout, patch: patchLayout } = useSetting(
    METRICS_LAYOUT_SCOPE,
    LAYOUT_CODEC,
  );
  const performanceHeight = layout.performanceHeight;

  const setPerformanceHeight = useCallback(
    (height: number) => {
      patchLayout((current) => ({
        ...current,
        performanceHeight: clampPerformanceHeight(height),
      }));
    },
    [patchLayout],
  );

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

  const selectRow = useCallback(
    (id: string) => {
      setSelectedId(id);
      if (showPerformance) loadChart(id);
    },
    [showPerformance, loadChart],
  );

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
      setSelectedId(id);
      setChartDetail(result.data);
    });
  }, []);

  const visible = useMemo(() => {
    let list = rows;
    if (activeOnly) list = list.filter((r) => r.active);
    return list;
  }, [rows, activeOnly]);

  // Fall back to the first visible row when the selection is filtered out (e.g. Active only).
  const selected = visible.find((r) => r.id === selectedId) ?? visible[0] ?? null;

  const grouped = useMemo(() => {
    if (!groupByOwner) {
      return [{ key: "", label: null as string | null, rows: visible }];
    }
    const map = new Map<string, MetricListRow[]>();
    for (const row of visible) {
      const key = row.ownerNodeId ?? "";
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .sort((a, b) => {
        const an = a[1][0]?.ownerName ?? "None";
        const bn = b[1][0]?.ownerName ?? "None";
        if (a[0] === "") return -1;
        if (b[0] === "") return 1;
        return an.localeCompare(bn);
      })
      .map(([key, groupRows]) => ({
        key,
        label: key === "" ? "None" : (groupRows[0]?.ownerName ?? "Unknown"),
        rows: groupRows,
      }));
  }, [visible, groupByOwner]);

  // Taken from `grouped`, which is what both the table and the compact list render. `visible`
  // is the pre-grouping order, and Group by Owner reorders: the ownerless group is hoisted to
  // the front and the rest go alphabetically by owner, while `sortKey` interleaves them. Arrow
  // keys walking that order jump somewhere other than the next row down.
  const navigableIds = useMemo(
    () => grouped.flatMap((group) => group.rows.map((row) => row.id)),
    [grouped],
  );

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
        setSelectedId(result.id);
        setChartDetail(detail.data);
      }
      refreshList();
    });
  }, [refreshList]);

  const moveSelection = useCallback(
    (delta: number) => {
      if (navigableIds.length === 0) return;
      const current = selected?.id ?? null;
      const index = current ? navigableIds.indexOf(current) : -1;
      const next =
        index < 0
          ? delta > 0
            ? navigableIds[0]
            : navigableIds[navigableIds.length - 1]
          : navigableIds[Math.max(0, Math.min(navigableIds.length - 1, index + delta))];
      if (next) selectRow(next);
    },
    [navigableIds, selected?.id, selectRow],
  );

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
   * builder, plus its own view switches as page commands.
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
    () => capabilitiesFor(selected?.id ?? null, selected ? 1 : 0),
    [capabilitiesFor, selected],
  );
  const commands = useMemo(
    () => buildGridCommands(commandCapabilities),
    [commandCapabilities],
  );
  useRegisterCommands(commands);

  const rowMenu = useCallback(
    // `null` is the blank area below the rows — the same menu with nothing selected.
    (metricId: string | null): MenuItem[] =>
      rowMenuFor(capabilitiesFor(metricId, metricId ? 1 : 0)),
    [capabilitiesFor],
  );

  // Same document-level keys as Notes / Outline. Apple keyboards have no Insert, so
  // ⌘Return is bound alongside it (see outline HintBar).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (drawerDetail || drawerPending || pendingDelete || menu) return;
      if (isTypingTarget(event.target)) return;

      if (!selected) return;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          moveSelection(1);
          break;
        case "ArrowUp":
          event.preventDefault();
          moveSelection(-1);
          break;
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerDetail, drawerPending, pendingDelete, menu, selected, moveSelection]);

  const chartSource =
    chartDetail && selected && chartDetail.id === selected.id ? chartDetail : null;

  const emptyFiltered = rows.length > 0 && visible.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        The switches stay on the lens row — they change *what is listed*. New / Open / Delete moved
        into the command row's menus and icon buttons, which is also how they reached `⌘K` and `⋯`
        for the first time.
      */}
      <TabToolbar
        commandRow={
          <CommandBar commands={commands} selection={commandCapabilities.selection} />
        }
        pinned={<OverflowMenu label="More commands for metrics" />}
      >
        <ToolbarToggle
          checked={activeOnly}
          onChange={() => setActiveOnly((v) => !v)}
          label="Active only"
        />
        <ToolbarToggle
          checked={groupByOwner}
          onChange={() => setGroupByOwner((v) => !v)}
          label="Group by Owner"
        />
        <ToolbarToggle
          checked={showPerformance}
          onChange={() => {
            setShowPerformance((v) => {
              const next = !v;
              if (next && selected) loadChart(selected.id);
              return next;
            });
          }}
          label="Show Performance"
        />
      </TabToolbar>

      {error && <ErrorBanner message={error} />}

      <div className="min-h-0 flex-1 overflow-auto">
        {visible.length === 0 ? (
          <EmptyState
            filtered={emptyFiltered}
            onCreate={createNew}
            onShowInactive={() => setActiveOnly(false)}
            busy={busy}
          />
        ) : compact ? (
          /*
            Not the table at a smaller size — the table's own minimum is 48rem, which on a
            390px screen is a sideways-scrolling wall (`responsive.md`). Tap opens the metric,
            which also makes it the selection the performance pane graphs; long press is the
            right-click menu, and on a phone the only route to New and Delete.
          */
          <MetricCompactList
            groups={grouped}
            selectedId={selected?.id ?? null}
            onOpen={openDrawer}
            onRowMenu={(rowId, x, y) => {
              if (selectedId !== rowId) selectRow(rowId);
              setMenu({ rowId, x, y });
            }}
          />
        ) : (
          <table className="w-full min-w-[48rem] border-collapse text-left text-[0.8125rem]">
            <thead className="sticky top-0 z-10 bg-surface-raised text-ink-muted">
              <tr className="border-b border-rule">
                <th className="w-10 px-2 py-1.5 font-medium">Active</th>
                <th className="w-14 px-2 py-1.5 font-medium">Priority</th>
                <th className="px-2 py-1.5 font-medium">Title</th>
                <th className="px-2 py-1.5 font-medium">Category</th>
                <th className="px-2 py-1.5 font-medium">Question</th>
                <th className="w-20 px-2 py-1.5 font-medium">Target</th>
                <th className="w-24 px-2 py-1.5 font-medium">Last Value</th>
                <th className="w-24 px-2 py-1.5 font-medium">Last Date</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((group) => (
                <GroupRows
                  key={group.key || "all"}
                  label={group.label}
                  rows={group.rows}
                  selectedId={selected?.id ?? null}
                  onSelect={selectRow}
                  onOpen={openDrawer}
                  onContextMenu={(rowId, x, y) => {
                    if (selectedId !== rowId) selectRow(rowId);
                    setMenu({ rowId, x, y });
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

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
                onChange={() => setShowLegend((v) => !v)}
                label="Show Legend"
              />
              <ToolbarToggle
                checked={showObjective}
                onChange={() => setShowObjective((v) => !v)}
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

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={rowMenu(menu.rowId)}
          onClose={() => setMenu(null)}
        />
      )}

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
            if (selectedId === target.id) setSelectedId(null);
            if (drawerDetail?.id === target.id) setDrawerDetail(null);
            if (chartDetail?.id === target.id) setChartDetail(null);
            refreshList();
          });
        }}
        onCancel={() => setPendingDelete(null)}
      />

      <MetricsHintBar />
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
  function beginResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;

    function onMove(move: PointerEvent) {
      // Dragging the handle upward grows the pane below.
      onResize(startHeight + (startY - move.clientY));
    }
    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  return (
    <button
      type="button"
      aria-label="Resize performance graph"
      title="Drag to resize performance graph, double-click to reset"
      onPointerDown={beginResize}
      onDoubleClick={onReset}
      className="group relative z-10 flex h-2 flex-none cursor-row-resize items-center justify-center border-0 bg-transparent p-0"
    >
      <span className="h-0.5 w-10 rounded-full bg-rule transition-colors group-hover:bg-rule-strong group-active:bg-select-edge" />
    </button>
  );
}

function EmptyState({
  filtered,
  onCreate,
  onShowInactive,
  busy,
}: {
  /** True when metrics exist but Active only (or similar) hides them all. */
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
            No active metrics. Turn off Active only to see inactive ones, or create a
            new metric.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <ToolbarButton onClick={onShowInactive}>Show inactive</ToolbarButton>
            <ToolbarButton onClick={onCreate} disabled={busy} title="Insert">
              New Metric
            </ToolbarButton>
          </div>
        </>
      ) : (
        <>
          <p className="max-w-sm text-[0.9375rem] text-ink-muted">
            No metrics yet. Create one here, or add metrics on a goal form.
          </p>
          <ToolbarButton onClick={onCreate} disabled={busy} title="Insert">
            New Metric
          </ToolbarButton>
        </>
      )}
    </div>
  );
}

function MetricsHintBar() {
  const hints: { keys: string[]; label: string }[] = [
    { keys: ["Insert", "⌘Return"], label: "add" },
    { keys: ["Enter"], label: "open" },
    { keys: ["↑", "↓"], label: "move selection" },
    { keys: ["Delete"], label: "delete" },
    { keys: ["Right-click"], label: "row menu" },
  ];
  return (
    <footer className="hidden flex-none flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule bg-surface-raised px-3 py-1.5 text-[0.6875rem] text-ink-muted md:flex">
      {hints.map((hint) => (
        <span key={hint.label} className="flex items-center gap-1">
          {hint.keys.map((key, index) => (
            <span key={key} className="flex items-center gap-1">
              {index > 0 && <span className="text-ink-faint">/</span>}
              <kbd className="tabular rounded border border-rule-strong bg-surface px-1 py-px text-[0.625rem] text-ink">
                {key}
              </kbd>
            </span>
          ))}
          <span>{hint.label}</span>
        </span>
      ))}
    </footer>
  );
}

function GroupRows({
  label,
  rows,
  selectedId,
  onSelect,
  onOpen,
  onContextMenu,
}: {
  label: string | null;
  rows: MetricListRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
}) {
  return (
    <>
      {label != null && (
        <tr className="bg-surface-raised/80">
          <td
            colSpan={8}
            className="px-2 py-1 text-[0.75rem] font-medium text-ink-muted"
          >
            Owner: {label} ({rows.length} {rows.length === 1 ? "item" : "items"})
          </td>
        </tr>
      )}
      {rows.map((row) => {
        const selected = row.id === selectedId;
        const priority = metricPriorityText(row);
        return (
          <tr
            key={row.id}
            className={`cursor-pointer border-b border-rule ${
              selected
                ? "bg-[color-mix(in_srgb,var(--select-edge)_18%,transparent)]"
                : "hover:bg-surface-raised/60"
            }`}
            onClick={() => onSelect(row.id)}
            onDoubleClick={() => onOpen(row.id)}
            onContextMenu={(event) => {
              if ((event.target as HTMLElement).closest("input, select, textarea")) {
                return;
              }
              if (event.ctrlKey || event.metaKey) return;
              event.preventDefault();
              onContextMenu(row.id, event.clientX, event.clientY);
            }}
          >
            <td className="px-2 py-1 text-center">{row.active ? "✓" : ""}</td>
            <td className="px-2 py-1 tabular-nums">{priority}</td>
            <td className="px-2 py-1 font-medium text-ink">
              <button
                type="button"
                className="text-left hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(row.id);
                }}
              >
                {row.title || "Untitled"}
              </button>
            </td>
            <td className="px-2 py-1 text-ink-muted">{row.category}</td>
            <td className="max-w-[14rem] truncate px-2 py-1 text-ink-muted">
              {row.question}
            </td>
            <td className="px-2 py-1 tabular-nums">
              {row.objectiveTarget != null
                ? formatMetricNumber(row.objectiveTarget)
                : "None"}
            </td>
            <td className="px-2 py-1 tabular-nums">
              {row.lastValue != null ? formatMetricNumber(row.lastValue) : "—"}
            </td>
            <td className="px-2 py-1 tabular-nums text-ink-muted">
              {row.lastDate ?? "—"}
            </td>
          </tr>
        );
      })}
    </>
  );
}
