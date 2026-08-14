import { describe, expect, it } from "vitest";
import {
  axisTicks,
  deriveRibbon,
  FOLD_COLOR_INDEX,
  offsetPercent,
  ribbonRange,
  type RibbonBar,
} from "./ribbon";
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

/** The lane the ribbon puts residences in, and the one it puts jobs in. */
function laneRows(ribbon: ReturnType<typeof deriveRibbon>, id: "home" | "work") {
  const lane = ribbon.lanes.find((entry) => entry.id === id);
  if (!lane) throw new Error(`no ${id} lane`);
  return lane.rows;
}

function labels(rows: RibbonBar[][]): string[][] {
  return rows.map((row) => row.map((bar) => bar.label));
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

  it("rounds out to whole calendar years so every tick is a January", () => {
    const range = ribbonRange(bounds, null);
    expect(range).toMatchObject({
      startKey: "2014-01-01",
      endKey: "2022-12-31",
      startYear: 2014,
      endYear: 2022,
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

  it("gives a single-year history a full year of axis rather than a zero-width one", () => {
    const range = ribbonRange({ minKey: "2020-03-01", maxKey: "2020-03-02" }, null);
    expect(range?.totalDays).toBe(365); // 2020 is a leap year: Jan 1 → Dec 31
  });

  it("is null when there is nothing to draw", () => {
    expect(ribbonRange(null, "2026-08-14")).toBeNull();
  });
});

describe("offsetPercent", () => {
  const range = ribbonRange({ minKey: "2020-01-01", maxKey: "2020-12-31" }, null);

  it("puts the first day at 0 and the last at 100", () => {
    expect(offsetPercent(range!, "2020-01-01")).toBe(0);
    expect(offsetPercent(range!, "2020-12-31")).toBe(100);
  });

  it("clamps a date outside the range instead of drawing off the container", () => {
    expect(offsetPercent(range!, "1998-01-01")).toBe(0);
    expect(offsetPercent(range!, "2099-01-01")).toBe(100);
  });
});

describe("axisTicks", () => {
  function range(startYear: number, endYear: number) {
    const value = ribbonRange(
      { minKey: `${startYear}-06-01`, maxKey: `${endYear}-06-01` },
      null,
    );
    if (!value) throw new Error("range");
    return value;
  }

  it("lands ticks on round multiples, not on the range's own first year", () => {
    // A decade axis beginning at 1997 reads as arbitrary.
    expect(axisTicks(range(1997, 2026), null).map((tick) => tick.year)).toEqual([
      2000, 2005, 2010, 2015, 2020, 2025,
    ]);
  });

  it("widens the step at Fit so a long life does not print thirty labels", () => {
    expect(axisTicks(range(1980, 2026), null).length).toBeLessThanOrEqual(8);
  });

  it("uses every year when a fixed zoom gives each label room", () => {
    expect(axisTicks(range(2018, 2022), 200).map((tick) => tick.year)).toEqual([
      2018, 2019, 2020, 2021, 2022,
    ]);
  });

  it("thins the labels when a fixed zoom is too tight for them", () => {
    // 20px per year cannot carry a four-digit label every year.
    expect(axisTicks(range(2000, 2020), 20).map((tick) => tick.year)).toEqual([
      2000, 2005, 2010, 2015, 2020,
    ]);
  });

  it("gives a one-year range its single tick", () => {
    expect(axisTicks(range(2020, 2020), null).map((tick) => tick.year)).toEqual([2020]);
  });
});
