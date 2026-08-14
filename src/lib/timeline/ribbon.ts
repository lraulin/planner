import { formatPostalAddress } from "@/lib/address";
import { daysBetweenKeys, shiftDateKey } from "@/lib/schedule/geometry";
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
 *
 * **Packing happens at render, not here.** Which bars are on screen depends on the window the
 * reader has dragged out, so `deriveRibbon` hands over a flat list per lane and the component
 * calls {@link packLane} on the ones it is actually drawing. Packing the whole life on the server
 * and then filtering would leave a lane full of sub-rows holding nothing.
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
  bars: RibbonBar[];
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
      { id: "home", label: LANE_LABELS.home, bars: homeBars },
      { id: "work", label: LANE_LABELS.work, bars: workBars },
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
export function packLane(bars: readonly RibbonBar[]): RibbonBar[][] {
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

/**
 * The stretch of time the ribbon is currently drawing, always filling the container.
 *
 * There is no zoom control and no horizontal scrolling: the range **is** the zoom, so narrowing it
 * magnifies what is left. That is one idea where two were fighting — a `Years` zoom used to start
 * you at 1997 and make you pan to reach 2015, which is the long way round to "show me 2015".
 */
export type RibbonRange = { startKey: string; endKey: string; totalDays: number };

/** A reader-chosen stretch, from dragging across the ribbon. `null` is the whole life. */
export type RibbonWindow = { startKey: string; endKey: string };

/**
 * What to draw: the dragged window if there is one, otherwise everything, rounded out to whole
 * years so the default view's ticks land on Januaries.
 *
 * `todayKey` is `null` on the server and before hydration, and the default range then ends at the
 * last recorded date. That is a correct drawing of what is known rather than a placeholder — an
 * ongoing bar reaching the right edge is exactly what "still going" looks like — so nothing has to
 * suppress the ribbon until it hydrates. A window, being explicit, is used as given.
 */
export function ribbonRange(
  bounds: RibbonBounds | null,
  todayKey: string | null,
  window: RibbonWindow | null = null,
): RibbonRange | null {
  if (!bounds) return null;
  if (window) return rangeOf(window.startKey, window.endKey);

  const startYear = yearOf(bounds.minKey);
  const lastKey = todayKey && todayKey > bounds.maxKey ? todayKey : bounds.maxKey;
  return rangeOf(`${pad4(startYear)}-01-01`, `${pad4(yearOf(lastKey))}-12-31`);
}

function rangeOf(startKey: string, endKey: string): RibbonRange {
  return {
    startKey,
    endKey,
    totalDays: Math.max(1, daysBetweenKeys(startKey, endKey)),
  };
}

/** Where a date sits on the axis, 0–100. Clamped, so a bar can never escape its container. */
export function offsetPercent(range: RibbonRange, key: string): number {
  const raw = (daysBetweenKeys(range.startKey, key) / range.totalDays) * 100;
  return Math.min(100, Math.max(0, raw));
}

/** The date under a point on the ribbon, as a fraction of its width. The inverse of the above. */
export function keyAtFraction(range: RibbonRange, fraction: number): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  return shiftDateKey(range.startKey, Math.round(clamped * range.totalDays));
}

/**
 * A window narrow enough to be useless is widened around its own middle rather than rejected.
 *
 * A drag of a few pixels across thirty years is a handful of days, and the reader who did it meant
 * "in here somewhere", not "these four days". Snapping back to nothing would make a slightly
 * imprecise gesture feel broken; widening keeps the gesture cheap to attempt.
 */
export const MIN_WINDOW_DAYS = 30;

export function clampWindow(startKey: string, endKey: string): RibbonWindow {
  const [from, to] = startKey <= endKey ? [startKey, endKey] : [endKey, startKey];
  const days = daysBetweenKeys(from, to);
  if (days >= MIN_WINDOW_DAYS) return { startKey: from, endKey: to };

  const grow = Math.ceil((MIN_WINDOW_DAYS - days) / 2);
  return { startKey: shiftDateKey(from, -grow), endKey: shiftDateKey(to, grow) };
}

/** Whether any part of a span falls inside the drawn range. Half-open ends reach forever. */
export function barInRange(bar: RibbonBar, range: RibbonRange): boolean {
  return effectiveStart(bar) <= range.endKey && effectiveEnd(bar) >= range.startKey;
}

export type RibbonTick = {
  dateKey: string;
  label: string;
  /** A year boundary — drawn brighter, because it is what the reader is orienting by. */
  major: boolean;
};

