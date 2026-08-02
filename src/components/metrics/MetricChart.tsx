"use client";

import { useMemo } from "react";
import { chartPoints, seriesPolyline, yDomain } from "@/lib/metrics/derive";
import { formatMetricNumber } from "@/lib/metrics/parse";
import type { MetricEntryView, MetricType } from "@/lib/metrics/types";

/**
 * Actual vs objective performance graph — pure SVG, no chart library.
 * Mirrors Achieve's split-view graph under the Metrics list.
 * Cumulative metrics plot a running sum; instance/total plot raw values.
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
  const width = 640;
  const height = 220;
  const padding = 28;

  const points = useMemo(
    () => chartPoints(entries, objectiveTarget, metricType),
    [entries, objectiveTarget, metricType],
  );

  const values = points.map((p) => p.value);
  const domain = yDomain(values, showObjective ? objectiveTarget : null);
  const actualLine = seriesPolyline(
    values,
    width,
    height,
    padding,
    domain.min,
    domain.max,
  );

  const objectiveY =
    showObjective && objectiveTarget !== null && Number.isFinite(objectiveTarget)
      ? padding +
        (height - padding * 2) -
        ((objectiveTarget - domain.min) / (domain.max - domain.min || 1)) *
          (height - padding * 2)
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

  return (
    <div className="flex h-full min-h-0 flex-col rounded border border-rule bg-surface p-3">
      {caption && (
        <p className="mb-2 flex-none text-center text-[0.8125rem] font-medium text-ink">
          {caption}
        </p>
      )}
      <div className="relative min-h-0 w-full flex-1 overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="h-full w-full min-h-[6rem] text-ink"
          role="img"
          aria-label={caption || "Metric performance"}
        >
          {/* grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = padding + t * (height - padding * 2);
            return (
              <line
                key={t}
                x1={padding}
                x2={width - padding}
                y1={y}
                y2={y}
                stroke="var(--rule)"
                strokeWidth={1}
              />
            );
          })}
          {/* y labels */}
          <text
            x={4}
            y={padding + 4}
            className="fill-ink-muted"
            style={{ fontSize: 10 }}
          >
            {formatMetricNumber(domain.max)}
          </text>
          <text
            x={4}
            y={height - padding}
            className="fill-ink-muted"
            style={{ fontSize: 10 }}
          >
            {formatMetricNumber(domain.min)}
          </text>
          {units && (
            <text
              x={padding}
              y={14}
              className="fill-ink-faint"
              style={{ fontSize: 10 }}
            >
              {units}
            </text>
          )}
          {objectiveY !== null && (
            <line
              x1={padding}
              x2={width - padding}
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
          {/* end markers */}
          {points.length > 0 && (
            <>
              <text
                x={padding}
                y={height - 6}
                className="fill-ink-faint"
                style={{ fontSize: 9 }}
              >
                {points[0].date}
              </text>
              <text
                x={width - padding}
                y={height - 6}
                textAnchor="end"
                className="fill-ink-faint"
                style={{ fontSize: 9 }}
              >
                {points[points.length - 1].date}
              </text>
            </>
          )}
        </svg>
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
