"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GridRow } from "@/lib/tree/slice";
import type { TimeChartListRow } from "@/lib/schedule/queries";
import {
  createTimeChartAction,
  deleteTimeChartAction,
  updateTimeChartAction,
} from "@/app/schedule/actions";
import { DataGrid } from "@/components/grid/DataGrid";
import type { MenuItem } from "@/components/grid/ContextMenu";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { collectDistinctValues } from "@/lib/grid/distinct";
import type { GridDefaults } from "@/components/grid/useGridState";
import { useModuleViews } from "@/components/grid/useModuleViews";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { isTypingTarget } from "@/lib/keyboard";
import { ToolbarButton } from "@/components/tabs/tabChrome";
import {
  timeChartsColumns,
  TIME_CHARTS_COLUMN_IDS,
  type TimeChartsColumnCtx,
} from "./timeChartsColumns";

/**
 * One built-in view. A person has three or four time charts, so what this list gains from
 * views is not slicing — it is a place to keep a column layout that survives a reload.
 */
const TIME_CHARTS_VIEWS = [{ id: "all", label: "All Time Charts" }] as const;

function viewDefaults(): GridDefaults {
  return { order: [...TIME_CHARTS_COLUMN_IDS] };
}

/**
 * Time Charts module — Achieve's `Go -> Time Charts`.
 *
 * The charts themselves have been editable since the weekly-schedule slice; what was
 * missing was a way to reach one without going through the Weekly Schedule's picker, and
 * anywhere at all to see a chart's description. Opening a row hands off to the existing
 * full-page area editor.
 */
export function TimeChartsView({
  initialCharts,
}: {
  initialCharts: TimeChartListRow[];
}) {
  const router = useRouter();
  const [patches, setPatches] = useState<Record<string, Partial<TimeChartListRow>>>({});
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TimeChartListRow | null>(null);
  const [busy, startTransition] = useTransition();

  const views = useModuleViews({
    moduleId: "time-charts",
    builtIn: TIME_CHARTS_VIEWS,
    defaultViewId: "all",
    columns: timeChartsColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;

  const rows = useMemo(
    () =>
      initialCharts.map((row) =>
        patches[row.id] ? { ...row, ...patches[row.id] } : row,
      ),
    [initialCharts, patches],
  );

  const gridRows: GridRow<TimeChartListRow>[] = useMemo(
    () => rows.map((row) => ({ kind: "node", id: row.id, node: row, depth: 0 })),
    [rows],
  );

  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        timeChartsColumns,
        gridRows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [gridRows],
  );

  const orderedIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const multi = useMultiSelect(orderedIds, null);
  const { selectedId, selectedIds, select, move } = multi;
  const selected = selectedId
    ? (rows.find((row) => row.id === selectedId) ?? null)
    : null;

  const apply = useCallback(
    (action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
      setError(null);
      startTransition(async () => {
        const result = await action();
        if (!result.ok) setError(result.error);
        // Server props refresh on success; drop the optimistic layer either way.
        setPatches({});
      });
    },
    [],
  );

  const patchRow = useCallback((id: string, changes: Partial<TimeChartListRow>) => {
    setPatches((current) => ({ ...current, [id]: { ...current[id], ...changes } }));
  }, []);

  const openEditor = useCallback(
    (chartId: string) => {
      router.push(
        `/schedule/time-chart/${chartId}?returnTo=${encodeURIComponent("/time-charts")}`,
      );
    },
    [router],
  );

  const createNew = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await createTimeChartAction("New Time Chart");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.id) openEditor(result.id);
    });
  }, [openEditor]);

  const confirmDelete = useCallback(() => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    apply(() => deleteTimeChartAction(target.id));
  }, [pendingDelete, apply]);

  const columnCtx: TimeChartsColumnCtx = useMemo(
    () => ({
      onNameChange: (row, name) => {
        patchRow(row.id, { name });
        apply(() => updateTimeChartAction(row.id, { name }));
      },
      onDescriptionChange: (row, description) => {
        patchRow(row.id, { description });
        apply(() => updateTimeChartAction(row.id, { description }));
      },
    }),
    [patchRow, apply],
  );

  const rowMenu = useCallback(
    (chartId: string): MenuItem[] => {
      const row = rows.find((r) => r.id === chartId);
      if (!row) return [];
      return [
        { label: "Edit areas", shortcut: "Enter", onSelect: () => openEditor(chartId) },
        { label: "New Time Chart", shortcut: "Insert", onSelect: createNew },
        "separator",
        {
          label: "Delete",
          shortcut: "Delete",
          destructive: true,
          onSelect: () => setPendingDelete(row),
        },
      ];
    },
    [rows, openEditor, createNew],
  );

  // Same document-level keys as Metrics / Notes / Outline. Apple keyboards have no Insert,
  // so ⌘Return is bound alongside it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (pendingDelete) return;
      if (isTypingTarget(event.target)) return;

      const insert = event.key === "Insert" || (event.key === "Enter" && event.metaKey);
      if (insert && !event.shiftKey && !event.ctrlKey) {
        event.preventDefault();
        createNew();
        return;
      }

      // Arrows come before the "needs a selection" guard on purpose: `moveSelection` treats
      // a null focus as "start at the end you are heading towards", so ArrowDown is how you
      // pick the first row. Guarding it first leaves the keyboard with no way in — every
      // visible cell here is an inline input that stops propagation, so clicking a row does
      // not select it either.
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1, event.shiftKey);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1, event.shiftKey);
        return;
      }

      if (!selected) return;

      switch (event.key) {
        case "Enter":
          if (event.metaKey || event.ctrlKey) return;
          event.preventDefault();
          openEditor(selected.id);
          break;
        case "Delete":
        case "Backspace":
          event.preventDefault();
          setPendingDelete(selected);
          break;
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pendingDelete, selected, createNew, openEditor, move]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Time Charts"
        allColumns={timeChartsColumns}
        distinctValues={distinctValues}
        counts={counts}
        error={error}
        views={views}
        right={
          <>
            <ToolbarButton onClick={createNew} disabled={busy} title="Insert">
              New Time Chart
            </ToolbarButton>
            <ToolbarButton
              onClick={() => selected && openEditor(selected.id)}
              disabled={!selected}
              title="Enter"
            >
              Edit areas
            </ToolbarButton>
          </>
        }
      />

      <DataGrid<TimeChartsColumnCtx, TimeChartListRow>
        rows={gridRows}
        columns={gridState.columns}
        allColumns={timeChartsColumns}
        columnCtx={columnCtx}
        selectedId={selectedId}
        selectedIds={selectedIds}
        onSelect={select}
        onOpenDetail={openEditor}
        ariaLabel="Time Charts"
        rowMenu={rowMenu}
        rowNumbers
        rowLabel={(row) => row.node.name || "Untitled time chart"}
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
        widths={gridState.widths}
        onResizeColumn={gridState.setWidth}
        onResetColumnWidth={gridState.clearWidth}
        columnControls={gridState.columnControls}
        collapsedGroups={gridState.collapsedGroups}
        onToggleGroup={gridState.toggleGroup}
        density={gridState.density}
        empty={
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-[0.9375rem] text-ink-muted">
            <p>No time charts yet.</p>
            <p className="text-[0.8125rem] text-ink-faint">
              A time chart paints your intended week behind the schedule — sleep, work
              blocks, the gym.
            </p>
          </div>
        }
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this time chart?"
        message={`"${pendingDelete?.name || "Untitled"}" and its ${
          pendingDelete?.areaCount ?? 0
        } area(s) will be removed. Appointments are not affected.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
