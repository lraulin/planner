"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AssetDebtPoint } from "@/lib/finances/analytics";
import { formatUsd, formatUsdCompact } from "@/lib/finances/money";

export function AssetDebtChart({
  points,
  onSelect,
}: {
  points: AssetDebtPoint[];
  onSelect?: (startKey: string, endKey: string) => void;
}) {
  if (points.length === 0) {
    return (
      <p className="rounded border border-dashed border-rule px-3 py-6 text-center text-[0.8125rem] text-ink-muted">
        No balances in this window.
      </p>
    );
  }

  const data = points.map((point) => ({
    label: point.bucket.label,
    startKey: point.bucket.startKey,
    endKey: point.bucket.endKey,
    assets: point.assetCents,
    debt: point.debtCents,
    net: point.netCents,
  }));

  return (
    <div className="h-56 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
          onClick={(state) => {
            const payload = (
              state as {
                activePayload?: { payload?: { startKey?: string; endKey?: string } }[];
              }
            ).activePayload?.[0]?.payload;
            if (payload?.startKey && payload.endKey) {
              onSelect?.(payload.startKey, payload.endKey);
            }
          }}
        >
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
              const row = payload[0]?.payload as {
                assets: number;
                debt: number;
                net: number;
              };
              return (
                <div className="rounded border border-rule bg-surface-raised px-2 py-1 text-[0.6875rem] text-ink shadow-sm">
                  <div className="font-medium">{label}</div>
                  <div>Assets {formatUsd(row.assets)}</div>
                  <div>Debt {formatUsd(row.debt)}</div>
                  <div>Net {formatUsd(row.net)}</div>
                </div>
              );
            }}
          />
          <Bar
            dataKey="assets"
            name="Assets"
            fill="var(--chart-income)"
            maxBarSize={22}
          />
          <Bar dataKey="debt" name="Debt" fill="var(--chart-spend)" maxBarSize={22} />
          <Line
            type="linear"
            dataKey="net"
            name="Net"
            stroke="var(--chart-average)"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
