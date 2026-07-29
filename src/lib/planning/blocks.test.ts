import { describe, expect, it } from "vitest";
import {
  findFreeSlot,
  mergeIntervals,
  nextBlockSize,
  overlaps,
  remainingMinutesForProject,
  scheduledMinutesForProject,
  snapUp,
  splitIntoBlocks,
  type Interval,
} from "./blocks";

/** A local-time interval on 2026-07-28 (a Tuesday), by hour. */
function at(hour: number, minute = 0): Date {
  return new Date(2026, 6, 28, hour, minute, 0, 0);
}
function span(startHour: number, endHour: number): Interval {
  return { start: at(startHour), end: at(endHour) };
}

describe("overlaps", () => {
  it("does not treat touching ends as an overlap", () => {
    // A block ending at 10:00 must be allowed to butt against one starting at 10:00,
    // otherwise back-to-back blocks are impossible to schedule.
    expect(overlaps(span(9, 10), span(10, 11))).toBe(false);
  });

  it("catches an interval fully inside another", () => {
    expect(overlaps({ start: at(9, 30), end: at(9, 45) }, span(9, 11))).toBe(true);
  });
});

describe("mergeIntervals", () => {
  it("merges touching and overlapping intervals into one", () => {
    const merged = mergeIntervals([span(9, 10), span(10, 11), span(10, 12)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].end).toEqual(at(12));
  });

  it("keeps a gap between separate intervals", () => {
    expect(mergeIntervals([span(9, 10), span(11, 12)])).toHaveLength(2);
  });

  it("drops zero-length intervals rather than merging around them", () => {
    expect(mergeIntervals([{ start: at(9), end: at(9) }])).toHaveLength(0);
  });

  it("does not mutate the intervals it was given", () => {
    const input = [span(9, 10), span(10, 11)];
    mergeIntervals(input);
    expect(input[0].end).toEqual(at(10));
  });
});

describe("findFreeSlot", () => {
  const searchEnd = at(23);

  it("returns the requested time when nothing is in the way", () => {
    expect(findFreeSlot([span(14, 15)], at(9), 60, { searchEnd })).toEqual(at(9));
  });

  it("slides past a colliding block to the moment it ends", () => {
    expect(findFreeSlot([span(9, 10)], at(9), 60, { searchEnd })).toEqual(at(10));
  });

  it("keeps sliding when the next slot collides too", () => {
    // 9–10 and 10–11 back to back: a one-hour block asked for at 9 lands at 11, not 10.
    const found = findFreeSlot([span(9, 10), span(10, 11)], at(9), 60, { searchEnd });
    expect(found).toEqual(at(11));
  });

  it("skips a gap too short for the block", () => {
    // Free 10:00–10:30 only; a 60-minute block must wait for 11:00.
    const busy = [span(9, 10), { start: at(10, 30), end: at(11) }];
    expect(findFreeSlot(busy, at(9), 60, { searchEnd })).toEqual(at(11));
  });

  it("takes a gap that is exactly long enough", () => {
    const busy = [span(9, 10), span(11, 12)];
    expect(findFreeSlot(busy, at(9), 60, { searchEnd })).toEqual(at(10));
  });

  it("snaps a mid-slot landing forward onto the grid", () => {
    const busy = [{ start: at(9), end: at(10, 7) }];
    expect(findFreeSlot(busy, at(9), 60, { searchEnd })).toEqual(at(10, 15));
  });

  it("gives up rather than running past the end of the search window", () => {
    const busy = [{ start: at(9), end: at(22, 30) }];
    expect(findFreeSlot(busy, at(9), 60, { searchEnd })).toBeNull();
  });

  it("refuses a block that would not fit before the window closes", () => {
    expect(findFreeSlot([], at(22, 30), 60, { searchEnd })).toBeNull();
  });
});

describe("splitIntoBlocks", () => {
  it("splits a commitment into whole blocks plus the remainder", () => {
    expect(splitIntoBlocks(300, 90)).toEqual([90, 90, 90, 30]);
  });

  it("returns one block when the commitment is smaller than the block size", () => {
    expect(splitIntoBlocks(45, 90)).toEqual([45]);
  });

  it("divides evenly with no stub block", () => {
    expect(splitIntoBlocks(180, 90)).toEqual([90, 90]);
  });

  it("folds a stub tail into the previous block instead of scheduling five minutes", () => {
    expect(splitIntoBlocks(185, 90)).toEqual([90, 95]);
  });

  it("has nothing to split when nothing is committed", () => {
    expect(splitIntoBlocks(0, 90)).toEqual([]);
  });
});

describe("scheduled and remaining time", () => {
  const blocks = [
    { projectId: "p1", startAt: at(9), endAt: at(10, 30) },
    { projectId: "p1", startAt: at(13), endAt: at(14) },
    { projectId: "p2", startAt: at(15), endAt: at(16) },
    { projectId: null, startAt: at(17), endAt: at(18) },
  ];

  it("counts only the blocks belonging to the project", () => {
    expect(scheduledMinutesForProject(blocks, "p1")).toBe(150);
  });

  it("reports what a project still owes the week", () => {
    expect(remainingMinutesForProject(240, 150)).toBe(90);
  });

  it("reports over-scheduling as a negative rather than clamping it away", () => {
    expect(remainingMinutesForProject(60, 150)).toBe(-90);
  });

  it("has no remainder to report for an uncommitted project", () => {
    expect(remainingMinutesForProject(null, 150)).toBeNull();
  });
});

describe("nextBlockSize", () => {
  it("trims the last block down to what is still owed", () => {
    expect(nextBlockSize(30, 90)).toBe(30);
  });

  it("uses the full block size when plenty is owed", () => {
    expect(nextBlockSize(240, 90)).toBe(90);
  });

  it("still offers a full block once the commitment is met, so dropping stays possible", () => {
    expect(nextBlockSize(0, 90)).toBe(90);
    expect(nextBlockSize(null, 90)).toBe(90);
  });
});

describe("snapUp", () => {
  it("leaves a time already on the grid alone", () => {
    expect(snapUp(at(10, 30), 15)).toEqual(at(10, 30));
  });

  it("rounds forward, never back", () => {
    expect(snapUp(at(10, 31), 15)).toEqual(at(10, 45));
  });

  it("rolls into the next day when snapping past midnight", () => {
    const late = new Date(2026, 6, 28, 23, 50);
    expect(snapUp(late, 15)).toEqual(new Date(2026, 6, 29, 0, 0));
  });
});
