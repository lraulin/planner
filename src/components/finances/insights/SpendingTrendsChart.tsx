"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CategoryBucketTotal } from "@/lib/finances/analytics";
import { TREND_OTHER } from "@/lib/finances/analytics";
import { formatUsd, formatUsdCompact } from "@/lib/finances/money";
import { ChartLegend } from "./CashFlowChart";
import { chartCatVar } from "./chartColors";

export function SpendingTrendsChart({
  keys,
  points,
  mode,
  onSelect,
}: {
  keys: string[];
  points: CategoryBucketTotal[];
  mode: "stacked" | "grouped";
  onSelect?: (category: string, startKey: string, endKey: string) => void;
}) {
  if (points.length === 0 || keys.length === 0) {
    return (
      <p className="rounded border border-dashed border-rule px-3 py-6 text-center text-[0.8125rem] text-ink-muted">
        No spending in this window.
      </p>
    );
  }

  const data = points.map((point) => ({
    label: point.bucket.label,
    startKey: point.bucket.startKey,
    endKey: point.bucket.endKey,
    ...point.byCategory,
  }));

  return (
    <div className="flex w-full min-w-0 flex-col">
      <div className="h-64 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid stroke="var(--rule)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--ink-muted)", fontSize: 10 }}
              axisLine={{ stroke: "var(--rule)" }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(value: number) => formatUsdCompact(value)}
              tick={{ fill: "var(--ink-muted)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ fill: "var(--select)", opacity: 0.45 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded border border-rule bg-surface-raised px-2 py-1 text-[0.6875rem] text-ink shadow-sm">
                    <div className="font-medium">{label}</div>
                    {payload.map((entry) => (
                      <div key={String(entry.dataKey)}>
                        {entry.name} {formatUsd(Number(entry.value ?? 0))}
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            {keys.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                name={key}
                stackId={mode === "stacked" ? "spend" : undefined}
                fill={key === TREND_OTHER ? "var(--chart-cat-8)" : chartCatVar(index)}
                maxBarSize={mode === "grouped" ? 18 : 32}
                onClick={() => onSelect?.(key, "", "")}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        items={keys.map((key, index) => ({
          color: key === TREND_OTHER ? "var(--chart-cat-8)" : chartCatVar(index),
          label: key,
        }))}
      />
    </div>
  );
}
