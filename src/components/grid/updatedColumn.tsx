import { DateText } from "@/components/date/DateText";
import { localDateKey } from "@/lib/schedule/geometry";
import type { CompactRole } from "@/lib/grid/compactFields";
import type { ColumnDef } from "./columns";

/**
 * A record catalog's "Updated" column: the local day it last changed, filtered as a date and
 * sorted by the instant, so two edits on one day still order.
 */
export function updatedColumn<TCtx, TRow extends { updatedAt: Date }>(
  compact?: CompactRole,
): ColumnDef<TCtx, TRow> {
  return {
    id: "updated",
    label: "Updated",
    width: "7rem",
    ...(compact ? { compact } : {}),
    filterKind: "date",
    filterValue: (row) => localDateKey(row.node.updatedAt),
    sortValue: (row) => row.node.updatedAt.getTime(),
    render: (row) => (
      <DateText
        dateKey={localDateKey(row.node.updatedAt)}
        className="tabular text-[0.8125rem] text-ink-muted"
      />
    ),
  };
}
