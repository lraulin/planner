import { describe, expect, it } from "vitest";
import {
  axisTicks,
  barInRange,
  clampWindow,
  deriveRibbon,
  FOLD_COLOR_INDEX,
  keyAtFraction,
  MIN_WINDOW_DAYS,
  offsetPercent,
  packLane,
  pinLabelWidths,
  ribbonRange,
  type RibbonBar,
} from "./ribbon";
import { daysBetweenKeys as daysBetween } from "@/lib/schedule/geometry";
import type { LifeEventDetail } from "./types";

const NOW = new Date("2026-08-14T12:00:00Z");

function event(overrides: Partial<LifeEventDetail> = {}): LifeEventDetail {
  return {
    id: "e1",
    eventDate: "2010-05-04",
    title: "Adopted Biscuit",
    category: "Pets",
    notes: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function job(overrides: Partial<Parameters<typeof deriveRibbon>[1][number]> = {}) {
  return {
    id: "j1",
    employer: "Acme Corp",
    jobTitle: "Software Engineer",
    startDate: "2019-03-01" as string | null,
    endDate: "2022-06-30" as string | null,
    ...overrides,
  };
}

function residence(
  overrides: Partial<Parameters<typeof deriveRibbon>[2][number]> = {},
) {
  return {
    id: "r1",
    label: "",
    streetAddress: "12 Sejong-daero",
    extendedAddress: "",
    city: "Seoul",
    region: "",
    postalCode: "04524",
    country: "South Korea",
    movedIn: "2014-08-01" as string | null,
    movedOut: "2017-02-15" as string | null,
    ...overrides,
  };
}

/** The bars the ribbon puts in one lane, packed the way the component packs them. */
function laneRows(ribbon: ReturnType<typeof deriveRibbon>, id: "home" | "work") {
  const lane = ribbon.lanes.find((entry) => entry.id === id);
  if (!lane) throw new Error(`no ${id} lane`);
  return packLane(lane.bars);
}

function labels(rows: RibbonBar[][]): string[][] {
  return rows.map((row) => row.map((bar) => bar.label));
}

/** The range a reader gets after dragging out exactly this window. */
function windowRange(startKey: string, endKey: string) {
  const range = ribbonRange({ minKey: startKey, maxKey: endKey }, null, {
    startKey,
    endKey,
  });
  if (!range) throw new Error("range");
  return range;
}

describe("deriveRibbon", () => {
  it("draws a job as one bar, where the chronology draws two rows", () => {
    // The whole reason this projection exists: duration, not a pair of points.
    const ribbon = deriveRibbon([], [job()], []);
    expect(laneRows(ribbon, "work")).toEqual([
      [
        {
          id: "job:j1",
          source: "job",
          sourceId: "j1",
          label: "Acme Corp",
          detail: "Software Engineer",
          startKey: "2019-03-01",
          endKey: "2022-06-30",
        },
      ],
    ]);
  });

  it("keeps an ongoing job's missing end null rather than filling in today", () => {
    // Today belongs to the reader's clock. Anything here that guessed it would be the server's.
    const [[bar]] = laneRows(deriveRibbon([], [job({ endDate: null })], []), "work");
    expect(bar.endKey).toBeNull();
    expect(bar.startKey).toBe("2019-03-01");
  });

  it("keeps a residence you only remember leaving", () => {
    // A real shape: the move out is on a lease, the move in was a decade of ago.
    const [[bar]] = laneRows(
      deriveRibbon([], [], [residence({ movedIn: null })]),
      "home",
    );
    expect(bar.startKey).toBeNull();
    expect(bar.endKey).toBe("2017-02-15");
  });

  it("drops a record with no dates at all instead of drawing a dateless bar", () => {
    const ribbon = deriveRibbon(
      [],
      [job({ startDate: null, endDate: null })],
      [residence({ movedIn: null, movedOut: null })],
    );
    expect(laneRows(ribbon, "work")).toEqual([]);
    expect(laneRows(ribbon, "home")).toEqual([]);
    expect(ribbon.bounds).toBeNull();
  });

  it("names a record whose naming field is blank the way the chronology does", () => {
    const ribbon = deriveRibbon(
      [],
      [job({ employer: "  " })],
      [residence({ city: "", label: "The cabin" })],
    );
    expect(laneRows(ribbon, "work")[0][0].label).toBe("an unnamed employer");
    expect(laneRows(ribbon, "home")[0][0].label).toBe("The cabin");
  });

  it("carries the full address as a residence bar's detail line", () => {
    const [[bar]] = laneRows(deriveRibbon([], [], [residence()]), "home");
    expect(bar.detail).toBe("12 Sejong-daero, Seoul, 04524, South Korea");
  });
});

describe("packing overlapping bars", () => {
  it("stacks a lease that runs past the move it overlaps", () => {
    const rows = laneRows(
      deriveRibbon(
        [],
        [],
        [
          residence({
            id: "r1",
            city: "Seoul",
            movedIn: "2014-01-01",
            movedOut: "2017-06-30",
          }),
          residence({
            id: "r2",
            city: "Austin",
            movedIn: "2017-01-01",
            movedOut: "2020-01-01",
          }),
        ],
      ),
      "home",
    );
    expect(labels(rows)).toEqual([["Seoul"], ["Austin"]]);
  });

  it("keeps a same-day handover on one row, so consecutive homes read as one band", () => {
    const rows = laneRows(
      deriveRibbon(
        [],
        [],
        [
          residence({
            id: "r1",
            city: "Seoul",
            movedIn: "2014-01-01",
            movedOut: "2017-06-30",
          }),
          residence({
            id: "r2",
            city: "Austin",
            movedIn: "2017-06-30",
            movedOut: "2020-01-01",
          }),
        ],
      ),
      "home",
    );
    expect(labels(rows)).toEqual([["Seoul", "Austin"]]);
  });

  it("lets an ongoing bar own the rest of its row", () => {
    // Without the open-end sentinel, a job with no end date compares as ending at the epoch and
    // every later job would pile on top of it.
    const rows = laneRows(
      deriveRibbon(
        [],
        [
          job({ id: "j1", employer: "Globex", startDate: "2010-01-01", endDate: null }),
          job({
            id: "j2",
            employer: "Initech",
            startDate: "2015-01-01",
            endDate: "2018-01-01",
          }),
        ],
        [],
      ),
      "work",
    );
    expect(labels(rows)).toEqual([["Globex"], ["Initech"]]);
  });

  it("lets a bar with no start own the beginning of its row", () => {
    const rows = laneRows(
      deriveRibbon(
        [],
        [],
        [
          residence({ id: "r1", city: "Seoul", movedIn: null, movedOut: "2017-06-30" }),
          residence({
            id: "r2",
            city: "Austin",
            movedIn: "2010-01-01",
            movedOut: "2012-01-01",
          }),
        ],
      ),
      "home",
    );
    // Austin sits inside the unbounded stretch Seoul claims, so it cannot share the row.
    expect(labels(rows)).toEqual([["Seoul"], ["Austin"]]);
  });

  it("uses three rows for three mutually overlapping bars, and no more", () => {
    const rows = laneRows(
      deriveRibbon(
        [],
        [
          job({
            id: "j1",
            employer: "A",
            startDate: "2000-01-01",
            endDate: "2006-01-01",
          }),
          job({
            id: "j2",
            employer: "B",
            startDate: "2001-01-01",
            endDate: "2007-01-01",
          }),
          job({
            id: "j3",
            employer: "C",
            startDate: "2002-01-01",
            endDate: "2008-01-01",
          }),
          // Starts after A ends, so it fills A's row rather than opening a fourth.
          job({
            id: "j4",
            employer: "D",
            startDate: "2006-06-01",
            endDate: "2009-01-01",
          }),
        ],
        [],
      ),
      "work",
    );
    expect(labels(rows)).toEqual([["A", "D"], ["B"], ["C"]]);
  });
});

describe("pins and their colours", () => {
  it("orders pins oldest first with a stable same-day tiebreak", () => {
    const { pins } = deriveRibbon(
      [
        event({ id: "e2", eventDate: "2010-05-04" }),
        event({ id: "e1", eventDate: "2010-05-04" }),
        event({ id: "e3", eventDate: "2001-01-01" }),
      ],
      [],
      [],
    );
    expect(pins.map((pin) => pin.id)).toEqual(["event:e3", "event:e1", "event:e2"]);
  });

  it("assigns colours by sorted category, so the legend does not shuffle", () => {
    const { pins, categories } = deriveRibbon(
      [
        event({ id: "e1", category: "Pets" }),
        event({ id: "e2", category: "Family" }),
        event({ id: "e3", category: "Pets" }),
      ],
      [],
      [],
    );
    expect(categories).toEqual([
      { label: "Family", colorIndex: 0 },
      { label: "Pets", colorIndex: 1 },
    ]);
    const byId = new Map(pins.map((pin) => [pin.id, pin.colorIndex]));
    expect(byId.get("event:e1")).toBe(1);
    expect(byId.get("event:e3")).toBe(1);
    expect(byId.get("event:e2")).toBe(0);
  });

  it("folds an uncategorised event into the catch-all colour and says so once", () => {
    const { pins, categories } = deriveRibbon(
      [
        event({ id: "e1", category: "  " }),
        event({ id: "e2", category: "" }),
        event({ id: "e3", category: "Pets" }),
      ],
      [],
      [],
    );
    expect(pins.filter((pin) => pin.colorIndex === FOLD_COLOR_INDEX)).toHaveLength(2);
    expect(categories).toEqual([
      { label: "Pets", colorIndex: 0 },
      { label: "Other", colorIndex: FOLD_COLOR_INDEX },
    ]);
  });

  it("folds every category past the palette rather than wrapping back to the first colour", () => {
    // Wrapping would give two categories the same colour with nothing to say they differ.
    const categoriesInUse = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
    const { pins, categories } = deriveRibbon(
      categoriesInUse.map((category, index) =>
        event({ id: `e${index}`, category, eventDate: `20${10 + index}-01-01` }),
      ),
      [],
      [],
    );
    expect(pins.map((pin) => pin.colorIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 7]);
    expect(categories.map((entry) => entry.label)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "Other",
    ]);
  });

  it("omits the catch-all from the legend when nothing landed in it", () => {
    const { categories } = deriveRibbon([event({ category: "Pets" })], [], []);
    expect(categories).toEqual([{ label: "Pets", colorIndex: 0 }]);
  });
});
describe("bounds", () => {
  it("spans every dated thing on the page, from all three sources", () => {
    const ribbon = deriveRibbon(
      [event({ eventDate: "2010-05-04" })],
      [job()],
      [residence()],
    );
    expect(ribbon.bounds).toEqual({ minKey: "2010-05-04", maxKey: "2022-06-30" });
  });

  it("ignores the missing half of a half-open span", () => {
    const ribbon = deriveRibbon([], [job({ startDate: null })], []);
    expect(ribbon.bounds).toEqual({ minKey: "2022-06-30", maxKey: "2022-06-30" });
  });
});

describe("ribbonRange", () => {
  const bounds = { minKey: "2014-08-01", maxKey: "2022-06-30" };

  it("rounds the default view out to whole calendar years", () => {
    expect(ribbonRange(bounds, null)).toMatchObject({
      startKey: "2014-01-01",
      endKey: "2022-12-31",
    });
  });

  it("extends to today when today is later than anything recorded", () => {
    expect(ribbonRange(bounds, "2026-08-14")?.endKey).toBe("2026-12-31");
  });

  it("does not shrink to today when the records run past it", () => {
    // A future-dated event is an edge case, not a reason to crop the axis short of it.
    expect(
      ribbonRange({ minKey: "2014-08-01", maxKey: "2030-01-01" }, "2026-08-14")?.endKey,
    ).toBe("2030-12-31");
  });

  it("ends at the last recorded date before hydration, rather than refusing to draw", () => {
    expect(ribbonRange(bounds, null)?.endKey).toBe("2022-12-31");
  });

  it("uses a dragged window exactly, without rounding it to years", () => {
    // The reader asked for these dates. Rounding them out would undo the gesture.
    expect(
      ribbonRange(bounds, "2026-08-14", {
        startKey: "2015-03-04",
        endKey: "2016-09-19",
      }),
    ).toEqual({ startKey: "2015-03-04", endKey: "2016-09-19", totalDays: 565 });
  });

  it("is null when there is nothing to draw", () => {
    expect(ribbonRange(null, "2026-08-14")).toBeNull();
    // A window over nothing is still nothing — the page shows its empty state either way.
    expect(
      ribbonRange(null, null, { startKey: "2015-01-01", endKey: "2016-01-01" }),
    ).toBeNull();
  });
});

describe("offsetPercent and keyAtFraction", () => {
  const range = ribbonRange({ minKey: "2020-01-01", maxKey: "2020-12-31" }, null)!;

  it("puts the first day at 0 and the last at 100", () => {
    expect(offsetPercent(range, "2020-01-01")).toBe(0);
    expect(offsetPercent(range, "2020-12-31")).toBe(100);
  });

  it("clamps a date outside the range instead of drawing off the container", () => {
    expect(offsetPercent(range, "1998-01-01")).toBe(0);
    expect(offsetPercent(range, "2099-01-01")).toBe(100);
  });

  it("round-trips a position back to the date under it", () => {
    // The drag reads dates off the ribbon this way; a drift here would move what you selected.
    for (const key of ["2020-01-01", "2020-04-11", "2020-07-01", "2020-12-31"]) {
      expect(keyAtFraction(range, offsetPercent(range, key) / 100)).toBe(key);
    }
  });

  it("clamps a fraction from a pointer that left the container", () => {
    expect(keyAtFraction(range, -0.4)).toBe("2020-01-01");
    expect(keyAtFraction(range, 1.8)).toBe("2020-12-31");
  });
});

describe("clampWindow", () => {
  it("orders a backwards drag", () => {
    expect(clampWindow("2016-01-01", "2012-01-01")).toEqual({
      startKey: "2012-01-01",
      endKey: "2016-01-01",
    });
  });

  it("leaves a window that is already wide enough alone", () => {
    expect(clampWindow("2012-01-01", "2016-01-01")).toEqual({
      startKey: "2012-01-01",
      endKey: "2016-01-01",
    });
  });

  it("widens a too-narrow drag around its middle rather than rejecting it", () => {
    // A few pixels across thirty years is a handful of days, and the reader meant "in here".
    const window = clampWindow("2015-06-10", "2015-06-12");
    expect(daysBetween(window.startKey, window.endKey)).toBeGreaterThanOrEqual(
      MIN_WINDOW_DAYS,
    );
    expect(window.startKey < "2015-06-10").toBe(true);
    expect(window.endKey > "2015-06-12").toBe(true);
  });

  it("survives a drag that never moved", () => {
    const window = clampWindow("2015-06-10", "2015-06-10");
    expect(daysBetween(window.startKey, window.endKey)).toBeGreaterThanOrEqual(
      MIN_WINDOW_DAYS,
    );
  });
});

describe("barInRange", () => {
  const range = windowRange("2010-01-01", "2015-01-01");

  function bar(startKey: string | null, endKey: string | null): RibbonBar {
    return {
      id: "b",
      source: "job",
      sourceId: "j",
      label: "x",
      detail: "",
      startKey,
      endKey,
    };
  }

  it("keeps a span that only overlaps the window at one edge", () => {
    expect(barInRange(bar("2005-01-01", "2010-01-01"), range)).toBe(true);
    expect(barInRange(bar("2015-01-01", "2020-01-01"), range)).toBe(true);
  });

  it("drops a span that finished before the window or starts after it", () => {
    expect(barInRange(bar("2005-01-01", "2009-12-31"), range)).toBe(false);
    expect(barInRange(bar("2015-01-02", "2020-01-01"), range)).toBe(false);
  });

  it("keeps a half-open span whose recorded end reaches into the window", () => {
    // Ongoing and unknown-start bars reach forever; cropping them out would hide a current job.
    expect(barInRange(bar("2005-01-01", null), range)).toBe(true);
    expect(barInRange(bar(null, "2012-01-01"), range)).toBe(true);
    expect(barInRange(bar(null, null), range)).toBe(true);
  });
});

describe("axisTicks", () => {
  const range = windowRange;

  it("lands ticks on round multiples, not on the range's own first year", () => {
    // A decade axis beginning at 1997 reads as arbitrary. Thirty years across 900px earns a
    // two-year step, and every mark it produces is an even year.
    const years = axisTicks(range("1997-01-01", "2026-12-31"), 900).map((tick) =>
      Number(tick.label),
    );
    expect(years[0]).toBe(1998);
    expect(years.every((year) => year % 2 === 0)).toBe(true);
  });

  it("uses whole years as the step as soon as one year has room for a label", () => {
    expect(
      axisTicks(range("2000-01-01", "2020-12-31"), 1200).map((t) => t.label),
    ).toEqual(Array.from({ length: 21 }, (_, index) => String(2000 + index)));
  });

  it("thins the labels when the container is too narrow for them", () => {
    expect(
      axisTicks(range("2000-01-01", "2020-12-31"), 300).map((t) => t.label),
    ).toEqual(["2000", "2005", "2010", "2015", "2020"]);
  });

  it("drops to months once the window is short enough to need them", () => {
    // The whole point of a range control: a year label alone says nothing inside one year.
    const ticks = axisTicks(range("2015-01-01", "2015-06-30"), 900);
    expect(ticks.map((tick) => tick.label)).toEqual([
      "Jan 2015",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
    ]);
  });

  it("names the year on the first mark even when the window starts mid-year", () => {
    // Otherwise a window inside one year never says which year it is.
    const ticks = axisTicks(range("2015-02-10", "2015-08-20"), 900);
    expect(ticks[0].label).toBe("Mar 2015");
    expect(ticks[1].label).toBe("Apr");
  });

  it("marks year boundaries as major so the reader has something to count by", () => {
    const ticks = axisTicks(range("2014-06-01", "2016-06-01"), 900);
    expect(ticks.filter((tick) => tick.major).map((tick) => tick.dateKey)).toEqual([
      "2015-01-01",
      "2016-01-01",
    ]);
  });

  it("assumes a narrow container before it has been measured", () => {
    // First paint must be sparse and then thicken, never start overlapping.
    const measured = axisTicks(range("2000-01-01", "2020-12-31"), 1200);
    const unmeasured = axisTicks(range("2000-01-01", "2020-12-31"), null);
    expect(unmeasured.length).toBeLessThan(measured.length);
  });

  it("never draws a mark behind the left edge of a window that starts mid-month", () => {
    // The aligned tick for February is the 1st, and the window starts on the 10th. Drawing it
    // would clamp it to 0% and label the edge with a date the reader did not select.
    const ticks = axisTicks(range("2015-02-10", "2015-08-20"), 900);
    expect(ticks.every((tick) => tick.dateKey >= "2015-02-10")).toBe(true);
  });
});

describe("pinLabelWidths", () => {
  const range = windowRange("2020-01-01", "2020-12-31");

  function pinAt(id: string, dateKey: string) {
    return { id, sourceId: id, dateKey, title: id, category: "", colorIndex: 0 };
  }

  it("gives a lone pin the rest of the ribbon to write in", () => {
    const [room] = pinLabelWidths([pinAt("a", "2020-01-01")], range, 1000);
    expect(room).toBeCloseTo(992, 0);
  });

  it("gives each pin only the room up to the next one", () => {
    const rooms = pinLabelWidths(
      [pinAt("a", "2020-01-01"), pinAt("b", "2020-07-01")], // roughly half way
      range,
      1000,
    );
    expect(rooms[0]).toBeGreaterThan(400);
    expect(rooms[0]).toBeLessThan(520);
  });

  it("withholds a label there is no room for rather than printing an ellipsis", () => {
    const rooms = pinLabelWidths(
      [pinAt("a", "2020-06-01"), pinAt("b", "2020-06-08")],
      range,
      400,
    );
    expect(rooms[0]).toBeNull();
    expect(rooms[1]).not.toBeNull();
  });

  it("drops the earlier of two pins on the same day and keeps the later one", () => {
    // Two labels drawn on top of each other is worse than one label and a tooltip.
    const rooms = pinLabelWidths(
      [pinAt("a", "2020-03-01"), pinAt("b", "2020-03-01")],
      range,
      1000,
    );
    expect(rooms[0]).toBeNull();
    expect(rooms[1]).not.toBeNull();
  });

  it("shows no labels until the container has been measured", () => {
    expect(pinLabelWidths([pinAt("a", "2020-03-01")], range, null)).toEqual([null]);
  });
});
