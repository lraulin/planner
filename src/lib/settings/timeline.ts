import { asOneOf, asRecord, asString } from "./parse";
import { SETTINGS_VERSION } from "./scopes";

/**
 * What the Timeline page remembers: which way it is drawing the same records, and which stretch
 * of time the ribbon is showing. Stored under `timeline`.
 *
 * **Why this is not `grid:timeline`.** That scope belongs to `useGridState` and holds the grid's
 * own lens — columns, filters, sorts, density. The presentation is a level above: it decides
 * whether there is a grid on screen at all. `components/data-grid.md` covers exactly this case —
 * "the rule is about the preference, not the hook … `useSetting` with a codec of its own, in a
 * scope that already belongs to that module" — and names the failure mode it prevents: every
 * preference that escaped into `useState` reset itself on every visit.
 *
 * The window lives here rather than in the ribbon's own state for the same reason. Someone who
 * came back to look at 2014 again should not have to find it again.
 */

/**
 * `grid` is the chronology; `ribbon` is the picture.
 *
 * `grid` is the default because it is the surface you can edit on, and because it is what was
 * there before the ribbon existed — nobody's page should change under them on deploy day.
 */
export const TIMELINE_PRESENTATIONS = ["grid", "ribbon"] as const;
export type TimelinePresentation = (typeof TIMELINE_PRESENTATIONS)[number];

/**
 * The stretch of time the ribbon is drawing, as two `YYYY-MM-DD` keys, or `null` for the whole
 * life.
 *
 * **There is no zoom setting; this replaced it.** `Fit | Decades | Years` scaled the axis and left
 * you to pan sideways to reach a year, which is the long way round to "show me 2015" — and on a
 * phone it meant a life measured in screens. A window fills the container whatever its size, so
 * narrowing it *is* zooming in and the phone and the desktop behave the same way.
 *
 * Stored as dates rather than as years because the reader drags one out, and a drag lands where it
 * lands. Rounding it to whole years would undo the gesture.
 */
export type TimelineWindow = { startKey: string; endKey: string };

export type TimelineSettings = {
  presentation: TimelinePresentation;
  window: TimelineWindow | null;
};

export const DEFAULT_TIMELINE_SETTINGS: TimelineSettings = {
  presentation: "grid",
  window: null,
};

/**
 * Per-key fallbacks, so a blob written by an older build keeps the keys it does have. A stored
 * presentation must survive the day the window's shape changes, and it already has: builds
 * before this one stored a `zoom` key, which is simply not read any more.
 */
export function parseTimelineSettings(value: unknown): TimelineSettings {
  const record = asRecord(value);
  if (!record) return DEFAULT_TIMELINE_SETTINGS;

  return {
    presentation: asOneOf(
      record.presentation,
      TIMELINE_PRESENTATIONS,
      DEFAULT_TIMELINE_SETTINGS.presentation,
    ),
    window: parseWindow(record.window),
  };
}

/**
 * Both ends or neither. A half-written window is not a narrower view, it is an unanswerable
 * question about where the other edge is, so it degrades to the whole life.
 */
function parseWindow(value: unknown): TimelineWindow | null {
  const record = asRecord(value);
  if (!record) return null;

  const startKey = asString(record.startKey, "");
  const endKey = asString(record.endKey, "");
  if (!isDateKey(startKey) || !isDateKey(endKey) || startKey > endKey) return null;

  return { startKey, endKey };
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isDateKey(value: string): boolean {
  return DATE_KEY.test(value);
}

export function serializeTimelineSettings(settings: TimelineSettings): unknown {
  return { v: SETTINGS_VERSION, ...settings };
}
