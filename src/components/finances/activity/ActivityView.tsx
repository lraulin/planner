"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  listFinanceActivityAction,
  loadFinanceActivityEventAction,
} from "@/app/finances/actions";
import { DataGrid } from "@/components/grid/DataGrid";
import { downloadTextFile } from "@/components/grid/downloadCsv";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { useGridState } from "@/components/grid/useGridState";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { useRegisterCommands } from "@/components/shell/CommandProvider";
import type { Command } from "@/lib/commands/registry";
import {
  activityCopyCommands,
  activityEvidenceDocument,
  activityExportCommands,
  activityExportFormatOf,
  serializeActivityExport,
} from "@/lib/finances/audit/export";
import { exportFilename, exportMimeType, FORMAT_EXTENSION } from "@/lib/grid/exportCsv";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { writeClipboardText } from "@/lib/tree/copyAsText";
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
    // Keep the last loaded event so File ▸ Export Event still works after the drawer
    // closes — opening File clicks the drawer scrim, and below `md` the sheet covers `⋯`.
    setOpenId(null);
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

  const eventRef = useRef(event);
  useEffect(() => {
    eventRef.current = event;
  });
  const loaded = event !== null;
  const exportCommands = useMemo((): Command[] => {
    const write = (
      format: ReturnType<typeof activityExportFormatOf>,
      toFile: boolean,
    ) => {
      const current = eventRef.current;
      if (!current || !format) return;
      const exportedAt = new Date();
      const doc = activityEvidenceDocument(current);
      const text = serializeActivityExport(format, doc, exportedAt);
      if (!toFile) {
        void writeClipboardText(text);
        return;
      }
      downloadTextFile(
        exportFilename(doc.title, FORMAT_EXTENSION[format], exportedAt),
        text,
        exportMimeType(format),
      );
    };
    const downloads = activityExportCommands(() => {}, loaded).map((command) => {
      const format = activityExportFormatOf(command.id);
      return {
        ...command,
        run: () => write(format, true),
        alternate: {
          label: command.alternate?.label ?? "",
          title: command.alternate?.title,
          run: () => write(format, false),
        },
      };
    });
    const copies = activityCopyCommands(() => {}, loaded).map((command) => ({
      ...command,
      run: () => write(activityExportFormatOf(command.id), false),
    }));
    return [...downloads, ...copies];
  }, [loaded]);
  useRegisterCommands(exportCommands);

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
        event={openId ? event : null}
        loading={loading && openId !== null}
        error={openId ? error : null}
        onClose={close}
      />
    </div>
  );
}
