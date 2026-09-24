/**
 * Which days a bank-page paste read completely, so a statement file fills only what no paste
 * covered (`agent-os/specs/2026-09-23-1316-one-history-source-per-account/` D7).
 *
 * Ranges are inclusive calendar days on the **posting** axis: a statement cycle is bounded by
 * the day a charge posted, not the day it was made. Pure — the apply reads and writes the
 * table, this decides what belongs in it.
 */

import { localDateKey, shiftDateKey } from "@/lib/schedule/geometry";
import { shiftDateKeyMonths } from "./recurringBills";

export type CoverageRange = { fromDay: string; throughDay: string };

/** The day a row posted; a pending row has none and is never coverage evidence. */
function postingDay(row: {
  postedDate: string | null;
  transactionDate: string;
}): string {
  return row.postedDate ?? row.transactionDate;
}

/**
 * The first day of the statement that closed on `closedOn`.
 *
 * A stored statement says so outright. Otherwise the previous close is the same day of the
 * month one month earlier — Capital One's close day is fixed — and the statement starts the
 * day after it.
 */
export function statementStart(closedOn: string, storedStart: string | null): string {
  return storedStart ?? shiftDateKey(shiftDateKeyMonths(closedOn, -1), 1);
}

/**
 * The ranges one complete paste read: the closed statement when the capture carried it, and
 * the current cycle up to the day **before** the capture.
 *
 * The capture day itself is never covered: a charge can still post later that day, and a
 * statement file is the backstop for it when no later paste comes. A closed statement is
 * covered whole, since nothing more can post to it.
 *
 * The current cycle starts the day after the closed statement ended. Without one, the
 * earliest posted row stands in: the page is complete, so no charge can sit before it.
 */
export function capturedRanges(
  snapshot: {
    capturedAt: Date;
    posted: readonly { postedDate: string | null; transactionDate: string }[];
    recentStatementClosedOn: string | null;
  },
  storedClosedStart: string | null,
): CoverageRange[] {
  const capturedDay = localDateKey(snapshot.capturedAt);
  const closedOn = snapshot.recentStatementClosedOn;

  const ranges: CoverageRange[] = [];
  let cycleStart: string;
  if (closedOn !== null) {
    ranges.push({
      fromDay: statementStart(closedOn, storedClosedStart),
      throughDay: closedOn,
    });
    cycleStart = shiftDateKey(closedOn, 1);
  } else {
    const days = snapshot.posted.map(postingDay).sort();
    cycleStart = days[0] ?? capturedDay;
  }
  const lastCompleteDay = shiftDateKey(capturedDay, -1);
  if (cycleStart <= lastCompleteDay)
    ranges.push({ fromDay: cycleStart, throughDay: lastCompleteDay });
  return ranges;
}

/**
 * What to do to the stored ranges so `incoming` is recorded once: skip one already inside a
 * stored range, and absorb any stored range the new one contains. A cycle read on Tuesday is
 * simply extended by the paste on Friday rather than piling up a row per paste.
 */
export function planCoverage(
  stored: readonly (CoverageRange & { id: string })[],
  incoming: readonly CoverageRange[],
): { insert: CoverageRange[]; removeIds: string[] } {
  const insert: CoverageRange[] = [];
  const removeIds = new Set<string>();
  for (const range of incoming) {
    const covered = [...stored, ...insert.map((r) => ({ ...r, id: "" }))].some(
      (other) => other.fromDay <= range.fromDay && other.throughDay >= range.throughDay,
    );
    if (covered) continue;
    for (const other of stored) {
      if (range.fromDay <= other.fromDay && range.throughDay >= other.throughDay) {
        removeIds.add(other.id);
      }
    }
    insert.push(range);
  }
  return { insert, removeIds: [...removeIds] };
}

/** True when `day` falls inside any range. */
export function isCovered(day: string, ranges: readonly CoverageRange[]): boolean {
  return ranges.some((range) => range.fromDay <= day && day <= range.throughDay);
}

/**
 * The statement-file rows that may be inserted into an account, given who authors its history
 * (D7). A bank-page account takes a file row only for a day no paste read completely and after
 * its cutover — before that the previous source already holds the day. Any other account takes
 * every row, and the ordinary duplicate matching decides.
 */
export function rowsAFileMayAuthor<
  T extends { postedDate: string | null; transactionDate: string },
>(
  rows: readonly T[],
  account: { historySource: string; historySourceSince: string | null },
  covered: readonly CoverageRange[],
): { keep: T[]; withheld: number } {
  if (account.historySource !== "bank_page") return { keep: [...rows], withheld: 0 };
  const keep = rows.filter((row) => {
    const day = postingDay(row);
    if (account.historySourceSince !== null && day <= account.historySourceSince)
      return false;
    return !isCovered(day, covered);
  });
  return { keep, withheld: rows.length - keep.length };
}
