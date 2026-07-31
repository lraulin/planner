"use client";

import { formatEffort } from "@/lib/tree/format";
import { STATE_LABELS } from "@/lib/tree/hierarchy";
import type { ColumnDef } from "@/components/grid/columns";
import {
  deadlineColumn,
  nameColumn,
  priorityColumn,
  type OutlineColumnCtx,
} from "@/components/grid/commonColumns";
import { EffortCell, FocusCell, StateCell } from "@/components/grid/cells";

/** Re-exported so the grid tabs keep importing their ctx type from here. */
export type { OutlineColumnCtx };

export const OUTLINE_COLUMN_IDS = [
  "priority",
  "name",
  "effort",
  "deadline",
  "state",
  "focus",
] as const;

/**
 * The outline's fixed column set, expressed as shared `ColumnDef`s. Priority leads, as it
 * does on Projects, Tasks and Goals — and as it did in Achieve, where the narrow columns
 * sat to the left of the indented tree rather than off past its ragged right edge.
 */
export const outlineColumns: ColumnDef<OutlineColumnCtx>[] = [
  priorityColumn(),
  nameColumn({ width: "minmax(16rem,1fr)" }),
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
  {
    id: "state",
    label: "State",
    width: "7rem",
    filterKind: "enum",
    filterValue: (row) => STATE_LABELS[row.node.state],
    sortValue: (row) => row.node.state,
    render: (row, ctx) => (
      <StateCell
        node={row.node}
        onChange={(state) => ctx.onStateChange(row.node, state)}
      />
    ),
  },
  {
    id: "focus",
    label: "Focus",
    width: "3rem",
    align: "center",
    sortValue: (row) => (row.node.focus ? 1 : 0),
    render: (row, ctx) => (
      <FocusCell
        node={row.node}
        onChange={(focus) => ctx.onFocusChange(row.node, focus)}
      />
    ),
  },
];
