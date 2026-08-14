import { asOneOf, asRecord } from "./parse";
import { SETTINGS_VERSION } from "./scopes";

/**
 * What the Timeline page remembers: which way it is drawing the same records, and how far the
 * ribbon is zoomed in. Stored under `timeline`.
 *
 * **Why this is not `grid:timeline`.** That scope belongs to `useGridState` and holds the grid's
 * own lens — columns, filters, sorts, density. The presentation is a level above: it decides
 * whether there is a grid on screen at all. `components/data-grid.md` covers exactly this case —
 * "the rule is about the preference, not the hook … `useSetting` with a codec of its own, in a
 * scope that already belongs to that module" — and names the failure mode it prevents: every
 * preference that escaped into `useState` reset itself on every visit.
 *
 * The zoom lives here rather than in the ribbon's own state for the same reason. Someone who
 * reads their life a decade at a time reads it that way every time.
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
 * How much horizontal room a year gets.
 *
 * `fit` is not a number: the whole life is squeezed into whatever the container is, which is the
 * only setting that shows a phone the shape of a life without panning. The other two are fixed
 * pixels per year, so at `years` a single year is wide enough to place a month by eye.
 */
export const TIMELINE_ZOOMS = ["fit", "decades", "years"] as const;
export type TimelineZoom = (typeof TIMELINE_ZOOMS)[number];

/** `null` means "as wide as the container" — see `axisTicks`, which branches on it. */
export const ZOOM_PX_PER_YEAR: Record<TimelineZoom, number | null> = {
  fit: null,
  decades: 48,
  years: 220,
};

export const ZOOM_LABELS: Record<TimelineZoom, string> = {
  fit: "Fit",
  decades: "Decades",
  years: "Years",
};

export type TimelineSettings = {
  presentation: TimelinePresentation;
  zoom: TimelineZoom;
};

export const DEFAULT_TIMELINE_SETTINGS: TimelineSettings = {
  presentation: "grid",
  zoom: "fit",
};

/**
 * Per-key fallbacks, so a blob written by an older build keeps the keys it does have. A stored
 * presentation must survive the day a fourth zoom is added or an old one is renamed.
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
    zoom: asOneOf(record.zoom, TIMELINE_ZOOMS, DEFAULT_TIMELINE_SETTINGS.zoom),
  };
}

export function serializeTimelineSettings(settings: TimelineSettings): unknown {
  return { v: SETTINGS_VERSION, ...settings };
}
