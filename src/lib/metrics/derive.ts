import type { MetricChartPoint, MetricEntryView, MetricType } from "./types";
import { METRIC_TYPES } from "./types";

/** Date column sort on the tracking grid (default newest-first, like Achieve). */
export type EntryDateSort = "asc" | "desc";

/**
 * Sort tracking entries by entryDate, then id for a stable same-day order.
 * Pure — does not mutate the input.
 */
export function sortEntriesByDate<T extends { entryDate: string; id: string }>(
  entries: ReadonlyArray<T>,
  direction: EntryDateSort = "desc",
): T[] {
  const dir = direction === "asc" ? 1 : -1;
  return [...entries].sort((a, b) => {
    const byDate = a.entryDate.localeCompare(b.entryDate);
    if (byDate !== 0) return byDate * dir;
    return a.id.localeCompare(b.id) * dir;
  });
}

/**
 * Keep a display order frozen while the user is mid-edit (e.g. date picker open).
 * Known ids keep their frozen positions; any new ids append in the caller's order.
 * Pass `null` / empty to return entries unchanged (already sorted by the caller).
 */
export function applyFrozenEntryOrder<T extends { id: string }>(
  entries: ReadonlyArray<T>,
  frozenIds: readonly string[] | null | undefined,
): T[] {
  if (!frozenIds || frozenIds.length === 0) return [...entries];
  const byId = new Map(entries.map((e) => [e.id, e]));
  const out: T[] = [];
  for (const id of frozenIds) {
    const row = byId.get(id);
    if (row) {
      out.push(row);
      byId.delete(id);
    }
  }
  for (const row of entries) {
    if (byId.has(row.id)) out.push(row);
  }
  return out;
}

/**
 * Whether the tracking grid should show a Target column.
 * Hidden when the metric has no objective and no entry carries its own target
 * (import history). Per-entry targets are rare; the metric objective is enough
 * for the graph via `entry.target ?? objectiveTarget`.
 */
export function shouldShowEntryTargetColumn(
  objectiveTarget: number | null | undefined,
  entries: ReadonlyArray<{ target: number | null | undefined }>,
  /** Live draft text from the form (reveals the column as the user types). */
  draftObjectiveText?: string,
): boolean {
  if (draftObjectiveText !== undefined && draftObjectiveText.trim() !== "") {
    return true;
  }
  if (objectiveTarget !== null && objectiveTarget !== undefined) return true;
  return entries.some((e) => e.target !== null && e.target !== undefined);
}

/**
 * Pick the latest entry by entryDate (lexicographic YYYY-MM-DD), then higher id
 * on a tie.
 */
export function latestEntry(
  entries: ReadonlyArray<Pick<MetricEntryView, "entryDate" | "value" | "id">>,
): { entryDate: string; value: number } | null {
  if (entries.length === 0) return null;
  let best = entries[0];
  for (let i = 1; i < entries.length; i++) {
    const e = entries[i];
    if (
      e.entryDate > best.entryDate ||
      (e.entryDate === best.entryDate && e.id > best.id)
    ) {
      best = e;
    }
  }
  return { entryDate: best.entryDate, value: best.value };
}

/** Coerce free-text / import noise to a known MetricType; unknown → total. */
export function normalizeMetricType(raw: string | null | undefined): MetricType {
  if (raw === null || raw === undefined || raw === "") return "total";
  const s = raw.trim().toLowerCase();
  if ((METRIC_TYPES as readonly string[]).includes(s)) return s as MetricType;
  return "total";
}

/** True when `raw` is one of the three codes (case-sensitive canonical form). */
export function isMetricType(raw: string): raw is MetricType {
  return (METRIC_TYPES as readonly string[]).includes(raw);
}

/**
 * Last Value / Current Total for the metric type.
 * - instance / total: latest entry by date
 * - cumulative: sum of all entry values; date is still the latest entry date
 */
export function displayValue(
  entries: ReadonlyArray<Pick<MetricEntryView, "entryDate" | "value" | "id">>,
  metricType: MetricType,
): { entryDate: string; value: number } | null {
  if (entries.length === 0) return null;
  if (metricType === "cumulative") {
    const latest = latestEntry(entries);
    if (!latest) return null;
    let sum = 0;
    for (const e of entries) sum += e.value;
    return { entryDate: latest.entryDate, value: sum };
  }
  return latestEntry(entries);
}

