import { describe, expect, it } from "vitest";
import type { GoogleEvent } from "./mapping";
import {
  MIN_SYNC_DAYS,
  planMirror,
  syncWindowFor,
  type LocalMirrorRow,
  type MirrorWindow,
  type RemoteEvent,
} from "./mirror";
import { dayRange, scheduleRange, weekRange } from "@/lib/schedule/range";
import { localDateKey } from "@/lib/schedule/geometry";

const CAL = "cal@example.com";
const OTHER_CAL = "work@example.com";

/** Mon 2026-07-27 → Mon 2026-08-03, the shape `loadSchedule` syncs. */
const window: MirrorWindow = {
  start: new Date(2026, 6, 27),
  end: new Date(2026, 7, 3),
};

function remoteEvent(over: Partial<GoogleEvent> = {}, calendarId = CAL): RemoteEvent {
  return {
    calendarId,
    event: {
      id: "evt1",
      etag: '"v1"',
      summary: "Standup",
      start: { dateTime: new Date(2026, 6, 28, 9, 0).toISOString() },
      end: { dateTime: new Date(2026, 6, 28, 9, 15).toISOString() },
      ...over,
    },
  };
}

function localRow(over: Partial<LocalMirrorRow> = {}): LocalMirrorRow {
  return {
    id: "row1",
    externalSource: "google",
    externalId: "evt1",
    externalCalendarId: CAL,
    externalEtag: '"v1"',
    colorId: null,
    startAt: new Date(2026, 6, 28, 9, 0),
    endAt: new Date(2026, 6, 28, 9, 15),
    ...over,
  };
}

describe("planMirror — pulling", () => {
  it("inserts an event we have never seen", () => {
    const plan = planMirror([], [remoteEvent()], window, [CAL]);
    expect(plan.toInsert).toHaveLength(1);
    expect(plan.toInsert[0].externalId).toBe("evt1");
    expect(plan.toUpdate).toEqual([]);
    expect(plan.toDelete).toEqual([]);
  });

  it("updates a row whose etag moved", () => {
    const plan = planMirror(
      [localRow({ externalEtag: '"v1"' })],
      [remoteEvent({ etag: '"v2"', summary: "Standup (moved)" })],
      window,
      [CAL],
    );
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0].id).toBe("row1");
    expect(plan.toUpdate[0].fields.subject).toBe("Standup (moved)");
    expect(plan.toInsert).toEqual([]);
  });

  it("skips the write entirely when the etag and colour are unchanged", () => {
    const plan = planMirror([localRow({ colorId: null })], [remoteEvent()], window, [
      CAL,
    ]);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.toInsert).toEqual([]);
    expect(plan.toDelete).toEqual([]);
  });

  it("backfills colorId when the etag is unchanged but the local column is empty", () => {
    // Regression: colour shipped after rows were already mirrored. Google's etag never
    // moved, so a pure-etag skip left color_id null forever. A schedule refresh must
    // still write the newly tracked Google-owned field.
    const plan = planMirror(
      [localRow({ externalEtag: '"v1"', colorId: null })],
      [remoteEvent({ etag: '"v1"', colorId: "11" })],
      window,
      [CAL],
    );
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0].fields.colorId).toBe("11");
  });

  it("updates when a known colour is cleared on Google", () => {
    const plan = planMirror(
      [localRow({ externalEtag: '"v1"', colorId: "5" })],
      [remoteEvent({ etag: '"v1"' /* no colorId → calendar default */ })],
      window,
      [CAL],
    );
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0].fields.colorId).toBeNull();
  });

  it("updates when the local row has no etag to compare", () => {
    const plan = planMirror(
      [localRow({ externalEtag: null })],
      [remoteEvent()],
      window,
      [CAL],
    );
    expect(plan.toUpdate).toHaveLength(1);
  });

  it("counts unmappable events instead of applying them", () => {
    const plan = planMirror(
      [],
      [
        remoteEvent({ status: "cancelled" }),
        remoteEvent({ id: "evt2", start: undefined }),
      ],
      window,
      [CAL],
    );
    expect(plan.skipped).toBe(2);
    expect(plan.toInsert).toEqual([]);
  });

  it("queues one write when Google lists the same id twice", () => {
    const plan = planMirror([], [remoteEvent(), remoteEvent()], window, [CAL]);
    expect(plan.toInsert).toHaveLength(1);
  });

  it("treats each instance of a recurring series as its own row", () => {
    const plan = planMirror(
      [],
      [
        remoteEvent({ id: "evt1_20260728T090000Z", recurringEventId: "evt1" }),
        remoteEvent({ id: "evt1_20260729T090000Z", recurringEventId: "evt1" }),
      ],
      window,
      [CAL],
    );
    expect(plan.toInsert).toHaveLength(2);
    expect(plan.toInsert.map((f) => f.externalSeriesId)).toEqual(["evt1", "evt1"]);
  });
});

