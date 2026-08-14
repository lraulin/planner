import { formatPostalAddress } from "@/lib/address";
import { daysBetweenKeys } from "@/lib/schedule/geometry";
import { employerName, residenceName } from "./naming";
import type { LifeEventDetail } from "./types";

/**
 * The Timeline ribbon: the same records the chronology draws as a list, drawn as spans.
 *
 * **This is the projection the chronology deliberately refuses to be.** `chronology.ts` splits a
 * job into "Started at Acme" and "Left Acme" because the grid answers "what happened, in order".
 * The ribbon answers the question that left behind — how long, and what overlapped — so here a
 * job is one bar with two ends.
 *
 * **It derives from the records, not from the chronology rows.** A bar is labelled "Acme", and
 * the only place that string exists unwrapped is `jobs`; recovering it from `"Started at Acme"`
 * would be a parser over prose we generated ourselves. Both projections take the same three
 * lists, from one read (`loadLifeHistory`).
 *
 * **Nothing here knows what day it is.** Today belongs to the reader's clock
 * (`development/dates.md`), so it arrives at render time through `useToday()`. Everything that
 * depends on it — where an ongoing bar stops, where the axis ends — is in `ribbonRange` and in
 * the component. That split is what lets the expensive half be computed on the server and stay
 * deterministic under test.
 */

export type RibbonBarSource = "job" | "residence";

/** One span. `null` on either end means "not recorded", which is drawn differently from a date. */
export type RibbonBar = {
  /** `job:<uuid>` / `residence:<uuid>` — one bar per record, unlike the chronology's two rows. */
  id: string;
  source: RibbonBarSource;
  sourceId: string;
  /** "Acme Corp", "Seoul". */
  label: string;
  /** The second line in the detail strip: a job title, a full address. */
  detail: string;
  startKey: string | null;
  endKey: string | null;
};

export type RibbonLaneId = "home" | "work";

export type RibbonLane = {
  id: RibbonLaneId;
  label: string;
  /**
   * Sub-rows. Two bars that overlap in time land on different ones, so a lease that runs past a
   * move stacks instead of drawing over the address that replaced it.
   */
  rows: RibbonBar[][];
};

export type RibbonPin = {
  /** `event:<uuid>`, matching the chronology row id so a pin can select its row on the grid. */
  id: string;
  sourceId: string;
  dateKey: string;
  title: string;
  category: string;
  /** Index into the categorical chart palette; `FOLD_COLOR_INDEX` is the dull catch-all. */
  colorIndex: number;
};

/** One legend entry: a category name and the colour it was given. */
export type RibbonCategory = { label: string; colorIndex: number };

/** The span of everything recorded. `null` when nothing is dated at all. */
export type RibbonBounds = { minKey: string; maxKey: string };

export type Ribbon = {
  lanes: RibbonLane[];
  pins: RibbonPin[];
  categories: RibbonCategory[];
  bounds: RibbonBounds | null;
};

/**
 * The palette has eight entries and `--chart-cat-8` is documented as the fold — "deliberately the
 * dullest". Categories past the seventh, and events with no category at all, share it.
 */
const PALETTE_SIZE = 8;
export const FOLD_COLOR_INDEX = PALETTE_SIZE - 1;
const FOLD_LABEL = "Other";

/** Lane order: where you lived above where you worked, because a move usually explains a job. */
const LANE_LABELS: Record<RibbonLaneId, string> = { home: "Home", work: "Work" };

type JobDates = {
  id: string;
  employer: string;
  jobTitle: string;
  startDate: string | null;
  endDate: string | null;
};

type ResidenceDates = {
  id: string;
  label: string;
  streetAddress: string;
  extendedAddress: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  movedIn: string | null;
  movedOut: string | null;
};

