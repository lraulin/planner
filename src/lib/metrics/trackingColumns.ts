import type { ColumnMeta } from "@/components/grid/columns";

/**
 * Tracking-values grid columns (Metric form → Tracking tab).
 *
 * Layout is shared for **all metrics** via `grid:metric-tracking` Show Fields —
 * not per-metric. Default is Date + Value only: Type and Target are power-user
 * per-entry overrides (resets, corrections, period targets). Most day-to-day
 * logging only needs the reading and its date; the metric’s Type and objective
 * target cover the rest.
 *
 * Date / Value are not hideable so the grid always has a usable core.
 */
export const TRACKING_COLUMNS: ColumnMeta[] = [
  { id: "date", label: "Date", width: "8rem", hideable: false },
  { id: "type", label: "Type", width: "6rem" },
  { id: "target", label: "Target", width: "5rem" },
  { id: "value", label: "Value", width: "5rem", hideable: false },
];

/** Preset when the user has not customized (or after Reset Fields). */
export const TRACKING_DEFAULT_ORDER: string[] = ["date", "value"];

export const TRACKING_GRID_TAB_ID = "metric-tracking";