describe("planMirror — the deletion sweep", () => {
  it("deletes a google row Google no longer lists", () => {
    const plan = planMirror([localRow()], [], window, [CAL]);
    expect(plan.toDelete).toEqual(["row1"]);
  });

  it("never deletes a local-only row, whatever Google says", () => {
    // The row a user made here before linking Google, or one whose push failed. Google was
    // never asked about it and has no opinion; reaping it would be data loss.
    const plan = planMirror(
      [localRow({ externalSource: null, externalId: null, externalCalendarId: null })],
      [],
      window,
      [CAL],
    );
    expect(plan.toDelete).toEqual([]);
  });

  it("never deletes a row outside the synced window", () => {
    // We asked Google about one week. Its silence about last month is not evidence.
    const plan = planMirror(
      [
        localRow({
          id: "old",
          startAt: new Date(2026, 5, 1, 9, 0),
          endAt: new Date(2026, 5, 1, 10, 0),
        }),
      ],
      [],
      window,
      [CAL],
    );
    expect(plan.toDelete).toEqual([]);
  });

  it("keeps a row that merely overlaps the window edge", () => {
    const plan = planMirror(
      [
        localRow({
          id: "straddler",
          startAt: new Date(2026, 6, 26, 23, 0),
          endAt: new Date(2026, 6, 27, 1, 0),
        }),
      ],
      [],
      window,
      [CAL],
    );
    // It does overlap, so it is in scope and Google's silence does mean deleted.
    expect(plan.toDelete).toEqual(["straddler"]);
  });

  it("never deletes rows from a calendar this pass did not read", () => {
    // The failure that motivates the predicate: two calendars enabled, one request throws.
    // The caller passes only the calendar that answered, and the other is left alone.
    const plan = planMirror(
      [
        localRow({ id: "a", externalId: "a1" }),
        localRow({ id: "b", externalId: "b1", externalCalendarId: OTHER_CAL }),
      ],
      [],
      window,
      [CAL],
    );
    expect(plan.toDelete).toEqual(["a"]);
  });

  it("never deletes a row with no calendar recorded", () => {
    const plan = planMirror([localRow({ externalCalendarId: null })], [], window, [
      CAL,
    ]);
    expect(plan.toDelete).toEqual([]);
  });

  it("keeps a row Google still lists", () => {
    const plan = planMirror([localRow()], [remoteEvent()], window, [CAL]);
    expect(plan.toDelete).toEqual([]);
  });

  it("deletes a row whose event was cancelled in Google", () => {
    // Cancelled events map to null, so they are never "seen" — the sweep reaps them.
    const plan = planMirror(
      [localRow()],
      [remoteEvent({ status: "cancelled" })],
      window,
      [CAL],
    );
    expect(plan.toDelete).toEqual(["row1"]);
  });

  it("handles insert, update and delete together in one pass", () => {
    const plan = planMirror(
      [
        localRow({ id: "keep", externalId: "keep1", externalEtag: '"old"' }),
        localRow({ id: "gone", externalId: "gone1" }),
      ],
      [
        remoteEvent({ id: "keep1", etag: '"new"' }),
        remoteEvent({ id: "fresh1", etag: '"n"' }),
      ],
      window,
      [CAL],
    );
    expect(plan.toUpdate.map((u) => u.id)).toEqual(["keep"]);
    expect(plan.toInsert.map((f) => f.externalId)).toEqual(["fresh1"]);
    expect(plan.toDelete).toEqual(["gone"]);
  });

  it("plans nothing at all when a fetch returns nothing and no calendar is claimed", () => {
    // Total failure path: the caller reports zero successful calendars, so the sweep is
    // inert even though `remote` is empty and every row looks unseen.
    const plan = planMirror([localRow()], [], window, []);
    expect(plan).toEqual({ toInsert: [], toUpdate: [], toDelete: [], skipped: 0 });
  });
});

describe("syncWindowFor", () => {
  const wednesday = new Date(2026, 7, 12);

  it("starts on a week boundary and runs at least four weeks", () => {
    const window = syncWindowFor(dayRange(wednesday));
    expect(localDateKey(window.start)).toBe("2026-08-09"); // the Sunday
    expect(localDateKey(window.end)).toBe("2026-09-06"); // four weeks on
  });

  /**
   * The reason this function exists. Freshness is time-based, so if the window tracked the
   * day count, flipping from One Day to Twenty Days inside the five-minute throttle would
   * leave nineteen days unfetched and drawn empty.
   */
  it("does not move when only the day count changes", () => {
    const options = { anchorMode: "rolling", workWeek: false } as const;
    const one = syncWindowFor(scheduleRange(wednesday, { ...options, dayCount: 1 }));
    const seven = syncWindowFor(scheduleRange(wednesday, { ...options, dayCount: 7 }));
    expect(seven).toEqual(one);
  });

  it("widens past the floor for a range that needs it", () => {
    const twenty = syncWindowFor(
      scheduleRange(wednesday, {
        dayCount: 20,
        anchorMode: "rolling",
        workWeek: false,
      }),
    );
    // Twenty days from the 12th reaches 31 August; the floor's 6 September already covers
    // it, so the window is unchanged — the floor is what keeps short views honest.
    expect(localDateKey(twenty.end)).toBe("2026-09-06");

    const wide = syncWindowFor({
      start: new Date(2026, 7, 12),
      end: new Date(2026, 9, 1),
    });
    expect(wide.end.getTime()).toBeGreaterThan(new Date(2026, 9, 1).getTime());
    expect(wide.start.getDay()).toBe(0);
  });

  it("always covers the range it was given", () => {
    for (const dayCount of [1, 3, 5, 7, 10, 20] as const) {
      for (const workWeek of [false, true]) {
        const range = scheduleRange(wednesday, {
          dayCount,
          anchorMode: "rolling",
          workWeek,
        });
        const window = syncWindowFor(range);
        expect(window.start.getTime()).toBeLessThanOrEqual(range.start.getTime());
        expect(window.end.getTime()).toBeGreaterThanOrEqual(range.end.getTime());
      }
    }
  });

  it("keeps whole weeks, so the floor is a multiple of seven days", () => {
    const window = syncWindowFor(weekRange(wednesday));
    const span = Math.round(
      (window.end.getTime() - window.start.getTime()) / (24 * 60 * 60 * 1000),
    );
    expect(span % 7).toBe(0);
    expect(span).toBeGreaterThanOrEqual(MIN_SYNC_DAYS);
  });
});