export function deriveRibbon(
  events: readonly LifeEventDetail[],
  jobs: readonly JobDates[],
  residences: readonly ResidenceDates[],
): Ribbon {
  const homeBars = residences
    .filter((residence) => residence.movedIn || residence.movedOut)
    .map((residence): RibbonBar => ({
      id: `residence:${residence.id}`,
      source: "residence",
      sourceId: residence.id,
      label: residenceName(residence),
      detail: formatPostalAddress(residence),
      startKey: residence.movedIn,
      endKey: residence.movedOut,
    }));

  const workBars = jobs
    .filter((job) => job.startDate || job.endDate)
    .map((job): RibbonBar => ({
      id: `job:${job.id}`,
      source: "job",
      sourceId: job.id,
      label: employerName(job),
      detail: job.jobTitle,
      startKey: job.startDate,
      endKey: job.endDate,
    }));

  const { pins, categories } = derivePins(events);

  return {
    lanes: [
      { id: "home", label: LANE_LABELS.home, rows: packLane(homeBars) },
      { id: "work", label: LANE_LABELS.work, rows: packLane(workBars) },
    ],
    pins,
    categories,
    bounds: boundsOf([...homeBars, ...workBars], pins),
  };
}

/**
 * Lay bars into as few sub-rows as they need, first-fit by start date.
 *
 * A bar with no recorded start is treated as reaching back forever and one with no recorded end
 * as reaching forward forever, using sentinel keys that sort outside any real date. That is not a
 * trick to avoid a branch — it is the honest reading. A job you still hold *does* occupy the rest
 * of the lane, so nothing else may share its row, and that has to be true without knowing today.
 *
 * Touching is not overlapping: a residence you left on the day you moved into the next one shares
 * a row, and the two bars read as one continuous band, which is what happened.
 */
function packLane(bars: readonly RibbonBar[]): RibbonBar[][] {
  const sorted = [...bars].sort(
    (a, b) =>
      effectiveStart(a).localeCompare(effectiveStart(b)) || a.id.localeCompare(b.id),
  );

  const rows: RibbonBar[][] = [];
  for (const bar of sorted) {
    const row = rows.find((candidate) => {
      const last = candidate[candidate.length - 1];
      return effectiveStart(bar) >= effectiveEnd(last);
    });
    if (row) row.push(bar);
    else rows.push([bar]);
  }
  return rows;
}

/** Sorts before every real `YYYY-MM-DD`. */
const OPEN_START = "0000-00-00";
/** Sorts after every real `YYYY-MM-DD`. */
const OPEN_END = "9999-99-99";

function effectiveStart(bar: RibbonBar): string {
  return bar.startKey ?? OPEN_START;
}

function effectiveEnd(bar: RibbonBar): string {
  return bar.endKey ?? OPEN_END;
}

/**
 * Pins, and the colour each category gets.
 *
 * **Assigned by sorted-distinct index, never by hashing the string.** A hash gives a category the
 * same colour everywhere, which sounds better than it is: two categories can then collide with no
 * way to fix it, and the palette a reader sees depends on categories that are not on screen.
 * Sorting is deterministic given the data, and the legend is the thing that makes it legible.
 */
