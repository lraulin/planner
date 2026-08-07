"use client";

import { useCallback, useState, useTransition } from "react";
import {
  createMetricAction,
  getMetricDetailAction,
  listMetricsForOwnerAction,
} from "@/app/metrics/actions";
import { useIsCompact } from "@/components/shell/useIsCompact";
import { metricPriorityText } from "@/lib/metrics/compactRow";
import { formatMetricNumber } from "@/lib/metrics/parse";
import type { MetricDetail, MetricListRow } from "@/lib/metrics/types";
import type { OutlineNode } from "@/lib/tree/types";
import { MetricCompactList } from "./MetricCompactList";
import { MetricDrawer } from "./MetricDrawer";

/**
 * Goal form Metrics tab: list metrics owned by this goal; create associates owner.
 * Same first-class store as the Metrics tab.
 *
 * A plain `<table>` and **not** `DataGrid`, unlike the Metrics tab, which is a grid. This is a
 * handful of rows inside a drawer, scoped to one goal: there is nothing to sort, filter, hide
 * or save a view of, and a grid here would bring a toolbar, a command row and a settings scope
 * for a list that is usually three rows long. The rule it is diverging from is
 * `components/data-grid.md`; the reason is that this is a panel, not a module list.
 *
 * Initial list is loaded when the parent mounts this panel (user opened the Metrics
 * form tab). Reloads run from button handlers, not effects.
 */
export function GoalMetricsPanel({
  goalId,
  goals,
  initialRows = [],
}: {
  goalId: string;
  goals: OutlineNode[];
  initialRows?: MetricListRow[];
}) {
  const compact = useIsCompact();
  const [rows, setRows] = useState<MetricListRow[]>(initialRows);
  const [loaded, setLoaded] = useState(initialRows.length > 0);
  const [drawerDetail, setDrawerDetail] = useState<MetricDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const reload = useCallback(() => {
    startTransition(async () => {
      const result = await listMetricsForOwnerAction(goalId);
      if (!result.ok || !Array.isArray(result.data)) {
        setError(result.ok ? "Could not load metrics." : result.error);
        return;
      }
      setRows(result.data);
      setLoaded(true);
      setError(null);
    });
  }, [goalId]);

  const ensureLoaded = () => {
    if (!loaded) reload();
  };

  const openDrawer = (id: string) => {
    startTransition(async () => {
      const result = await getMetricDetailAction(id);
      if (!result.ok || !result.data || Array.isArray(result.data)) {
        setError(result.ok ? "Metric not found." : result.error);
        return;
      }
      setDrawerDetail(result.data);
    });
  };

  const create = () => {
    startTransition(async () => {
      const result = await createMetricAction({
        title: "New Metric",
        ownerNodeId: goalId,
      });
      if (!result.ok || !result.id) {
        setError(result.ok ? "Create failed." : result.error);
        return;
      }
      const detail = await getMetricDetailAction(result.id);
      if (detail.ok && detail.data && !Array.isArray(detail.data)) {
        setDrawerDetail(detail.data);
      }
      reload();
    });
  };

  const addMetricButton = (
    <button
      type="button"
      onClick={create}
      disabled={busy}
      className="min-h-tap flex-none rounded border border-rule px-3 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised disabled:opacity-50 md:min-h-0 md:px-2"
    >
      + Metric
    </button>
  );

  return (
    <div
      className="flex flex-col gap-3"
      onMouseEnter={ensureLoaded}
      // A phone has no `mouseenter`, so the list would sit unloaded behind the fallback button
      // below until something else fired. `pointerenter` covers the first touch on the panel.
      onPointerEnter={ensureLoaded}
      onFocus={ensureLoaded}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[0.8125rem] text-ink-muted">
          Metrics associated with this goal. They also appear on the Metrics tab.
        </p>
        <div className="flex justify-end">{addMetricButton}</div>
      </div>

      {error && (
        <p className="text-[0.8125rem] text-danger" role="alert">
          {error}
        </p>
      )}

      {!loaded && (
        <button
          type="button"
          onClick={reload}
          className="min-h-tap self-start text-[0.8125rem] text-ink-muted underline md:min-h-0"
        >
          Load metrics
        </button>
      )}

      {compact ? (
        /* The six-column table has a 28rem minimum — inside a drawer on a 390px screen that
           is a scroller inside a scroller. Same card rows as the Metrics tab. */
        <div className="overflow-hidden rounded border border-rule">
          {loaded && rows.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="mb-3 text-[0.8125rem] text-ink-muted">
                No metrics yet. How will you know whether this is working?
              </p>
              <div className="flex justify-center">{addMetricButton}</div>
            </div>
          ) : (
            <MetricCompactList
              groups={[{ key: "all", label: null, rows }]}
              onOpen={openDrawer}
            />
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-rule">
          <table className="w-full min-w-[28rem] text-left text-[0.8125rem]">
            <thead className="bg-surface-raised text-ink-muted">
              <tr>
                <th className="px-2 py-1.5 font-medium">Active</th>
                <th className="px-2 py-1.5 font-medium">Priority</th>
                <th className="px-2 py-1.5 font-medium">Title</th>
                <th className="px-2 py-1.5 font-medium">Category</th>
                <th className="px-2 py-1.5 font-medium">Question</th>
                <th className="px-2 py-1.5 font-medium">Target</th>
              </tr>
            </thead>
            <tbody>
              {loaded && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-6 text-center">
                    <p className="mb-2 text-ink-muted">
                      No metrics yet. How will you know whether this is working?
                    </p>
                    <div className="flex justify-center">{addMetricButton}</div>
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const priority = metricPriorityText(row);
                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-t border-rule hover:bg-surface-raised/60"
                    onClick={() => openDrawer(row.id)}
                  >
                    <td className="px-2 py-1.5 text-center">{row.active ? "✓" : ""}</td>
                    <td className="px-2 py-1.5">{priority}</td>
                    <td className="px-2 py-1.5 font-medium">
                      {row.title || "Untitled"}
                    </td>
                    <td className="px-2 py-1.5 text-ink-muted">{row.category}</td>
                    <td className="max-w-[12rem] truncate px-2 py-1.5 text-ink-muted">
                      {row.question}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">
                      {row.objectiveTarget != null
                        ? formatMetricNumber(row.objectiveTarget)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <MetricDrawer
        detail={drawerDetail}
        goals={goals}
        onClose={() => {
          setDrawerDetail(null);
          reload();
        }}
        onChanged={() => reload()}
      />
    </div>
  );
}
