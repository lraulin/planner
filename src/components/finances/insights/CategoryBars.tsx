"use client";

import type { CategoryTotal } from "@/lib/finances/analytics";
import { formatUsd } from "@/lib/finances/money";

/**
 * Where the money went, as a ranked bar list.
 *
 * Deliberately not a pie or a stacked bar. The question is "which of these is biggest, and
 * by how much", and length along a common baseline is the one encoding people read
 * accurately — angles and stacked segments are not. Ranking also means no categorical
 * palette is needed at all: position carries identity, so one hue does, and the app does
 * not acquire a second colour system for a list that is already sorted.
 *
 * Every bar is directly labelled, so nothing here depends on colour.
 */
export function CategoryBars({
  totals,
  limit = 12,
}: {
  totals: CategoryTotal[];
  limit?: number;
}) {
  if (totals.length === 0) {
    return (
      <p className="rounded border border-dashed border-rule px-3 py-4 text-center text-[0.8125rem] text-ink-muted">
        No spending in this window.
      </p>
    );
  }

  const shown = totals.slice(0, limit);
  const rest = totals.slice(limit);
  const restCents = rest.reduce((total, entry) => total + entry.cents, 0);
  // Scale to the largest bar rather than to the total: at 40% of spend, a bar drawn as 40%
  // of the width wastes half the panel and makes the small categories unreadable.
  const largest = shown[0]?.cents || 1;

  return (
    <ul className="flex flex-col gap-1.5">
      {shown.map((entry) => (
        <li key={entry.category} className="min-w-0">
          <div className="flex items-baseline justify-between gap-2 text-[0.8125rem]">
            <span className="truncate text-ink">{entry.category}</span>
            <span className="tabular flex-none text-ink">{formatUsd(entry.cents)}</span>
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
        </li>
      ))}
      {rest.length > 0 && (
        <li className="flex items-baseline justify-between gap-2 border-t border-rule pt-1.5 text-[0.8125rem] text-ink-muted">
          <span>
            {rest.length} smaller {rest.length === 1 ? "category" : "categories"}
          </span>
          <span className="tabular">{formatUsd(restCents)}</span>
        </li>
      )}
    </ul>
  );
}
