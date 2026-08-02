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

/** Normalize chart padding to a per-side box. */
function normalizePad(
  padding: number | { left: number; right: number; top: number; bottom: number },
): { left: number; right: number; top: number; bottom: number } {
  return typeof padding === "number"
    ? { left: padding, right: padding, top: padding, bottom: padding }
    : padding;
}

/**
 * Calendar-day ordinal for a `YYYY-MM-DD` key (UTC midnight / 86400000).
 * Used only for linear day spacing — not wall-clock local time.
 */
export function dateKeyOrdinal(dateKey: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!m) return 0;
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000);
}

/** Inverse of {@link dateKeyOrdinal}. */
export function ordinalToDateKey(ordinal: number): string {
  const d = new Date(ordinal * 86_400_000);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/**
 * Horizontal fraction in [0, 1] for a date between minDate and maxDate.
 * Each calendar day takes equal width; same min/max → centre.
 */
export function dateXFraction(
  dateKey: string,
  minDate: string,
  maxDate: string,
): number {
  const t0 = dateKeyOrdinal(minDate);
  const t1 = dateKeyOrdinal(maxDate);
  if (t0 === t1) return 0.5;
  const t = dateKeyOrdinal(dateKey);
  // Clamp so bad/out-of-range keys still land in the plot.
  const f = (t - t0) / (t1 - t0);
  return Math.min(1, Math.max(0, f));
}

/** One X-axis label: calendar-aligned, not tied to sample dates. */
export type TimeAxisTick = {
  /** Position on the linear time axis (`YYYY-MM-DD`). */
  dateKey: string;
  label: string;
  /** Year starts (and year-unit ticks) — render slightly stronger. */
  major: boolean;
};

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function parseDateParts(dateKey: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) return null;
  return { y: +match[1], m: +match[2], d: +match[3] };
}

function monthKey(y: number, month1: number): string {
  return `${y}-${String(month1).padStart(2, "0")}-01`;
}

function yearKey(y: number): string {
  return `${y}-01-01`;
}