/**
 * Chart series: chronological actual values with optional per-entry target.
 * Cumulative plots a running sum; instance/total plot raw entry values.
 */
export function chartPoints(
  entries: ReadonlyArray<Pick<MetricEntryView, "entryDate" | "value" | "target">>,
  objectiveTarget: number | null,
  metricType: MetricType = "total",
): MetricChartPoint[] {
  const sorted = [...entries].sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  if (metricType === "cumulative") {
    let run = 0;
    return sorted.map((e) => {
      run += e.value;
      return {
        date: e.entryDate,
        value: run,
        target: e.target ?? objectiveTarget,
      };
    });
  }
  return sorted.map((e) => ({
    date: e.entryDate,
    value: e.value,
    target: e.target ?? objectiveTarget,
  }));
}

/**
 * SVG polyline points for a series, mapped into a viewBox of width×height with padding.
 * Returns empty string when fewer than one point.
 * `padding` may be a uniform number or per-side box (left/right/top/bottom).
 */
export function seriesPolyline(
  values: number[],
  width: number,
  height: number,
  padding: number | { left: number; right: number; top: number; bottom: number },
  yMin: number,
  yMax: number,
): string {
  if (values.length === 0) return "";
  const pad =
    typeof padding === "number"
      ? { left: padding, right: padding, top: padding, bottom: padding }
      : padding;
  return values
    .map((v, i) => {
      const { x, y } = plotPoint(i, values.length, v, width, height, pad, yMin, yMax);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

/** Inclusive y-domain with a small pad so a flat series still has room. */
export function yDomain(
  values: number[],
  extra?: number | null,
): { min: number; max: number } {
  const all = [...values];
  if (extra !== null && extra !== undefined && Number.isFinite(extra)) all.push(extra);
  if (all.length === 0) return { min: 0, max: 1 };
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    min -= pad;
    max += pad;
  } else {
    const pad = (max - min) * 0.05;
    min -= pad;
    max += pad;
  }
  return { min, max };
}

/**
 * Evenly spaced “nice” tick values covering [min, max] (Wilkinson-style step).
 * Used for Y axis labels at regular intervals rather than only the extremes.
 */
export function niceTicks(min: number, max: number, targetCount = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    return niceTicks(min - pad, max + pad, targetCount);
  }
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const span = hi - lo;
  const rough = span / Math.max(1, targetCount - 1);
  const power = 10 ** Math.floor(Math.log10(rough));
  const err = rough / power;
  let step: number;
  if (err >= 5) step = 10 * power;
  else if (err >= 2) step = 5 * power;
  else if (err >= 1) step = 2 * power;
  else step = power;

  const niceMin = Math.floor(lo / step) * step;
  const niceMax = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  // Guard against float drift ending the loop early or late.
  const end = niceMax + step * 0.5;
  for (let v = niceMin; v <= end; v += step) {
    ticks.push(Number(v.toPrecision(12)));
  }
  return ticks.length >= 2 ? ticks : [lo, hi];
}

/**
 * Indices into a chronological series for X-axis labels (always includes first & last).
 */
export function axisIndices(count: number, maxTicks = 6): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  if (count <= maxTicks) {
    return Array.from({ length: count }, (_, i) => i);
  }
  const set = new Set<number>();
  for (let t = 0; t < maxTicks; t++) {
    set.add(Math.round((t / (maxTicks - 1)) * (count - 1)));
  }
  return [...set].sort((a, b) => a - b);
}

/** Map a series index + value into SVG coordinates (same geometry as seriesPolyline). */
export function plotPoint(
  index: number,
  count: number,
  value: number,
  width: number,
  height: number,
  padding: { left: number; right: number; top: number; bottom: number },
  yMin: number,
  yMax: number,
): { x: number; y: number } {
  const innerW = Math.max(1, width - padding.left - padding.right);
  const innerH = Math.max(1, height - padding.top - padding.bottom);
  const span = yMax - yMin || 1;
  const x = padding.left + (count <= 1 ? innerW / 2 : (index / (count - 1)) * innerW);
  const y = padding.top + innerH - ((value - yMin) / span) * innerH;
  return { x, y };
}

/** Short chart label for a `YYYY-MM-DD` key (e.g. 1/5/16). */
export function formatChartDate(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!m) return dateKey;
  const year = m[1].slice(2);
  const month = String(Number(m[2]));
  const day = String(Number(m[3]));
  return `${month}/${day}/${year}`;
}
