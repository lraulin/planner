"use client";

import { useMemo, useState } from "react";
import {
  chartPoints,
  dateXFraction,
  niceTicks,
  niceTimeTicks,
  plotPoint,
  seriesPolyline,
  yDomain,
} from "@/lib/metrics/derive";
import { useDateFormatter } from "@/components/settings/SettingsProvider";
import { formatMetricNumber } from "@/lib/metrics/parse";
import type { MetricEntryView, MetricType } from "@/lib/metrics/types";
import { useElementSize } from "@/components/useElementSize";

/** The drawing's size until the pane has been measured; after that it is the pane's own. */
const CHART_WIDTH = 640;
const CHART_HEIGHT = 240;
/** Room for axis labels (left Y values, bottom X dates). */
const CHART_PAD = { left: 44, right: 16, top: 20, bottom: 28 };

/** Keeps a centred tooltip's own width inside the plot at either end of the series. */
function clampPercent(percent: number): number {
  return Math.min(80, Math.max(20, percent));
}

/** How many date labels fit along the bottom axis before they collide. */
const X_TICKS = 14;
const X_TICKS_COMPACT = 5;
/** Horizontal room one date label needs, in px, so a narrow pane asks for fewer of them. */
const X_TICK_SPACING = 48;

/**
 * Actual vs objective performance graph — pure SVG, no chart library.
 * X is linear in calendar time (each day the same width); Y is linear in value.
 * Markers with hover tooltips; axes labeled at regular intervals (Achieve-style).
 * Fills its parent height so the Metrics split can resize the pane, and draws in that pane's
 * own pixels. A fixed viewBox stretched with `preserveAspectRatio="none"` scales x and y by
 * different amounts — at 1500×156 every axis label rendered 3.6× wider than tall and every
 * marker was an ellipse — so the coordinate system is the measured box instead.
 *
 * `compact` is the phone: fewer date labels (fourteen of them overlap into a grey smear at
 * 390px), fatter marker hit areas, and **tap** to read a point. A `<title>` tooltip and a
 * hover state are both mouse-only, and `responsive.md` is explicit that nothing may be
 * reachable by hover alone.
 */
