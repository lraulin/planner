import { daysBetweenKeys } from "@/lib/schedule/geometry";
import { elapsedParts, formatElapsed } from "@/lib/timeline/elapsed";

/**
 * How long a job lasted or a residence was lived in — the Duration column on both grids.
 *
 * **Computed on the client, not in the query.** A span that has not ended is measured against
 * today, and the server does not know what day it is where the user is: `development/dates.md`
 * forbids a business rule that depends on the process `TZ`, and on Vercel that would be UTC.
 * `useToday()` supplies the key after hydration and `null` before it, so an ended span renders
 * its duration immediately and only an ongoing one waits a beat. That is the same shape
 * `agendaColumns.daysLeftOf` uses.
 *
 * `days` exists because `ColumnDef.sortValue` receives only the row, so a column cannot sort
 * on something derived from context. Agenda dodges this by sorting its days-left column on the
 * date, which works there because days-left is monotonic in the date. Duration is not — a
 * one-year job in 2000 and a ten-year job in 2010 sort the wrong way round — so the number has
 * to be on the row by the time the grid sees it.
 */

export type Span = {
  start: string | null;
  end: string | null;
};

export type SpanDuration = {
  /** `"3y 2m 14d"`, or null when there is nothing to measure yet. */
  text: string | null;
  /** Whole days, for sorting. Null whenever `text` is. */
  days: number | null;
  /** Still open — measured against today rather than against a stored end date. */
  ongoing: boolean;
};

const NOTHING_TO_MEASURE = { text: null, days: null } as const;

export function spanDuration(span: Span, todayKey: string | null): SpanDuration {
  const ongoing = Boolean(span.start) && !span.end;
  const end = span.end ?? todayKey;
  if (!span.start || !end) return { ...NOTHING_TO_MEASURE, ongoing };

  const parts = elapsedParts(span.start, end);
  // A start date in the future has no duration yet, which `elapsedParts` reports as null.
  if (!parts) return { ...NOTHING_TO_MEASURE, ongoing };

  return {
    text: formatElapsed(parts),
    days: daysBetweenKeys(span.start, end),
    ongoing,
  };
}
