import { describe, expect, it } from "vitest";
import {
  FOCUS_RETURN_AWAY_MS,
  SUSPECT_WINDOW_MS,
  createAwayTracker,
  createFreshnessTracker,
  returnAction,
  sameLocalDay,
} from "./freshness";

// A mid-afternoon local time, so "same day" survives a few minutes of arithmetic.
const T0 = new Date(2026, 9, 13, 14, 0, 0).getTime();

describe("the suspect mark", () => {
  it("makes a payload seen before it refresh, and one fetched after it fresh", () => {
    const tracker = createFreshnessTracker();
    expect(tracker.pageShown("budget-1", T0)).toBe("fresh");

    tracker.markSuspect(T0 + 5_000); // left Register after editing

    // back on Budget from the cache: the id was first seen before the mark
    expect(tracker.pageShown("budget-1", T0 + 6_000)).toBe("refresh");
    // a payload that arrived after the mark cannot predate the write
    expect(tracker.pageShown("accounts-1", T0 + 6_000)).toBe("fresh");
  });

  it("lapses after the window, when the cache would have refetched anyway", () => {
    const tracker = createFreshnessTracker();
    tracker.pageShown("budget-1", T0);
    tracker.markSuspect(T0 + 1_000);
    expect(tracker.isSuspect(T0 + 1_000 + SUSPECT_WINDOW_MS - 1)).toBe(true);
    expect(tracker.isSuspect(T0 + 1_000 + SUSPECT_WINDOW_MS)).toBe(false);
    expect(tracker.pageShown("budget-1", T0 + 1_000 + SUSPECT_WINDOW_MS)).toBe("fresh");
  });

  it("is dropped when the cache is emptied, and the seen payloads with it", () => {
    const tracker = createFreshnessTracker();
    tracker.cacheEmptied("epoch-1");
    tracker.pageShown("budget-1", T0);
    tracker.markSuspect(T0 + 1_000);

    tracker.cacheEmptied("epoch-1"); // a re-render of the same layout: nothing happened
    expect(tracker.isSuspect(T0 + 2_000)).toBe(true);

    tracker.cacheEmptied("epoch-2"); // router.refresh() or a revalidating action
    expect(tracker.isSuspect(T0 + 2_000)).toBe(false);
    // the id is new to a cache that was just emptied, so it counts as arriving now
    expect(tracker.pageShown("budget-1", T0 + 3_000)).toBe("fresh");
  });

  it("does not treat the first epoch it sees as an emptying", () => {
    const tracker = createFreshnessTracker();
    tracker.markSuspect(T0);
    tracker.cacheEmptied("first-load");
    expect(tracker.isSuspect(T0 + 1)).toBe(true);
  });

  it("refreshes a payload first seen on a previous local day, with no mark at all", () => {
    const tracker = createFreshnessTracker();
    const lastNight = new Date(2026, 9, 12, 23, 58, 0).getTime();
    const morning = new Date(2026, 9, 13, 0, 3, 0).getTime();
    expect(tracker.pageShown("overview-1", lastNight)).toBe("fresh");
    expect(tracker.pageShown("overview-1", lastNight + 60_000)).toBe("fresh");
    expect(tracker.pageShown("overview-1", morning)).toBe("refresh");
  });

  it("keeps an id's age across revisits instead of renewing it", () => {
    const tracker = createFreshnessTracker();
    tracker.pageShown("budget-1", T0);
    tracker.pageShown("budget-1", T0 + 20_000); // a second look at the same payload
    tracker.markSuspect(T0 + 25_000);
    expect(tracker.pageShown("budget-1", T0 + 26_000)).toBe("refresh");
  });
});

describe("returnAction", () => {
  it("does nothing for a short absence", () => {
    expect(returnAction(FOCUS_RETURN_AWAY_MS - 1, "uncached")).toBe("none");
    expect(returnAction(0, "self-patching")).toBe("none");
  });

  it("refreshes a visible cached or uncached page after a long absence", () => {
    expect(returnAction(FOCUS_RETURN_AWAY_MS, "cached")).toBe("refresh");
    expect(returnAction(FOCUS_RETURN_AWAY_MS, "uncached")).toBe("refresh");
  });

  it("only marks a self-patching page, never reloads rows under an edit", () => {
    expect(returnAction(FOCUS_RETURN_AWAY_MS, "self-patching")).toBe("mark-only");
  });

  it("treats a day change like a focus return whatever the absence", () => {
    expect(returnAction(Number.POSITIVE_INFINITY, "cached")).toBe("refresh");
    expect(returnAction(Number.POSITIVE_INFINITY, "self-patching")).toBe("mark-only");
  });
});

describe("createAwayTracker", () => {
  it("measures from the first sign of leaving and counts an absence once", () => {
    const away = createAwayTracker();
    away.left(1_000); // window blur
    away.left(1_200); // visibilitychange to hidden, a moment later
    expect(away.returned(41_000)).toBe(40_000);
    expect(away.returned(41_100)).toBe(0); // the overlapping focus event
  });

  it("is zero when attention never left", () => {
    expect(createAwayTracker().returned(5_000)).toBe(0);
  });
});

describe("sameLocalDay", () => {
  it("compares the wall-clock day, not 24 hours", () => {
    expect(
      sameLocalDay(
        new Date(2026, 9, 13, 0, 1).getTime(),
        new Date(2026, 9, 13, 23, 59).getTime(),
      ),
    ).toBe(true);
    expect(
      sameLocalDay(
        new Date(2026, 9, 13, 23, 59).getTime(),
        new Date(2026, 9, 14, 0, 1).getTime(),
      ),
    ).toBe(false);
  });
});
