"use client";

import { useMemo, useState } from "react";
import {
  axisIndices,
  chartPoints,
  formatChartDate,
  niceTicks,
  plotPoint,
  seriesPolyline,
  yDomain,
} from "@/lib/metrics/derive";
import { formatMetricNumber } from "@/lib/metrics/parse";
import type { MetricEntryView, MetricType } from "@/lib/metrics/types";

const CHART_WIDTH = 640;
const CHART_HEIGHT = 240;
/** Room for axis labels (left Y values, bottom X dates). */
const CHART_PAD = { left: 44, right: 16, top: 20, bottom: 28 };

/**
 * Actual vs objective performance graph — pure SVG, no chart library.
 * Markers with hover tooltips; Y/X axes labeled at regular intervals (Achieve-style).
 * Fills its parent height so the Metrics split can resize the pane.
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
}: {
  title: string;
  question: string;
  units: string;
  entries: MetricEntryView[];
  objectiveTarget: number | null;
  metricType?: MetricType;
  showLegend?: boolean;
  showObjective?: boolean;
}) {
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

  const actualLine = seriesPolyline(
    values,
    CHART_WIDTH,
    CHART_HEIGHT,
    CHART_PAD,
    yMin,
    yMax,
  );

  const plotted = points.map((p, i) => ({
    ...p,
    ...plotPoint(
      i,
      points.length,
      p.value,
      CHART_WIDTH,
      CHART_HEIGHT,
      CHART_PAD,
      yMin,
      yMax,
    ),
  }));

  const xTickIndices = axisIndices(points.length, 6);

  const objectiveY =
    showObjective && objectiveTarget !== null && Number.isFinite(objectiveTarget)
      ? plotPoint(
          0,
          1,
          objectiveTarget,
          CHART_WIDTH,
          CHART_HEIGHT,
          CHART_PAD,
          yMin,
          yMax,
        ).y
      : null;

  if (points.length === 0) {
    return (
      <div className="flex h-full min-h-[8rem] items-center justify-center rounded border border-rule bg-surface-raised text-[0.8125rem] text-ink-muted">
        No tracking values yet — add entries on the Tracking tab.
      </div>
    );
  }

  const caption = [
    title ? `Metric: ${title}` : null,
    question ? `Question: ${question}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const hoverPoint = hover ? plotted[hover.index] : null;

  return (
    <div className="flex h-full min-h-0 flex-col rounded border border-rule bg-surface p-3">
      {caption && (
        <p className="mb-2 flex-none text-center text-[0.8125rem] font-medium text-ink">
          {caption}
        </p>
      )}
      <div className="relative min-h-0 w-full flex-1 overflow-hidden">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          className="h-full w-full min-h-[6rem] text-ink"
          role="img"
          aria-label={caption || "Metric performance"}
        >
          {yTicks.map((tick) => {
            const y = plotPoint(
              0,
              1,
              tick,
              CHART_WIDTH,
              CHART_HEIGHT,
              CHART_PAD,
              yMin,
              yMax,
            ).y;
            return (
              <g key={`y-${tick}`}>
                <line
                  x1={CHART_PAD.left}
                  x2={CHART_WIDTH - CHART_PAD.right}
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

          {xTickIndices.map((i) => {
            const pt = plotted[i];
            if (!pt) return null;
            return (
              <g key={`x-${i}`}>
                <line
                  x1={pt.x}
                  x2={pt.x}
                  y1={CHART_HEIGHT - CHART_PAD.bottom}
                  y2={CHART_HEIGHT - CHART_PAD.bottom + 4}
                  stroke="var(--rule)"
                  strokeWidth={1}
                />
                <text
                  x={pt.x}
                  y={CHART_HEIGHT - 8}
                  textAnchor="middle"
                  className="fill-ink-faint"
                  style={{ fontSize: 8 }}
                >
                  {formatChartDate(pt.date)}
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
              x2={CHART_WIDTH - CHART_PAD.right}
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
              onMouseEnter={() => setHover({ index: i, x: pt.x, y: pt.y })}
              onMouseLeave={() => setHover(null)}
              className="cursor-default"
            >
              <circle cx={pt.x} cy={pt.y} r={10} fill="transparent" />
              <circle
                cx={pt.x}
                cy={pt.y}
                r={hover?.index === i ? 4.5 : 3}
                fill="#3b5bdb"
                stroke="var(--surface, #fff)"
                strokeWidth={1}
              />
              <title>
                {formatChartDate(pt.date)}: {formatMetricNumber(pt.value)}
                {units ? ` ${units}` : ""}
                {pt.target != null ? ` (target ${formatMetricNumber(pt.target)})` : ""}
              </title>
            </g>
          ))}
        </svg>

        {hoverPoint && hover && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded border border-rule bg-surface-raised px-2 py-1 text-[0.6875rem] text-ink shadow-sm"
            style={{
              left: `${(hover.x / CHART_WIDTH) * 100}%`,
              top: `${(hover.y / CHART_HEIGHT) * 100}%`,
              marginTop: -8,
            }}
          >
            <div className="font-medium">{formatChartDate(hoverPoint.date)}</div>
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
