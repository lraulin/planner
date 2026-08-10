import { formatDateKey, type DateFormatId } from "@/lib/dateFormat";
import { formatMetricNumber } from "./parse";
import type { MetricListRow } from "./types";

/**
 * What a metric row says on a phone.
 *
 * The desktop list is eight columns; a 390px row has a title line and one line of meta under
 * it. Something has to choose what survives, and — as in `grid/compactFields.ts` — that choice
 * is the part that can be quietly wrong: a mis-picked chip looks entirely plausible in review
 * and only shows up as "why can't I tell which of these is overdue on my phone".
 *
 * Question and Owner are deliberately not here. Question is a sentence (it does not fit on a
 * chip line and truncates to nothing useful) and Owner is the group header when Group by Owner
 * is on. Both are one tap away in the metric sheet.
 */

/** How many chips fit on one line at 390px before the line starts eliding. Matches the grid. */
export const MAX_META_CHIPS = 3;

/**
 * Priority as the desktop Pri column spells it: letter, or letter+rank when ranked.
 * Shared with the desktop tables so the two cannot drift.
 */
export function metricPriorityText(
  row: Pick<MetricListRow, "priorityLetter" | "priorityRank">,
): string {
  if (row.priorityLetter == null) return "";
  return row.priorityRank != null
    ? `${row.priorityLetter}${row.priorityRank}`
    : row.priorityLetter;
}

function withUnits(text: string, units: string): string {
  const trimmed = units.trim();
  return trimmed === "" ? text : `${text} ${trimmed}`;
}

/**
 * The meta line, in priority order, capped at {@link MAX_META_CHIPS}.
 *
 * 1. **Inactive** — only when it is, because Active only is a switch the user can turn off and
 *    an inactive metric in a list of active ones has to say so.
 * 2. **Current value** — the number the metric exists to report. Bare, because it is the one
 *    the eye should land on; everything else is labelled.
 * 3. **Target** — labelled, so it cannot be mistaken for the value beside it.
 * 4. **Category** — the weakest, and the first to fall off the end.
 */
export function metricMetaChips(
  row: Pick<
    MetricListRow,
    "active" | "lastValue" | "objectiveTarget" | "units" | "category"
  >,
): string[] {
  const chips: string[] = [];

  if (!row.active) chips.push("Inactive");

  chips.push(
    row.lastValue != null
      ? withUnits(formatMetricNumber(row.lastValue), row.units)
      : "No entries",
  );

  if (row.objectiveTarget != null) {
    chips.push(
      `Target ${withUnits(formatMetricNumber(row.objectiveTarget), row.units)}`,
    );
  }

  const category = row.category.trim();
  if (category !== "") chips.push(category);

  return chips.slice(0, MAX_META_CHIPS);
}

/**
 * The date of the current value, for the right edge of the title line.
 *
 * It sits out of the chip line because it is the one field that answers "is this stale?", and
 * at the end of a truncating run of chips that is exactly the question that stops being
 * answerable.
 */
export function metricTrailingDate(
  row: Pick<MetricListRow, "lastDate">,
  dateFormat: DateFormatId,
): string | null {
  return row.lastDate ? formatDateKey(row.lastDate, dateFormat) : null;
}
