"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  listFinanceActivityAction,
  loadFinanceActivityEventAction,
} from "@/app/finances/actions";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { useGridState } from "@/components/grid/useGridState";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { collectDistinctValues } from "@/lib/grid/distinct";
import type { GridRow } from "@/lib/tree/slice";
import type {
  FinanceAuditEvent,
  FinanceAuditEventSummary,
} from "@/lib/finances/audit/types";
import { ActivityDrawer } from "./ActivityDrawer";
import {
  ACTIVITY_COLUMN_IDS,
  activityColumns,
  type ActivityColumnCtx,
} from "./activityColumns";

const DEFAULTS = {
  order: [...ACTIVITY_COLUMN_IDS],
  sorts: [{ columnId: "time", direction: "desc" as const }],
};

export function ActivityView({
  initialEvents,
  initialEvent,
}: {
  initialEvents: FinanceAuditEventSummary[];
  initialEvent: FinanceAuditEvent | null;
}) {
  const router = useRouter();
  const [refreshedEvents, setRefreshedEvents] = useState<
    FinanceAuditEventSummary[] | null
  >(null);
  const events = refreshedEvents ?? initialEvents;
  const [event, setEvent] = useState(initialEvent);
  const [openId, setOpenId] = useState(initialEvent?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [loading, startTransition] = useTransition();
  const grid = useGridState("finance-activity", activityColumns, DEFAULTS);
  const gridRows: Extract<GridRow<FinanceAuditEventSummary>, { kind: "node" }>[] =
    useMemo(
      () => events.map((node) => ({ kind: "node", id: node.id, node, depth: 0 })),
      [events],
    );
  const distinctValues = useMemo(
    () => collectDistinctValues(activityColumns, gridRows),
    [gridRows],
  );
  const fallbackIds = useMemo(() => events.map((row) => row.id), [events]);
  const { order, onIdsChange } = useNavigableIds(fallbackIds);
  const { selectedId, selectedIds, select, headerState, toggleSelectAll } =
    useMultiSelect(order, openId);

  const open = useCallback(
    (id: string) => {
      setOpenId(id);
      setEvent(null);
      setError(null);
      router.replace(`/finances/activity?event=${encodeURIComponent(id)}`);
      startTransition(async () => {
        const result = await loadFinanceActivityEventAction(id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (!result.data) {
          setError("That Activity entry no longer exists.");
          return;
        }
        setEvent(result.data);
      });
    },
    [router],
  );

  const close = useCallback(() => {
    setOpenId(null);
    setEvent(null);
    setError(null);
    router.replace("/finances/activity");
  }, [router]);

  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await listFinanceActivityAction();
      if (result.ok) setRefreshedEvents(result.data);
      else setError(result.error);
    });
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={grid}
        gridLabel="Finance Activity"
        allColumns={activityColumns}
        distinctValues={distinctValues}
        counts={counts}
        error={openId ? null : error}
        right={
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="min-h-tap rounded border border-rule px-2 text-[0.8125rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
          >
            Refresh
          </button>
        }
      />
      <DataGrid<ActivityColumnCtx, FinanceAuditEventSummary>
        rows={gridRows}
        columns={grid.columns}
        allColumns={activityColumns}
        columnCtx={{}}
        selectedId={selectedId}
        selectedIds={selectedIds}
        selectAllState={headerState}
        onToggleSelectAll={toggleSelectAll}
        onSelect={select}
        onOpenDetail={open}
        ariaLabel="Finance Activity"
        rowLabel={(row) => row.node.summary}
        enableFilters
        enableSort
        sorts={grid.sorts}
        onSortChange={grid.toggleSort}
        onSetSort={grid.setSort}
        filters={grid.filters}
        onFilterChange={grid.setFilter}
        advancedFilter={grid.advancedFilter}
        search={grid.search}
        distinctValues={distinctValues}
        onCountsChange={setCounts}
        onNavigableIdsChange={onIdsChange}
        widths={grid.widths}
        onResizeColumn={grid.setWidth}
        onResetColumnWidth={grid.clearWidth}
        columnControls={grid.columnControls}
        density={grid.density}
        empty={
          <p className="mx-auto max-w-lg p-6 text-center text-[0.9375rem] text-ink-muted">
            Finance Activity begins with the first audited change after this deployment.
          </p>
        }
      />
      <ActivityDrawer
        event={event}
        loading={loading && openId !== null}
        error={openId ? error : null}
        onClose={close}
      />
    </div>
  );
}
