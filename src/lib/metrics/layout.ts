import { asBoolean, asClampedNumber, asRecord } from "@/lib/settings/parse";
import { SETTINGS_VERSION } from "@/lib/settings/scopes";

/**
 * Metrics tab layout prefs — shared for all metrics (not per-metric).
 * Stored under `grid:metrics-layout`.
 *
 * performanceHeight is the full performance pane (toggles + chart), in CSS pixels.
 *
 * The five switches live here too. Metrics is the one module with no `GridToolbar`, so it
 * never picked up the rule the persistent-UI-state slice set for everything else — its
 * toggles were component `useState` and reset on every visit, which meant Group by Owner
 * and Active only had to be re-picked each time the tab was opened. Same scope rather than
 * a new one: they are all "how this tab is arranged for me", and `parseMetricsLayout`
 * already falls back per key, so a blob written before this reads as the defaults.
 */

export const METRICS_LAYOUT_SCOPE = "grid:metrics-layout";

export const MIN_PERFORMANCE_HEIGHT = 140;
export const MAX_PERFORMANCE_HEIGHT = 720;
export const DEFAULT_PERFORMANCE_HEIGHT = 280;

/**
 * The pane's height below `md`, where it is not resizable.
 *
 * Fixed rather than stored: the drag handle is mouse-shaped and gone on a phone
 * (`responsive.md`), so a persisted height there could only ever be one inherited from a
 * desktop session — 720px of graph on an 844px screen, with no way to get the list back.
 * 200px is about six rows of list still visible under the toolbar on a 390 × 844 screen.
 */
export const COMPACT_PERFORMANCE_HEIGHT = 200;

export type MetricsLayoutSettings = {
  /** Height of the performance pane under the metrics list (px). */
  performanceHeight: number;
  /** Hide retired metrics. On by default — the catalog is a working list. */
  activeOnly: boolean;
  /** Group the list under owner headings. */
  groupByOwner: boolean;
  /** Show the performance pane at all. */
  showPerformance: boolean;
  showLegend: boolean;
  showObjective: boolean;
};

export const DEFAULT_METRICS_LAYOUT: MetricsLayoutSettings = {
  performanceHeight: DEFAULT_PERFORMANCE_HEIGHT,
  activeOnly: true,
  groupByOwner: false,
  showPerformance: true,
  showLegend: true,
  showObjective: true,
};

export function clampPerformanceHeight(height: number): number {
  if (!Number.isFinite(height)) return DEFAULT_PERFORMANCE_HEIGHT;
  return Math.min(
    MAX_PERFORMANCE_HEIGHT,
    Math.max(MIN_PERFORMANCE_HEIGHT, Math.round(height)),
  );
}

export function parseMetricsLayout(value: unknown): MetricsLayoutSettings {
  const record = asRecord(value);
  if (!record) return DEFAULT_METRICS_LAYOUT;
  return {
    performanceHeight: asClampedNumber(
      record.performanceHeight,
      DEFAULT_PERFORMANCE_HEIGHT,
      MIN_PERFORMANCE_HEIGHT,
      MAX_PERFORMANCE_HEIGHT,
    ),
    activeOnly: asBoolean(record.activeOnly, DEFAULT_METRICS_LAYOUT.activeOnly),
    groupByOwner: asBoolean(record.groupByOwner, DEFAULT_METRICS_LAYOUT.groupByOwner),
    showPerformance: asBoolean(
      record.showPerformance,
      DEFAULT_METRICS_LAYOUT.showPerformance,
    ),
    showLegend: asBoolean(record.showLegend, DEFAULT_METRICS_LAYOUT.showLegend),
    showObjective: asBoolean(
      record.showObjective,
      DEFAULT_METRICS_LAYOUT.showObjective,
    ),
  };
}

export function serializeMetricsLayout(settings: MetricsLayoutSettings): unknown {
  return {
    v: SETTINGS_VERSION,
    ...settings,
    performanceHeight: clampPerformanceHeight(settings.performanceHeight),
  };
}
