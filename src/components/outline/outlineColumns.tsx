"use client";

import { formatEffort } from "@/lib/tree/format";
import type { ColumnDef } from "@/components/grid/columns";
import {
  abbrStateColumn,
  actualEffortColumn,
  assigneeColumn,
  categoryColumn,
  completedColumn,
  contextsColumn,
  dateCompletedColumn,
  dateCreatedColumn,
  dateModifiedColumn,
  deadlineColumn,
  deferToColumn,
  descriptionColumn,
  effortDrivenColumn,
  effortLeftColumn,
  focusColumn,
  iconColumn,
  typeColumn,
  importanceColumn,
  lapColumn,
  leadTimeColumn,
  nameColumn,
  priorityColumn,
  projectPriorityColumn,
  scheduleStatusColumn,
  stateColumn,
  targetEndColumn,
  targetStartColumn,
  type OutlineColumnCtx,
} from "@/components/grid/commonColumns";
import { EffortCell } from "@/components/grid/cells";

/** Re-exported so the grid tabs keep importing their ctx type from here. */
export type { OutlineColumnCtx };

/**
 * Default visible columns for the Outline. Extra AP fields are defined below and appear
 * only after the user opts into them via Show Fields.
 */
export const OUTLINE_COLUMN_IDS = [
  "priority",
  "name",
  "effort",
  "deadline",
  "state",
  "focus",
] as const;

/**
 * The outline's column set, expressed as shared `ColumnDef`s. Priority leads, as it
 * does on Projects, Tasks and Goals — and as it did in Achieve, where the narrow columns
 * sat to the left of the indented tree rather than off past its ragged right edge.
 *
 * Optional columns keep the default order unchanged; they only expand the Show Fields menu.
 */
export function buildOutlineColumns(
  today: string | null = null,
): ColumnDef<OutlineColumnCtx>[] {
  return [
    priorityColumn(),
    nameColumn({ width: "minmax(16rem,1fr)", dragHandle: true }),
    categoryColumn(),
    {
      id: "effort",
      label: "Effort",
      width: "4.5rem",
      align: "right",
      filterKind: "text",
      filterValue: (row) => formatEffort(row.node.effortRollupMinutes) || null,
      sortValue: (row) => row.node.effortRollupMinutes ?? -1,
      render: (row, ctx) => (
        <EffortCell
          key={`effort:${formatEffort(row.node.effortMinutes)}`}
          node={row.node}
          onChange={(minutes) => ctx.onEffortChange(row.node, minutes)}
        />
      ),
    },
    deadlineColumn(),
    stateColumn(today),
    focusColumn(),
    // Optional AP fields — Show Fields only.
    actualEffortColumn(),
    assigneeColumn(),
    completedColumn(),
    contextsColumn(),
    dateCompletedColumn(),
    dateCreatedColumn(),
    dateModifiedColumn(),
    deferToColumn(),
    descriptionColumn(),
    effortDrivenColumn(),
    effortLeftColumn(),
    importanceColumn(),
    leadTimeColumn(),
    targetEndColumn(),
    targetStartColumn(),
    iconColumn(),
    typeColumn(),
    projectPriorityColumn(),
    abbrStateColumn(today),
    scheduleStatusColumn(new Map(), today),
    lapColumn(),
  ];
}

/** Static default set used when no today key is available yet (SSR / first paint). */
export const outlineColumns: ColumnDef<OutlineColumnCtx>[] = buildOutlineColumns();