export function MetricChart({
  title,
  question,
  units,
  entries,
  objectiveTarget,
  metricType = "total",
  showLegend = true,
  showObjective = true,
  compact = false,
}: {
  title: string;
  question: string;
  units: string;
  entries: MetricEntryView[];
  objectiveTarget: number | null;
  metricType?: MetricType;
  showLegend?: boolean;
  showObjective?: boolean;
  compact?: boolean;
}) {
  const formatDate = useDateFormatter();
  const { ref: plotRef, size } = useElementSize<HTMLDivElement>();
  const width = size ? Math.max(1, Math.round(size.width)) : CHART_WIDTH;
  const height = size ? Math.max(1, Math.round(size.height)) : CHART_HEIGHT;
  const [hover, setHover] = useState<{
    index: number;
    x: number;
    y: number;
  } | null>(null);

  const points = useMemo(
    () => chartPoints(entries, objectiveTarget, metricType),
    [entries, objectiveTarget, metricType],
  );

  const values = points.map((p) => p.value);
  const rawDomain = yDomain(values, showObjective ? objectiveTarget : null);
  const yTicks = niceTicks(rawDomain.min, rawDomain.max, 5);
  const yMin = yTicks[0] ?? rawDomain.min;
  const yMax = yTicks[yTicks.length - 1] ?? rawDomain.max;

  const minDate = points[0]?.date ?? "";
  const maxDate = points[points.length - 1]?.date ?? minDate;

  const actualLine = seriesPolyline(points, width, height, CHART_PAD, yMin, yMax);

  const plotted = points.map((p) => ({
    ...p,
    ...plotPoint(
      dateXFraction(p.date, minDate, maxDate),
      p.value,
      width,
      height,
      CHART_PAD,
      yMin,
      yMax,
    ),
  }));

  // Calendar-aligned labels (days/months/years by span) — not sample dates.
  const xTicks = minDate
    ? niceTimeTicks(
        minDate,
        maxDate,
        Math.max(
          2,
          Math.min(
            compact ? X_TICKS_COMPACT : X_TICKS,
            Math.floor((width - CHART_PAD.left - CHART_PAD.right) / X_TICK_SPACING),
          ),
        ),
      )
    : [];

  const objectiveY =
    showObjective && objectiveTarget !== null && Number.isFinite(objectiveTarget)
      ? plotPoint(0, objectiveTarget, width, height, CHART_PAD, yMin, yMax).y
      : null;

  if (points.length === 0) {
    return (
      <div className="flex h-full min-h-[8rem] items-center justify-center rounded border border-rule bg-surface-raised text-[0.8125rem] text-ink-muted">
        No tracking values yet — add entries on the Tracking tab.
      </div>
    );
  }

  const label = [
    title ? `Metric: ${title}` : null,
    question ? `Question: ${question}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  // The question is a sentence; on a 200px-tall pane it wraps to three lines and eats the
  // graph. The title alone still says which metric this is, and the question is on the form.
  const caption = compact ? title : label;

  const hoverPoint = hover ? plotted[hover.index] : null;

  return (
    <div className="flex h-full min-h-0 flex-col rounded border border-rule bg-surface p-2 md:p-3">
      {caption && (
        <p className="mb-1 flex-none truncate text-center text-[0.8125rem] font-medium text-ink md:mb-2 md:whitespace-normal">
          {caption}
        </p>
      )}
      <div
        ref={plotRef}
        className="relative min-h-[6rem] w-full flex-1 overflow-hidden"
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="absolute inset-0 h-full w-full text-ink"
          role="img"
          aria-label={label || "Metric performance"}
          // Tapping the plot anywhere but a marker puts the tooltip away. Markers stop this
          // from firing, so the two do not fight over the same tap.
          onPointerDown={() => setHover(null)}
        >
          {yTicks.map((tick) => {
            const y = plotPoint(0, tick, width, height, CHART_PAD, yMin, yMax).y;
            return (
              <g key={`y-${tick}`}>
                <line
                  x1={CHART_PAD.left}
                  x2={width - CHART_PAD.right}
                  y1={y}
                  y2={y}
                  stroke="var(--rule)"
                  strokeWidth={1}
                />
                <text
                  x={CHART_PAD.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-ink-muted"
                  style={{ fontSize: 9 }}
                >
                  {formatMetricNumber(tick)}
                </text>
              </g>
            );
          })}

          {xTicks.map((tick) => {
            const x = plotPoint(
              dateXFraction(tick.dateKey, minDate, maxDate),
              yMin,
              width,
              height,
              CHART_PAD,
              yMin,
              yMax,
            ).x;
            return (
              <g key={`x-${tick.dateKey}-${tick.label}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={height - CHART_PAD.bottom}
                  y2={height - CHART_PAD.bottom + (tick.major ? 5 : 3)}
                  stroke="var(--rule)"
                  strokeWidth={tick.major ? 1.25 : 1}
                />
                <text
                  x={x}
                  y={height - 8}
                  textAnchor="middle"
                  className={tick.major ? "fill-ink-muted" : "fill-ink-faint"}
                  style={{
                    fontSize: tick.major ? 9 : 8,
                    fontWeight: tick.major ? 600 : 400,
                  }}
                >
                  {tick.label}
                </text>
              </g>
            );
          })}

          {units && (
            <text
              x={CHART_PAD.left}
              y={12}
              className="fill-ink-faint"
              style={{ fontSize: 9 }}
            >
              {units}
            </text>
          )}

          {objectiveY !== null && (
            <line
              x1={CHART_PAD.left}
              x2={width - CHART_PAD.right}
              y1={objectiveY}
              y2={objectiveY}
              stroke="#6aab6a"
              strokeWidth={1.5}
            />
          )}

          {actualLine && (
            <polyline
              fill="none"
              stroke="#3b5bdb"
              strokeWidth={1.75}
              points={actualLine}
            />
          )}

          {plotted.map((pt, i) => (
            <g
              key={`pt-${pt.date}-${i}`}
              // Hover for a mouse, tap for a finger. `pointerType` rather than two separate
              // event families: a touch that also synthesises mouse events would otherwise
              // set the tooltip and immediately clear it again.
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") {
                  setHover({ index: i, x: pt.x, y: pt.y });
                }
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") setHover(null);
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                setHover((current) =>
                  current?.index === i ? null : { index: i, x: pt.x, y: pt.y },
                );
              }}
              className="cursor-default"
            >
              {/*
                The hit area, not the dot. Wider on a phone: the visible marker is 3px and a
                fingertip is not.
              */}
              <circle cx={pt.x} cy={pt.y} r={compact ? 18 : 10} fill="transparent" />
              <circle
                cx={pt.x}
                cy={pt.y}
                r={hover?.index === i ? (compact ? 6 : 4.5) : compact ? 4 : 3}
                fill="#3b5bdb"
                stroke="var(--surface, #fff)"
                strokeWidth={1}
              />
              <title>
                {formatDate(pt.date)}: {formatMetricNumber(pt.value)}
                {units ? ` ${units}` : ""}
                {pt.target != null ? ` (target ${formatMetricNumber(pt.target)})` : ""}
              </title>
            </g>
          ))}
        </svg>

        {hoverPoint && hover && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded border border-rule bg-surface-raised px-2 py-1 text-[0.6875rem] whitespace-nowrap text-ink shadow-sm"
            style={{
              // Clamped inside the plot: a tooltip centred on the first or last point hangs
              // off the edge, and there is no room to hang off at 390px.
              left: `${clampPercent((hover.x / width) * 100)}%`,
              top: `${(hover.y / height) * 100}%`,
              marginTop: -8,
            }}
          >
            <div className="font-medium">{formatDate(hoverPoint.date)}</div>
            <div>
              {formatMetricNumber(hoverPoint.value)}
              {units ? ` ${units}` : ""}
            </div>
            {hoverPoint.target != null && (
              <div className="text-ink-muted">
                Target {formatMetricNumber(hoverPoint.target)}
              </div>
            )}
          </div>
        )}
      </div>
      {showLegend && (
        <div className="mt-1 flex flex-none justify-end gap-4 text-[0.75rem] text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-[#3b5bdb]" /> Actual
          </span>
          {showObjective && objectiveTarget !== null && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-[#6aab6a]" /> Target
            </span>
          )}
        </div>
      )}
    </div>
  );
}