function derivePins(events: readonly LifeEventDetail[]): {
  pins: RibbonPin[];
  categories: RibbonCategory[];
} {
  const named = [
    ...new Set(
      events
        .map((event) => event.category.trim())
        .filter((category) => category !== ""),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const colors = new Map<string, number>();
  named.forEach((category, index) => {
    colors.set(category, index < FOLD_COLOR_INDEX ? index : FOLD_COLOR_INDEX);
  });

  const pins = events
    .map((event): RibbonPin => ({
      id: `event:${event.id}`,
      sourceId: event.id,
      dateKey: event.eventDate,
      title: event.title,
      category: event.category.trim(),
      colorIndex: colors.get(event.category.trim()) ?? FOLD_COLOR_INDEX,
    }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.id.localeCompare(b.id));

  const categories: RibbonCategory[] = named
    .slice(0, FOLD_COLOR_INDEX)
    .map((label, index) => ({ label, colorIndex: index }));

  // One fold entry covers both overflow categories and events left uncategorised, because the
  // legend's job is to explain the colours on screen and those two share one.
  if (pins.some((pin) => pin.colorIndex === FOLD_COLOR_INDEX)) {
    categories.push({ label: FOLD_LABEL, colorIndex: FOLD_COLOR_INDEX });
  }

  return { pins, categories };
}

function boundsOf(
  bars: readonly RibbonBar[],
  pins: readonly RibbonPin[],
): RibbonBounds | null {
  const keys = [
    ...bars.flatMap((bar) => [bar.startKey, bar.endKey]),
    ...pins.map((pin) => pin.dateKey),
  ].filter((key): key is string => key !== null);

  if (keys.length === 0) return null;
  return {
    minKey: keys.reduce((min, key) => (key < min ? key : min)),
    maxKey: keys.reduce((max, key) => (key > max ? key : max)),
  };
}

/** The drawn axis: whole calendar years, so a tick is always a January 1st. */
export type RibbonRange = {
  startKey: string;
  endKey: string;
  startYear: number;
  endYear: number;
  totalDays: number;
};

/**
 * Widen the recorded bounds to whole years, and out to today if today is later.
 *
 * `todayKey` is `null` on the server and before hydration, and the axis then simply ends at the
 * last recorded date. That is a correct drawing of what is known rather than a placeholder — an
 * ongoing bar reaching the right edge is exactly what "still going" looks like — so nothing has to
 * suppress the ribbon until it hydrates.
 */
export function ribbonRange(
  bounds: RibbonBounds | null,
  todayKey: string | null,
): RibbonRange | null {
  if (!bounds) return null;

  const startYear = yearOf(bounds.minKey);
  const lastKey = todayKey && todayKey > bounds.maxKey ? todayKey : bounds.maxKey;
  const endYear = yearOf(lastKey);

  const startKey = `${pad4(startYear)}-01-01`;
  const endKey = `${pad4(endYear)}-12-31`;

  return {
    startKey,
    endKey,
    startYear,
    endYear,
    totalDays: daysBetweenKeys(startKey, endKey),
  };
}

/** Where a date sits on the axis, 0–100. Clamped, so a bar can never escape its container. */
export function offsetPercent(range: RibbonRange, key: string): number {
  const raw = (daysBetweenKeys(range.startKey, key) / range.totalDays) * 100;
  return Math.min(100, Math.max(0, raw));
}

export type RibbonTick = { year: number; dateKey: string };

/**
 * The year marks to label, at a step that keeps them from colliding.
 *
 * Two regimes, because the ribbon has two: at a fixed zoom the width per year is known, so the
 * step is whatever gives each label its ~44px. At `Fit` the width is whatever the container
 * happens to be — the same markup serves a 390px phone and a 1440px desktop — so the step comes
 * from a label budget instead, sized for the narrow end. Measuring the container to do better
 * would buy a denser desktop axis at the cost of a `ResizeObserver` in a static picture.
 *
 * Ticks land on multiples of the step (1990, 2000, 2010), not on the range's own first year,
 * because a decade axis starting at 1997 reads as arbitrary.
 */
export function axisTicks(range: RibbonRange, pxPerYear: number | null): RibbonTick[] {
  const step = tickStep(range.endYear - range.startYear + 1, pxPerYear);
  const first = Math.ceil(range.startYear / step) * step;

  const ticks: RibbonTick[] = [];
  for (let year = first; year <= range.endYear; year += step) {
    ticks.push({ year, dateKey: `${pad4(year)}-01-01` });
  }
  return ticks;
}

const TICK_STEPS = [1, 2, 5, 10, 25, 50, 100] as const;
/** Roughly a four-digit label plus breathing room. */
const MIN_LABEL_PX = 44;
/** How many labels a 390px ribbon can carry at `Fit` before they run together. */
const FIT_LABEL_BUDGET = 6;

function tickStep(years: number, pxPerYear: number | null): number {
  const fits = (step: number) =>
    pxPerYear === null
      ? years / step <= FIT_LABEL_BUDGET
      : step * pxPerYear >= MIN_LABEL_PX;
  return TICK_STEPS.find(fits) ?? TICK_STEPS[TICK_STEPS.length - 1];
}

function yearOf(key: string): number {
  return Number(key.slice(0, 4));
}

function pad4(year: number): string {
  return String(year).padStart(4, "0");
}
