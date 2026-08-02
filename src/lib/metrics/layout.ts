import { asClampedNumber, asRecord } from "@/lib/settings/parse";
import { SETTINGS_VERSION } from "@/lib/settings/scopes";

/**
 * Metrics tab layout prefs — shared for all metrics (not per-metric).
 * Stored under `grid:metrics-layout`.
 *
 * performanceHeight is the full performance pane (toggles + chart), in CSS pixels.
 */

export const METRICS_LAYOUT_SCOPE = "grid:metrics-layout";

export const MIN_PERFORMANCE_HEIGHT = 140;
export const MAX_PERFORMANCE_HEIGHT = 720;
export const DEFAULT_PERFORMANCE_HEIGHT = 280;

export type MetricsLayoutSettings = {
  /** Height of the performance pane under the metrics list (px). */
  performanceHeight: number;
};

export const DEFAULT_METRICS_LAYOUT: MetricsLayoutSettings = {
  performanceHeight: DEFAULT_PERFORMANCE_HEIGHT,
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
  };
}

export function serializeMetricsLayout(settings: MetricsLayoutSettings): unknown {
  return {
    v: SETTINGS_VERSION,
    performanceHeight: clampPerformanceHeight(settings.performanceHeight),
  };
}
