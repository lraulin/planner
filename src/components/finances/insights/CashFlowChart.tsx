"use client";

import { useState } from "react";
import {
  bandSlots,
  barRect,
  labelIndices,
  niceTicks,
  plotPoint,
  yDomain,
} from "@/lib/metrics/derive";
import { formatUsd, formatUsdCompact } from "@/lib/finances/money";
import type { CashFlowPoint } from "@/lib/finances/analytics";
import type { InsightsChartMode } from "@/lib/settings/finances";
import { useIsCompact } from "@/components/shell/useIsCompact";

/**
 * Income against spending, one bar pair per bucket, with the trailing average over the top.
 *
 * Bars rather than a line because a month is a slot of time, not an instant: a line implies
 * a value between February and March, and there isn't one. Two bars side by side rather than
 * a stack because the question is which is bigger, and a stack answers a different one.
 *
 * The trailing average is a line **on the same axis** as the bars — never a second y-scale.
 * A dual axis lets any two series be made to cross wherever the author likes, which is
 * precisely the reassurance a spending chart must not manufacture.
 */

const WIDTH = 640;
const HEIGHT = 260;
const PAD = { left: 52, right: 18, top: 14, bottom: 30 };
/** Bigger text and fewer labels on a phone: the viewBox scales down to ~360px there, and
 * 9px type scaled by 0.56 is a grey smear. */
// The right pad is not decoration: the final x-label is centred on the last slot, and at
// compact type size "Aug 5" ran off the viewBox with a tighter one.
const COMPACT_PAD = { left: 62, right: 26, top: 16, bottom: 40 };

type Hovered = { index: number; x: number };

