/**
 * Decide what a sync should do to the local `appointments` mirror. Pure — no I/O.
 *
 * This module exists as its own pure unit because it is the only part of the feature that
 * **deletes rows**. The predicates guarding that sweep (below) are the difference between
 * "tidies up events Google no longer has" and "eats the user's calendar", and they are
 * cheap to get subtly wrong. Keeping them here means they can be tested exhaustively
 * without a network or a database.
 */

import { startOfWeek } from "@/lib/schedule/geometry";
import {
  googleEventToFields,
  type GoogleEvent,
  type GoogleOwnedFields,
} from "./mapping";

export type MirrorWindow = { start: Date; end: Date };

/** Never mirror a narrower slice than this, however few days are on screen. */
export const MIN_SYNC_DAYS = 28;

/**
 * The window to mirror while looking at a given range of days.
 *
 * Deliberately **not** the visible range. Freshness is time-based only — `syncIsStale`
 * records when each calendar was last read and nothing about what was read — so a window
 * that shrank to match a one-day view would report "fresh" five minutes later over the
 * nineteen days a twenty-day view had just asked for, and those days would draw empty.
 *
 * Rounding out to whole weeks with a four-week floor makes the window a function of
 * roughly *where* you are looking rather than *how much*, so changing the day count does
 * not change what has been fetched. Wider is cheap: it is one list request per calendar
 * either way, and `planMirror`'s sweep is correct for any window it is actually given.
 */
export function syncWindowFor(range: { start: Date; end: Date }): MirrorWindow {
  const start = startOfWeek(range.start, 0);
  const end = new Date(start);
  while (end < range.end || daysBetween(start, end) < MIN_SYNC_DAYS) {
    end.setDate(end.getDate() + 7);
  }
  return { start, end };
}

function daysBetween(from: Date, to: Date): number {
  // Rounded, not floored: local midnights are 23 or 25 hours apart across a DST boundary.
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

/** The columns the planner needs to reason about an existing row. */
export type LocalMirrorRow = {
  id: string;
  externalSource: string | null;
  externalId: string | null;
  externalCalendarId: string | null;
  externalEtag: string | null;
  /**
   * Google event palette id. Compared even when the etag matches so a newly tracked
   * Google-owned column (or a prior sync that never stored it) still backfills.
   */
  colorId: string | null;
  startAt: Date;
  endAt: Date;
};

export type RemoteEvent = { event: GoogleEvent; calendarId: string };

export type MirrorPlan = {
  toInsert: GoogleOwnedFields[];
  toUpdate: Array<{ id: string; fields: GoogleOwnedFields }>;
  /** Local row ids to delete — google-origin, in-window, on a calendar we just read. */
  toDelete: string[];
  /** Remote events that could not be mapped (cancelled, malformed). Reported, not applied. */
  skipped: number;
};

function overlapsWindow(row: LocalMirrorRow, window: MirrorWindow): boolean {
  return row.startAt < window.end && row.endAt > window.start;
}

/**
 * Build the insert/update/delete plan for one sync pass.
 *
 * `fetchedCalendarIds` must list only the calendars whose fetch actually **succeeded**.
 * That is what makes a partial failure safe: if two calendars are enabled and one request
 * throws, the caller passes just the one that returned, and the sweep leaves the other
 * calendar's rows alone instead of reading "Google didn't mention them" as "delete them".
 */
export function planMirror(
  local: LocalMirrorRow[],
  remote: RemoteEvent[],
  window: MirrorWindow,
  fetchedCalendarIds: string[],
): MirrorPlan {
  const fetched = new Set(fetchedCalendarIds);

  const toInsert: GoogleOwnedFields[] = [];
  const toUpdate: Array<{ id: string; fields: GoogleOwnedFields }> = [];
  let skipped = 0;

  // Only google-origin rows are addressable by external id. Local-only rows are invisible
  // to every branch below, which is how they stay safe.
  const localByExternalId = new Map<string, LocalMirrorRow>();
  for (const row of local) {
    if (row.externalSource === "google" && row.externalId) {
      localByExternalId.set(row.externalId, row);
    }
  }

  const seenExternalIds = new Set<string>();

  for (const { event, calendarId } of remote) {
    const fields = googleEventToFields(event, calendarId);
    if (!fields) {
      skipped++;
      continue;
    }
    // A duplicate id in one pass would otherwise queue two writes for the same row.
    if (seenExternalIds.has(fields.externalId)) continue;
    seenExternalIds.add(fields.externalId);

    const existing = localByExternalId.get(fields.externalId);
    if (!existing) {
      toInsert.push(fields);
      continue;
    }
    // An unchanged etag means Google's event body is the same *as Google sees it*. That is
    // not enough to skip: we may still be missing a Google-owned column we only started
    // storing later (colorId after event-colours shipped). Compare those fields too so a
    // schedule refresh backfills without waiting for the user to edit the event in Google.
    const etagUnchanged =
      Boolean(existing.externalEtag) && existing.externalEtag === fields.externalEtag;
    const colorIdMatches = (existing.colorId ?? null) === (fields.colorId ?? null);
    if (etagUnchanged && colorIdMatches) continue;
    toUpdate.push({ id: existing.id, fields });
  }

  const toDelete: string[] = [];
  for (const row of local) {
    // Every one of these five is load-bearing; dropping any of them deletes real data.
    //
    //   1. google-origin  — a row the user made here and we never pushed is not ours to
    //                       reap, whatever Google says.
    //   2. has an id      — without one it cannot have been "returned by Google" at all.
    //   3. unseen         — Google was asked and did not list it, so it is gone there.
    //   4. in the window  — we only asked about this range; silence outside it means
    //                       nothing.
    //   5. calendar read  — and only about these calendars; a failed or disabled calendar
    //                       is silence we must not read as absence.
    if (row.externalSource !== "google") continue;
    if (!row.externalId) continue;
    if (seenExternalIds.has(row.externalId)) continue;
    if (!overlapsWindow(row, window)) continue;
    if (!row.externalCalendarId || !fetched.has(row.externalCalendarId)) continue;
    toDelete.push(row.id);
  }

  return { toInsert, toUpdate, toDelete, skipped };
}