function addMonths(y: number, month1: number, step: number): { y: number; m: number } {
  const idx = y * 12 + (month1 - 1) + step;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

/**
 * Choose a calendar unit so ticks are regular and legible (like {@link niceTicks}
 * for Y). Short ranges → days; ~months–years → months; long → years.
 */
function chooseTimeStep(
  spanDays: number,
  maxTicks: number,
): { unit: "day" | "month" | "year"; step: number } {
  const cap = Math.max(2, maxTicks);
  if (spanDays <= 0) return { unit: "day", step: 1 };
  // Daily when every day still fits (or nearly).
  if (spanDays <= cap) return { unit: "day", step: 1 };
  if (spanDays <= cap * 2) return { unit: "day", step: 2 };
  if (spanDays <= 45) {
    return { unit: "day", step: Math.max(3, Math.ceil(spanDays / (cap - 1))) };
  }

  const spanMonths = spanDays / 30.437;
  // Prefer one tick per month for ~year-long series (legible at chart width).
  if (spanMonths <= Math.max(cap, 16)) return { unit: "month", step: 1 };
  if (spanMonths <= cap * 2) return { unit: "month", step: 2 };
  if (spanMonths <= cap * 3) return { unit: "month", step: 3 };
  if (spanMonths <= cap * 6) return { unit: "month", step: 6 };

  const spanYears = spanDays / 365.25;
  return {
    unit: "year",
    step: Math.max(1, Math.ceil(spanYears / (cap - 1))),
  };
}

function formatDayLabel(dateKey: string, showYear: boolean): string {
  const p = parseDateParts(dateKey);
  if (!p) return dateKey;
  if (showYear) return `${p.m}/${p.d}/${String(p.y).slice(2)}`;
  return `${p.m}/${p.d}`;
}

function formatMonthLabel(
  y: number,
  month1: number,
  opts: { major: boolean; forceYear: boolean },
): string {
  const name = MONTH_SHORT[month1 - 1] ?? String(month1);
  if (opts.major) {
    // January (or forced): year is the prominent part.
    return month1 === 1 ? String(y) : `${name} '${String(y).slice(2)}`;
  }
  if (opts.forceYear) return `${name} '${String(y).slice(2)}`;
  return name;
}

/**
 * Calendar-aligned X-axis ticks for a linear time domain.
 * Independent of sample dates — hover shows exact entry dates.
 *
 * Granularity follows the span (days → months → years) so labels stay evenly
 * spaced and readable; year boundaries are marked `major`.
 */
export function niceTimeTicks(
  minDate: string,
  maxDate: string,
  maxTicks = 12,
): TimeAxisTick[] {
  const t0 = dateKeyOrdinal(minDate);
  const t1 = dateKeyOrdinal(maxDate);
  if (t0 === t1) {
    return [
      {
        dateKey: minDate,
        label: formatChartDate(minDate),
        major: true,
      },
    ];
  }

  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  const minKey = ordinalToDateKey(lo);
  const maxKey = ordinalToDateKey(hi);
  const spanDays = hi - lo;
  const { unit, step } = chooseTimeStep(spanDays, maxTicks);

  const raw: { dateKey: string; y: number; m: number; d: number }[] = [];

  if (unit === "day") {
    // Start at domain min so daily series line up with the first sample day.
    for (let t = lo; t <= hi; t += step) {
      const dateKey = ordinalToDateKey(t);
      const p = parseDateParts(dateKey)!;
      raw.push({ dateKey, ...p });
    }
  } else if (unit === "month") {
    const start = parseDateParts(minKey)!;
    // First month-start on or after minDate.
    let y = start.y;
    let m = start.m;
    if (start.d > 1) {
      ({ y, m } = addMonths(y, m, 1));
    }
    // Align to step grid from a fixed origin (year 0) so ticks are regular.
    const startIdx = y * 12 + (m - 1);
    const aligned = Math.ceil(startIdx / step) * step;
    y = Math.floor(aligned / 12);
    m = (aligned % 12) + 1;
    for (;;) {
      const dateKey = monthKey(y, m);
      if (dateKeyOrdinal(dateKey) > hi) break;
      if (dateKeyOrdinal(dateKey) >= lo) {
        raw.push({ dateKey, y, m, d: 1 });
      }
      ({ y, m } = addMonths(y, m, step));
      if (raw.length > 64) break;
    }
  } else {
    const startY = parseDateParts(minKey)!.y;
    const endY = parseDateParts(maxKey)!.y;
    // First year tick on or after min (Jan 1).
    let y = startY;
    if (minKey > yearKey(y)) y += 1;
    // Align to step from year 0.
    y = Math.ceil(y / step) * step;
    for (; y <= endY; y += step) {
      const dateKey = yearKey(y);
      if (dateKeyOrdinal(dateKey) < lo) continue;
      if (dateKeyOrdinal(dateKey) > hi) break;
      raw.push({ dateKey, y, m: 1, d: 1 });
    }
  }

  // If alignment produced nothing (tiny range mid-month with month step), fall back
  // to domain endpoints as day labels.
  if (raw.length === 0) {
    return [
      {
        dateKey: minKey,
        label: formatChartDate(minKey),
        major: true,
      },
      {
        dateKey: maxKey,
        label: formatChartDate(maxKey),
        major: true,
      },
    ];
  }

  return raw.map((tick, i) => {
    if (unit === "day") {
      const prev = raw[i - 1];
      const showYear =
        i === 0 ||
        (prev !== undefined && prev.y !== tick.y) ||
        (tick.m === 1 && tick.d === 1);
      const major = tick.m === 1 && tick.d === 1;
      return {
        dateKey: tick.dateKey,
        label: formatDayLabel(tick.dateKey, showYear || major),
        major,
      };
    }
    if (unit === "year") {
      return {
        dateKey: tick.dateKey,
        label: String(tick.y),
        major: true,
      };
    }
    // month
    const major = tick.m === 1;
    const forceYear = i === 0 && !major;
    return {
      dateKey: tick.dateKey,
      label: formatMonthLabel(tick.y, tick.m, { major, forceYear }),
      major: major || forceYear,
    };
  });
}

/**
 * SVG polyline for a dated series. X is linear in calendar time (each day same
 * width); Y is linear in value. Returns empty string when no points.
 */
export function seriesPolyline(
  series: ReadonlyArray<{ date: string; value: number }>,
  width: number,
  height: number,
  padding: number | { left: number; right: number; top: number; bottom: number },
  yMin: number,
  yMax: number,
): string {
  if (series.length === 0) return "";
  const pad = normalizePad(padding);
  const minDate = series[0].date;
  const maxDate = series[series.length - 1].date;
  return series
    .map((p) => {
      const { x, y } = plotPoint(
        dateXFraction(p.date, minDate, maxDate),
        p.value,
        width,
        height,
        pad,
        yMin,
        yMax,
      );
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
 * Map a horizontal fraction (0–1, from {@link dateXFraction}) + value into SVG
 * coordinates. Same geometry as {@link seriesPolyline}.
 */
export function plotPoint(
  xFraction: number,
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
  const f = Number.isFinite(xFraction) ? Math.min(1, Math.max(0, xFraction)) : 0.5;
  const x = padding.left + f * innerW;
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