export function CashFlowChart({
  points,
  axisLabel,
  mode,
  onSelect,
  selectedKey,
}: {
  points: CashFlowPoint[];
  /** What one bucket is — "month" or "pay period" — for the accessible description. */
  axisLabel: string;
  mode: InsightsChartMode;
  onSelect?: (bucketKey: string, startKey: string, endKey: string) => void;
  selectedKey?: string | null;
}) {
  const compact = useIsCompact() ?? false;
  const [hovered, setHovered] = useState<Hovered | null>(null);

  const pad = compact ? COMPACT_PAD : PAD;
  const fontSize = compact ? 15 : 10;

  if (points.length === 0) {
    return (
      <p className="rounded border border-dashed border-rule px-3 py-6 text-center text-[0.8125rem] text-ink-muted">
        No transactions in this window.
      </p>
    );
  }

  const net = mode === "net";
  const split = mode === "fixed-variable";
  const values = net
    ? points.map((point) => point.netCents)
    : points.flatMap((point) => [point.incomeCents, point.spendCents]);
  // Bars are measured from zero, always. A truncated bar axis misstates every ratio drawn
  // on it, and this is a chart people will use to decide things.
  //
  // The floor is `min(0, …)` rather than a flat zero: a pay period with more refunds than
  // purchases has negative spend, and pinning the axis at zero drew that bar hanging below
  // the plot entirely.
  const domain = yDomain([0, ...values]);
  // The floor is the lowest *actual* value, not the padded domain: `yDomain` pads below its
  // minimum, which on an all-positive chart reserved a whole negative band for nothing and
  // squashed the bars into the top two thirds.
  const ticks = niceTicks(Math.min(0, ...values), domain.max, compact ? 4 : 5);
  const yMin = ticks[0] ?? Math.min(0, ...values);
  const yMax = ticks[ticks.length - 1] ?? domain.max;

  const slots = bandSlots(points.length, WIDTH, pad, 0.24);
  const gap = 1.5;
  // One bar per bucket in net mode; two side by side otherwise.
  const barWidth = net ? slots[0].width : Math.max(1, (slots[0].width - gap) / 2);

  const toY = (value: number) => plotPoint(0, value, WIDTH, HEIGHT, pad, yMin, yMax).y;
  const baselineY = toY(0);

  const labelled = new Set(labelIndices(points.length, compact ? 4 : 10));

  const trailing = points.map((point, index) => {
    const value = net ? point.trailingNetCents : point.trailingSpendCents;
    return value === null ? null : { x: slots[index].center, y: toY(value) };
  });
  // Split at the nulls: joining across a gap would draw an average through months that
  // never had one.
  const trailingRuns: { x: number; y: number }[][] = [];
  for (const entry of trailing) {
    if (entry === null) {
      if (trailingRuns[trailingRuns.length - 1]?.length) trailingRuns.push([]);
      continue;
    }
    if (trailingRuns.length === 0) trailingRuns.push([]);
    trailingRuns[trailingRuns.length - 1].push(entry);
  }

  const active = hovered ? points[hovered.index] : null;

  return (
    <div className="min-w-0">
      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full"
          role="img"
          aria-label={
            net
              ? `Net cash flow per ${axisLabel}`
              : split
                ? `Income against bills and other spending per ${axisLabel}`
                : `Income and spending per ${axisLabel}`
          }
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

          {points.map((point, index) => {
            const slot = slots[index];
            const income = barRect(
              { x: slot.x, width: barWidth },
              point.incomeCents,
              HEIGHT,
              pad,
              yMin,
              yMax,
            );
            const spend = barRect(
              { x: slot.x + barWidth + gap, width: barWidth },
              point.spendCents,
              HEIGHT,
              pad,
              yMin,
              yMax,
            );
            const netBar = barRect(
              { x: slot.x, width: barWidth },
              point.netCents,
              HEIGHT,
              pad,
              yMin,
              yMax,
            );
            const isActive =
              hovered?.index === index || selectedKey === point.bucket.startKey;
            return (
              <g
                key={point.bucket.key}
                // Hover for a mouse and tap for a finger, told apart by pointer type: a
                // touch that also synthesises mouse events would set the tooltip and clear
                // it in the same gesture.
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") {
                    setHovered({ index, x: slot.center });
                  }
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType === "mouse") setHovered(null);
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  setHovered((current) =>
                    current?.index === index ? null : { index, x: slot.center },
                  );
                  onSelect?.(
                    point.bucket.key,
                    point.bucket.startKey,
                    point.bucket.endKey,
                  );
                }}
              >
                {/* The hit area is the whole column, not the bars: a thin bar for a quiet
                    month is unhittable with a fingertip. */}
                <rect
                  x={slot.x - 2}
                  y={pad.top}
                  width={slot.width + 4}
                  height={HEIGHT - pad.top - pad.bottom}
                  fill={isActive ? "var(--select)" : "transparent"}
                  opacity={isActive ? 0.45 : 1}
                />
                {split ? (
                  <>
                    <rect {...income} fill="var(--chart-income)" rx={2} />
                    {/*
                      One quantity cut in two, so one hue cut by lightness rather than a
                      second hue: both halves are still money out. Bills sit on the baseline
                      because they are the part you cannot move, and the 2px inset keeps the
                      two segments from reading as one block.
                    */}
                    <rect
                      x={spend.x}
                      width={spend.width}
                      y={toY(point.fixedCents)}
                      height={Math.max(0, baselineY - toY(point.fixedCents))}
                      fill="var(--chart-spend)"
                      rx={2}
                    />
                    <rect
                      x={spend.x}
                      width={spend.width}
                      y={toY(point.spendCents)}
                      height={Math.max(
                        0,
                        toY(point.fixedCents) - toY(point.spendCents) - 2,
                      )}
                      fill="var(--chart-spend)"
                      opacity={0.45}
                      rx={2}
                    />
                  </>
                ) : net ? (
                  // Sign carries the meaning, so the hue follows it: a surplus is drawn in
                  // the money-in colour above the line, a shortfall in the money-out colour
                  // below it. Position and colour agree rather than competing.
                  <rect
                    {...netBar}
                    fill={
                      point.netCents < 0 ? "var(--chart-spend)" : "var(--chart-income)"
                    }
                    rx={2}
                  />
                ) : (
                  <>
                    <rect {...income} fill="var(--chart-income)" rx={2} />
                    <rect {...spend} fill="var(--chart-spend)" rx={2} />
                  </>
                )}
              </g>
            );
          })}

          <line
            x1={pad.left}
            x2={WIDTH - pad.right}
            y1={baselineY}
            y2={baselineY}
            stroke="var(--rule-strong)"
            strokeWidth={1}
          />

          {trailingRuns.map((run, index) =>
            run.length < 2 ? null : (
              <polyline
                key={`trailing-${index}`}
                fill="none"
                stroke="var(--chart-average)"
                strokeWidth={2}
                strokeLinejoin="round"
                points={run.map((point) => `${point.x},${point.y}`).join(" ")}
              />
            ),
          )}

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

        {active && hovered && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded border border-rule bg-surface-raised px-2 py-1 text-[0.6875rem] whitespace-nowrap text-ink shadow-sm"
            style={{
              // Clamped so a tooltip on the first or last bucket stays inside the plot.
              left: `${Math.min(82, Math.max(18, (hovered.x / WIDTH) * 100))}%`,
              top: 4,
            }}
          >
            <div className="font-medium">{active.bucket.label}</div>
            {net ? (
              <>
                <div
                  style={{
                    color:
                      active.netCents < 0
                        ? "var(--chart-spend)"
                        : "var(--chart-income)",
                  }}
                >
                  Net {formatUsd(active.netCents)}
                </div>
                <div className="text-ink-muted">
                  In {formatUsd(active.incomeCents)} · out{" "}
                  {formatUsd(active.spendCents)}
                </div>
                {active.trailingNetCents !== null && (
                  <div className="text-ink-muted">
                    Avg net {formatUsd(active.trailingNetCents)}
                  </div>
                )}
              </>
            ) : (
              <>
                <div>In {formatUsd(active.incomeCents)}</div>
                <div>Out {formatUsd(active.spendCents)}</div>
                {split && (
                  <div className="text-ink-muted">
                    Bills {formatUsd(active.fixedCents)} · rest{" "}
                    {formatUsd(active.variableCents)}
                  </div>
                )}
                <div className="text-ink-muted">Net {formatUsd(active.netCents)}</div>
                {active.trailingSpendCents !== null && (
                  <div className="text-ink-muted">
                    Avg out {formatUsd(active.trailingSpendCents)}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <ChartLegend
        items={
          net
            ? [
                { color: "var(--chart-income)", label: "Gained" },
                { color: "var(--chart-spend)", label: "Lost" },
                {
                  color: "var(--chart-average)",
                  label: "Trailing average net",
                  line: true,
                },
              ]
            : split
              ? [
                  { color: "var(--chart-income)", label: "Money in" },
                  { color: "var(--chart-spend)", label: "Bills" },
                  {
                    color: "var(--chart-spend)",
                    label: "Everything else",
                    faded: true,
                  },
                  {
                    color: "var(--chart-average)",
                    label: "Trailing average out",
                    line: true,
                  },
                ]
              : [
                  { color: "var(--chart-income)", label: "Money in" },
                  { color: "var(--chart-spend)", label: "Money out" },
                  {
                    color: "var(--chart-average)",
                    label: "Trailing average out",
                    line: true,
                  },
                ]
        }
      />
    </div>
  );
}

/**
 * Identity is never colour alone — the legend is always present for more than one series,
 * and its text wears ink tokens so the swatch is the only thing carrying the hue.
 */
export function ChartLegend({
  items,
}: {
  items: { color: string; label: string; line?: boolean; faded?: boolean }[];
}) {
  return (
    <div className="mt-2 flex flex-wrap justify-end gap-x-4 gap-y-1 text-[0.75rem] text-ink-muted">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span
            className={
              item.line
                ? "inline-block h-0.5 w-4"
                : "inline-block h-2.5 w-2.5 rounded-[2px]"
            }
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}
