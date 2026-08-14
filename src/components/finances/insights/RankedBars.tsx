"use client";

import { formatUsd } from "@/lib/finances/money";

export type RankedItem = {
  key: string;
  label: string;
  cents: number;
  share: number;
};

/**
 * A ranked bar list. Length along a common baseline is the encoding; one hue; the
 * label carries identity. Clicking a row drills.
 */
export function RankedBars({
  items,
  onSelect,
  selected,
  empty = "No spending in this window.",
  restNoun = "smaller",
  limit = 12,
}: {
  items: RankedItem[];
  onSelect?: (key: string) => void;
  selected?: string | null;
  empty?: string;
  restNoun?: string;
  limit?: number;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded border border-dashed border-rule px-3 py-4 text-center text-[0.8125rem] text-ink-muted">
        {empty}
      </p>
    );
  }

  const shown = items.slice(0, limit);
  const rest = items.slice(limit);
  const restCents = rest.reduce((total, entry) => total + entry.cents, 0);
  const largest = shown[0]?.cents || 1;

  return (
    <ul className="flex flex-col gap-1.5">
      {shown.map((entry) => {
        const isSelected = selected === entry.key;
        return (
          <li key={entry.key} className="min-w-0">
            <button
              type="button"
              onClick={() => onSelect?.(entry.key)}
              className={`flex w-full min-h-tap flex-col justify-center rounded px-1 py-0.5 text-left md:min-h-0 ${
                isSelected ? "bg-select" : "hover:bg-surface-raised"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2 text-[0.8125rem]">
                <span className="truncate text-ink">{entry.label}</span>
                <span className="tabular flex-none text-ink">
                  {formatUsd(entry.cents)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <div className="h-2 min-w-0 flex-1 rounded-[2px] bg-surface-raised">
                  <div
                    className="h-2 rounded-[2px]"
                    style={{
                      width: `${Math.max(1, (entry.cents / largest) * 100)}%`,
                      backgroundColor: "var(--chart-spend)",
                    }}
                  />
                </div>
                <span className="tabular w-10 flex-none text-right text-[0.6875rem] text-ink-muted">
                  {Math.round(entry.share * 100)}%
                </span>
              </div>
            </button>
          </li>
        );
      })}
      {rest.length > 0 && (
        <li className="flex items-baseline justify-between gap-2 border-t border-rule pt-1.5 text-[0.8125rem] text-ink-muted">
          <span>
            {rest.length} {restNoun}
          </span>
          <span className="tabular">{formatUsd(restCents)}</span>
        </li>
      )}
    </ul>
  );
}