/**
 * Axis marks at whatever granularity the current width can carry.
 *
 * Steps are whole months so that every tick is a real calendar boundary, and aligning to multiples
 * of the step falls out for free: a 60-month step lands on years divisible by five because
 * `year * 12` is divisible by 60 exactly when the year is. Ticks land on those multiples rather
 * than on the range's own first day, since an axis beginning at "17 March 1997" reads as arbitrary.
 *
 * `widthPx` is `null` until the container has been measured; the assumed width is the narrow end,
 * so the first paint is sparse rather than overlapping and then thickens.
 */
export function axisTicks(range: RibbonRange, widthPx: number | null): RibbonTick[] {
  const width = widthPx ?? ASSUMED_WIDTH_PX;
  const pxPerDay = width / range.totalDays;
  const step =
    TICK_STEPS_MONTHS.find(
      (months) => months * DAYS_PER_MONTH * pxPerDay >= MIN_TICK_PX,
    ) ?? TICK_STEPS_MONTHS[TICK_STEPS_MONTHS.length - 1];

  const startIndex = monthIndex(range.startKey);
  const first = Math.ceil(startIndex / step) * step;

  const ticks: RibbonTick[] = [];
  for (let index = first; ; index += step) {
    const dateKey = keyOfMonthIndex(index);
    if (dateKey > range.endKey) break;
    // A window starting mid-month aligns to the 1st, which is *behind* the left edge. Drawing it
    // would clamp it to 0% and label the edge with a month the reader did not select.
    if (dateKey < range.startKey) continue;
    // The first mark carries the year even mid-year, or a range inside one year never names it.
    const major = index % 12 === 0;
    ticks.push({
      dateKey,
      label: tickLabel(index, step, major || ticks.length === 0),
      major,
    });
  }
  return ticks;
}

/** 1 / 3 / 6 months, then 1, 2, 5, 10, 25, 50, 100 years. */
const TICK_STEPS_MONTHS = [1, 3, 6, 12, 24, 60, 120, 300, 600, 1200] as const;
/** Roughly a label plus breathing room. */
const MIN_TICK_PX = 56;
/** The narrow end — a phone — used until a real measurement arrives. */
const ASSUMED_WIDTH_PX = 360;
const DAYS_PER_MONTH = 365.25 / 12;

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * `"2015"` at a year or coarser; `"Mar"` below that, with the year attached where it changes.
 *
 * Deliberately not `useDateFormatter`: that renders a *record's* date in the reader's chosen
 * format, and an axis mark is a scale, not a value. "3/1/2015" on a tick would claim something
 * happened that day.
 */
function tickLabel(index: number, step: number, withYear: boolean): string {
  const year = Math.floor(index / 12);
  if (step >= 12) return String(year);
  const month = MONTH_NAMES[index % 12];
  return withYear ? `${month} ${year}` : month;
}

/** Months since year 0, the unit every tick step is a multiple of. */
function monthIndex(key: string): number {
  return yearOf(key) * 12 + (Number(key.slice(5, 7)) - 1);
}

function keyOfMonthIndex(index: number): string {
  return `${pad4(Math.floor(index / 12))}-${pad2((index % 12) + 1)}-01`;
}

/**
 * How much room each pin has for a label before it would run into the next one.
 *
 * `null` means "no room, leave it to the tooltip". Returning the available width rather than a
 * yes/no lets the label truncate into whatever it got, which is why nothing here has to guess how
 * wide a string renders — the browser already knows, and a character-count estimate would be wrong
 * in exactly the crowded cases that matter.
 *
 * Pins must arrive sorted by date, as `deriveRibbon` leaves them. Two events on the same day give
 * the earlier one a gap of zero, so it drops its label and the later one keeps its own — better
 * than two labels drawn on top of each other.
 */
export function pinLabelWidths(
  pins: readonly RibbonPin[],
  range: RibbonRange,
  widthPx: number | null,
): (number | null)[] {
  if (widthPx === null) return pins.map(() => null);

  return pins.map((pin, index) => {
    const x = (offsetPercent(range, pin.dateKey) / 100) * widthPx;
    const next = pins[index + 1];
    const limit = next ? (offsetPercent(range, next.dateKey) / 100) * widthPx : widthPx;
    const room = limit - x - PIN_LABEL_GAP_PX;
    return room >= MIN_PIN_LABEL_PX ? room : null;
  });
}

/** Below this a label is an ellipsis and a letter, which teaches less than no label at all. */
const MIN_PIN_LABEL_PX = 44;
/** Clear air between one label and the next pin's dot. */
const PIN_LABEL_GAP_PX = 8;

function yearOf(key: string): number {
  return Number(key.slice(0, 4));
}

function pad4(year: number): string {
  return String(year).padStart(4, "0");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
