"use client";

import { formatEffort } from "@/lib/tree/format";
import { EffortCell } from "./cells";
import type { ColumnDef, NodeGridRow } from "./columns";
import type { OutlineColumnCtx } from "./commonColumns";

type EditableEffortOptions = {
  /** Outline and Projects filter Effort as free text; the Chooser does not. */
  filter?: boolean;
  /** Tasks puts the rollup on the compact chip when there is no filter text. */
  compactText?: boolean;
};

/**
 * The editable Effort column shared by Outline, Projects, Tasks and the Task Chooser.
 *
 * Each grid still picks its own filter / compact behaviour; the cell and sort are one.
 */
export function editableEffortColumn(
  options: EditableEffortOptions = {},
): ColumnDef<OutlineColumnCtx> {
  const filterValue = (row: NodeGridRow) =>
    formatEffort(row.node.effortRollupMinutes) || null;
  return {
    id: "effort",
    label: "Effort",
    width: "4.5rem",
    align: "right",
    sortValue: (row) => row.node.effortRollupMinutes ?? -1,
    ...(options.filter ? { filterKind: "text" as const, filterValue } : {}),
    ...(options.compactText ? { compactText: filterValue } : {}),
    render: (row, ctx) => (
      <EffortCell
        key={`effort:${formatEffort(row.node.effortMinutes)}`}
        node={row.node}
        onChange={(minutes) => ctx.onEffortChange(row.node, minutes)}
      />
    ),
  };
}
