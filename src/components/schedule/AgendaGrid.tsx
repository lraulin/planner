"use client";

import { useMemo, useState, type ReactNode } from "react";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { useGridState } from "@/components/grid/useGridState";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { useToday } from "@/components/grid/useToday";
import { collectDistinctValues } from "@/lib/grid/distinct";
import type { GridRow } from "@/lib/tree/slice";
import type { ScheduleOccurrence } from "@/lib/schedule/queries";
import { agendaRows, type AgendaRow } from "@/lib/schedule/agenda";
import type { OutlineNode } from "@/lib/tree/types";
import type { Command } from "@/lib/commands/registry";
import {
  agendaColumns,
  AGENDA_COLUMN_IDS,
  projectNamesFrom,
  type AgendaColumnCtx,
} from "./agendaColumns";

/**
 * The schedule's range as rows.
 *
 * Its own grid state scope rather than a module view: this is a second way of looking at the
 * Weekly Schedule tab, not an eleventh module, so it has no saved-view catalogue and no
 * `ViewPicker` — `GridToolbar` renders without one. Column order, widths, sort, filters and
 * search still persist, through `useGridState`, exactly as every other grid's do.
 */
const AGENDA_TAB_ID = "schedule.agenda";

export function AgendaGrid({
  occurrences,
  days,
  nodes,
  hostCommands,
  lensLeft,
  lensRight,
  selectedId,
  onSelect,
  onOpenAppointment,
  onCycleCheck,
}: {
  occurrences: ScheduleOccurrence[];
  days: Date[];
  nodes: OutlineNode[];
  /** The schedule tab's own commands, so this row is the only command row on screen. */
  hostCommands: readonly Command[];
  /** The tab's lens controls — Time Chart, Plan Week, the Calendar | Agenda switch. */
  lensLeft: ReactNode;
  /** The range pagers, which sit against the right edge. */
  lensRight: ReactNode;
  selectedId: string | null;
  onSelect: (occurrenceKey: string) => void;
  onOpenAppointment: (row: AgendaRow) => void;
  onCycleCheck: (row: AgendaRow) => void;
}) {
  const todayKey = useToday();
  const [counts, setCounts] = useState({ shown: 0, total: 0 });

  const projectNames = useMemo(() => projectNamesFrom(nodes), [nodes]);

  const rows = useMemo(
    () => agendaRows(occurrences, days, projectNames),
    [occurrences, days, projectNames],
  );

  const gridRows: GridRow<AgendaRow>[] = useMemo(
    () =>
      rows.map((row) => ({
        kind: "node" as const,
        id: row.id,
        node: row,
        depth: 0,
      })),
    [rows],
  );

  const grid = useGridState(AGENDA_TAB_ID, agendaColumns, {
    order: [...AGENDA_COLUMN_IDS],
    // Chronological, because that is what an agenda is. The grid's own default is priority,
    // which these rows do not have.
    sorts: [{ columnId: "date", direction: "asc" }],
  });

  const distinctValues = useMemo(
    () => collectDistinctValues(gridRows, agendaColumns),
    [gridRows],
  );

  const columnCtx: AgendaColumnCtx = useMemo(
    () => ({ todayKey, onCycleCheck }),
    [todayKey, onCycleCheck],
  );

  const fallbackIds = useMemo(() => gridRows.map((row) => row.id), [gridRows]);
  const { order, onIdsChange } = useNavigableIds(fallbackIds);
  const multi = useMultiSelect(order, selectedId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <GridToolbar
        grid={grid}
        gridLabel="Agenda"
        allColumns={agendaColumns}
        distinctValues={distinctValues}
        counts={counts}
        hostCommands={hostCommands}
        left={lensLeft}
        right={lensRight}
      />
      <DataGrid<AgendaColumnCtx, AgendaRow>
        rows={gridRows}
        columns={grid.columns}
        allColumns={agendaColumns}
        columnCtx={columnCtx}
        selectedId={multi.selectedId}
        selectedIds={multi.selectedIds}
        selectAllState={multi.headerState}
        onToggleSelectAll={multi.toggleSelectAll}
        onSelect={(id, mods) => {
          multi.select(id, mods);
          onSelect(id);
        }}
        onNavigableIdsChange={onIdsChange}
        onOpenDetail={(id) => {
          const row = rows.find((entry) => entry.id === id);
          if (row) onOpenAppointment(row);
        }}
        ariaLabel="Agenda"
        rowLabel={(row) => row.node.subject || "(no subject)"}
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
        widths={grid.widths}
        onResizeColumn={grid.setWidth}
        onResetColumnWidth={grid.clearWidth}
        columnControls={grid.columnControls}
        density={grid.density}
        empty={
          <p className="p-6 text-[0.8125rem] text-ink-muted">
            Nothing scheduled in these days.
          </p>
        }
      />
    </div>
  );
}
