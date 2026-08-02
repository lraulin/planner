"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createMetricAction,
  getMetricDetailAction,
  listMetricsAction,
} from "@/app/metrics/actions";
import {
  ErrorBanner,
  TabToolbar,
  ToolbarButton,
  ToolbarToggle,
} from "@/components/tabs/tabChrome";
import { formatMetricNumber } from "@/lib/metrics/parse";
import type { MetricDetail, MetricListRow } from "@/lib/metrics/types";
import type { OutlineNode } from "@/lib/tree/types";
import { MetricChart } from "./MetricChart";
import { MetricDrawer } from "./MetricDrawer";

/**
 * Metrics tab: list of all metrics (standalone or goal-owned), optional group by owner,
 * performance graph for the selection, drawer for create/edit.
 */
export function MetricsView({
  initialMetrics,
  goals,
}: {
  initialMetrics: MetricListRow[];
  goals: OutlineNode[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialMetrics);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialMetrics[0]?.id ?? null,
  );
  const [drawerDetail, setDrawerDetail] = useState<MetricDetail | null>(null);
  const [chartDetail, setChartDetail] = useState<MetricDetail | null>(null);
  const [activeOnly, setActiveOnly] = useState(true);
  const [groupByOwner, setGroupByOwner] = useState(false);
  const [showPerformance, setShowPerformance] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [showObjective, setShowObjective] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

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

  const selectRow = (id: string) => {
    setSelectedId(id);
    if (showPerformance) loadChart(id);
  };

  const openDrawer = (id: string) => {
    startTransition(async () => {
      const result = await getMetricDetailAction(id);
      if (!result.ok || !result.data || Array.isArray(result.data)) {
        setError(result.ok ? "Metric not found." : result.error);
        return;
      }
      setDrawerDetail(result.data);
      setSelectedId(id);
      setChartDetail(result.data);
    });
  };

  const visible = useMemo(() => {
    let list = rows;
    if (activeOnly) list = list.filter((r) => r.active);
    return list;
  }, [rows, activeOnly]);

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

  const createNew = () => {
    startTransition(async () => {
      const result = await createMetricAction({ title: "New Metric" });
      if (!result.ok || !result.id) {
        setError(result.ok ? "Create failed." : result.error);
        return;
      }
      const detail = await getMetricDetailAction(result.id);
      if (detail.ok && detail.data && !Array.isArray(detail.data)) {
        setDrawerDetail(detail.data);
        setSelectedId(result.id);
        setChartDetail(detail.data);
      }
      refreshList();
    });
  };

  const chartSource =
    chartDetail && selected && chartDetail.id === selected.id ? chartDetail : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TabToolbar>
        <ToolbarButton onClick={createNew} disabled={busy}>
          New Metric
        </ToolbarButton>
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
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-ink-muted">
                  No metrics yet. Create one here, or add metrics on a goal form.
                </td>
              </tr>
            )}
            {grouped.map((group) => (
              <GroupRows
                key={group.key || "all"}
                label={group.label}
                rows={group.rows}
                selectedId={selected?.id ?? null}
                onSelect={selectRow}
                onOpen={openDrawer}
              />
            ))}
          </tbody>
        </table>
      </div>

      {showPerformance && selected && (
        <div className="flex-none border-t border-rule p-3">
          <div className="mb-2 flex flex-wrap gap-4">
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
                className="text-[0.8125rem] text-ink-muted underline"
                onClick={() => loadChart(selected.id)}
              >
                Load graph
              </button>
            )}
          </div>
          <MetricChart
            title={chartSource?.title ?? selected.title}
            question={chartSource?.question ?? selected.question}
            units={chartSource?.units ?? selected.units}
            entries={chartSource?.entries ?? []}
            objectiveTarget={chartSource?.objectiveTarget ?? selected.objectiveTarget}
            showLegend={showLegend}
            showObjective={showObjective}
          />
        </div>
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
    </div>
  );
}

function GroupRows({
  label,
  rows,
  selectedId,
  onSelect,
  onOpen,
}: {
  label: string | null;
  rows: MetricListRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <>
      {label != null && (
        <tr className="bg-surface-raised/80">
          <td
            colSpan={7}
            className="px-2 py-1 text-[0.75rem] font-medium text-ink-muted"
          >
            Owner: {label} ({rows.length} {rows.length === 1 ? "item" : "items"})
          </td>
        </tr>
      )}
      {rows.map((row) => {
        const selected = row.id === selectedId;
        const priority =
          row.priorityLetter == null
            ? ""
            : row.priorityRank != null
              ? `${row.priorityLetter}${row.priorityRank}`
              : row.priorityLetter;
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
          </tr>
        );
      })}
    </>
  );
}
