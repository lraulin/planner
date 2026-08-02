import type { MetricChartPoint, MetricEntryView } from "./types";

/**
 * Pick the latest entry by entryDate (lexicographic YYYY-MM-DD), then updated order via
 * array order (caller should pass date-desc or we sort).
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

/** Chart series: chronological actual values with optional per-entry target. */
export function chartPoints(
  entries: ReadonlyArray<Pick<MetricEntryView, "entryDate" | "value" | "target">>,
  objectiveTarget: number | null,
): MetricChartPoint[] {
  const sorted = [...entries].sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  return sorted.map((e) => ({
    date: e.entryDate,
    value: e.value,
    target: e.target ?? objectiveTarget,
  }));
}

/**
 * SVG polyline points for a series, mapped into a viewBox of width×height with padding.
 * Returns empty string when fewer than one point.
 */
export function seriesPolyline(
  values: number[],
  width: number,
  height: number,
  padding: number,
  yMin: number,
  yMax: number,
): string {
  if (values.length === 0) return "";
  const innerW = Math.max(1, width - padding * 2);
  const innerH = Math.max(1, height - padding * 2);
  const span = yMax - yMin || 1;
  return values
    .map((v, i) => {
      const x =
        padding +
        (values.length === 1 ? innerW / 2 : (i / (values.length - 1)) * innerW);
      const y = padding + innerH - ((v - yMin) / span) * innerH;
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
