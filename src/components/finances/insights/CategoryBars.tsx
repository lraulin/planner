"use client";

import type { CategoryTotal } from "@/lib/finances/analytics";
import { RankedBars } from "./RankedBars";

/**
 * Where the money went, as a ranked bar list.
 *
 * Deliberately not a pie or a stacked bar. The question is "which of these is biggest, and
 * by how much", and length along a common baseline is the one encoding people read
 * accurately — angles and stacked segments are not. Ranking also means no categorical
 * palette is needed at all: position carries identity, so one hue does.
 */
export function CategoryBars({
  totals,
  onSelect,
  selected,
  limit = 12,
}: {
  totals: CategoryTotal[];
  onSelect?: (category: string) => void;
  selected?: string | null;
  limit?: number;
}) {
  return (
    <RankedBars
      items={totals.map((entry) => ({
        key: entry.category,
        label: entry.category,
        cents: entry.cents,
        share: entry.share,
      }))}
      onSelect={onSelect}
      selected={selected}
      restNoun={totals.length === 1 ? "smaller category" : "smaller categories"}
      limit={limit}
    />
  );
}
