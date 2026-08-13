"use client";

import { useState } from "react";
import {
  areaPolygon,
  bandSlots,
  labelIndices,
  niceTicks,
  plotPoint,
  yDomain,
} from "@/lib/metrics/derive";
import { formatUsd, formatUsdCompact } from "@/lib/finances/money";
import type { BalancePoint } from "@/lib/finances/analytics";
import { useIsCompact } from "@/components/shell/useIsCompact";

/**
 * Cash minus card debt across the window.
 *
 * A line, not bars: a balance genuinely does exist between two month-ends, so joining the
 * points asserts something true. The fill under it is there to make the zero crossing
 * obvious — the difference between "$400 in hand" and "$400 owed" should not require
 * reading the axis.
 *
 * One series, so no legend: the panel title names it. Zero is always drawn.
 */

const WIDTH = 640;
const HEIGHT = 200;
const PAD = { left: 52, right: 18, top: 14, bottom: 28 };
// The right pad is not decoration: the final x-label is centred on the last slot, and at
// compact type size "Aug 5" ran off the viewBox with a tighter one.
const COMPACT_PAD = { left: 62, right: 26, top: 16, bottom: 38 };

export function BalanceChart({ points }: { points: BalancePoint[] }) {
  const compact = useIsCompact() ?? false;
  const [hovered, setHovered] = useState<number | null>(null);

  const pad = compact ? COMPACT_PAD : PAD;
  const fontSize = compact ? 15 : 10;

  if (points.length === 0) {
    return (
      <p className="rounded border border-dashed border-rule px-3 py-6 text-center text-[0.8125rem] text-ink-muted">
        No transactions in this window.
      </p>
    );
  }

  const balances = points.map((point) => point.balanceCents);
  // Zero is in the domain whether or not the data reaches it: an area chart that never
  // shows its own baseline hides which side of it you are on.
  const domain = yDomain([0, ...balances]);
  const ticks = niceTicks(domain.min, domain.max, compact ? 4 : 5);
  const yMin = ticks[0] ?? domain.min;
  const yMax = ticks[ticks.length - 1] ?? domain.max;

  const slots = bandSlots(points.length, WIDTH, pad, 0);
  const toY = (value: number) => plotPoint(0, value, WIDTH, HEIGHT, pad, yMin, yMax).y;
  const plotted = points.map((point, index) => ({
    x: slots[index].center,
    y: toY(point.balanceCents),
  }));
  const zeroY = toY(0);
  const labelled = new Set(labelIndices(points.length, compact ? 4 : 10));
  const active = hovered === null ? null : points[hovered];

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label="Tracked balance over time"
        onPointerDown={() => setHovered(null)}
      >
        {ticks.map((tick) => {
          const y = toY(tick);
          return (
            <g key={`y-${tick}`}>
              <line
                x1={pad.left}
                x2={WIDTH - pad.right}
                y1={y}
                y2={y}
                stroke="var(--rule)"
                strokeWidth={1}
              />
              <text
                x={pad.left - 6}
                y={y + fontSize / 3}
                textAnchor="end"
                className="fill-ink-muted"
                style={{ fontSize }}
              >
                {formatUsdCompact(tick)}
              </text>
            </g>
          );
        })}

        <polygon
          points={areaPolygon(plotted, zeroY)}
          fill="var(--chart-average)"
          opacity={0.14}
        />
        <line
          x1={pad.left}
          x2={WIDTH - pad.right}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--rule-strong)"
          strokeWidth={1}
        />
        <polyline
          fill="none"
          stroke="var(--chart-average)"
          strokeWidth={2}
          strokeLinejoin="round"
          points={plotted.map((point) => `${point.x},${point.y}`).join(" ")}
        />

        {plotted.map((point, index) => (
          <g
            key={points[index].bucket.key}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") setHovered(index);
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse") setHovered(null);
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              setHovered((current) => (current === index ? null : index));
            }}
          >
            <rect
              x={slots[index].x}
              y={pad.top}
              width={slots[index].width}
              height={HEIGHT - pad.top - pad.bottom}
              fill="transparent"
            />
            {hovered === index && (
              <circle
                cx={point.x}
                cy={point.y}
                r={4}
                fill="var(--chart-average)"
                stroke="var(--surface)"
                strokeWidth={2}
              />
            )}
          </g>
        ))}

        {points.map((point, index) =>
          labelled.has(index) ? (
            <text
              key={`x-${point.bucket.key}`}
              x={slots[index].center}
              y={HEIGHT - pad.bottom + fontSize + 4}
              textAnchor="middle"
              className="fill-ink-muted"
              style={{ fontSize }}
            >
              {point.bucket.label}
            </text>
          ) : null,
        )}
      </svg>

      {active && hovered !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded border border-rule bg-surface-raised px-2 py-1 text-[0.6875rem] whitespace-nowrap text-ink shadow-sm"
          style={{
            left: `${Math.min(82, Math.max(18, (plotted[hovered].x / WIDTH) * 100))}%`,
            top: 4,
          }}
        >
          <div className="font-medium">{active.bucket.label}</div>
          <div>{formatUsd(active.balanceCents)}</div>
        </div>
      )}
    </div>
  );
}
