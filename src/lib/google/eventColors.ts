/**
 * Google Calendar's fixed event colour palette.
 *
 * The Calendar API names these only by id (`"1"`–`"11"`); hex values come from
 * `GET /colors` and have been stable for years. We hardcode them so every schedule
 * render and write path stays offline — no colours endpoint on the critical path.
 *
 * See `agent-os/specs/2026-08-10-0937-google-event-colors/`.
 */

export type GoogleEventColor = {
  id: string;
  name: string;
  background: string;
  foreground: string;
};

/**
 * Ordered as Google presents them in the event colour picker.
 * Background/foreground pairs match the Calendar API `colors.event` resource.
 */
export const GOOGLE_EVENT_COLORS: readonly GoogleEventColor[] = [
  {
    id: "1",
    name: "Lavender",
    background: "#a4bdfc",
    foreground: "#1d1d1d",
  },
  {
    id: "2",
    name: "Sage",
    background: "#7ae7bf",
    foreground: "#1d1d1d",
  },
  {
    id: "3",
    name: "Grape",
    background: "#dbadff",
    foreground: "#1d1d1d",
  },
  {
    id: "4",
    name: "Flamingo",
    background: "#ff887c",
    foreground: "#1d1d1d",
  },
  {
    id: "5",
    name: "Banana",
    background: "#fbd75b",
    foreground: "#1d1d1d",
  },
  {
    id: "6",
    name: "Tangerine",
    background: "#ffb878",
    foreground: "#1d1d1d",
  },
  {
    id: "7",
    name: "Peacock",
    background: "#46d6db",
    foreground: "#1d1d1d",
  },
  {
    id: "8",
    name: "Graphite",
    background: "#e1e1e1",
    foreground: "#1d1d1d",
  },
  {
    id: "9",
    name: "Blueberry",
    background: "#5484ed",
    foreground: "#1d1d1d",
  },
  {
    id: "10",
    name: "Basil",
    background: "#51b749",
    foreground: "#1d1d1d",
  },
  {
    id: "11",
    name: "Tomato",
    background: "#dc2127",
    foreground: "#1d1d1d",
  },
] as const;

const BY_ID = new Map(GOOGLE_EVENT_COLORS.map((c) => [c.id, c]));

export function isGoogleEventColorId(value: string): boolean {
  return BY_ID.has(value);
}

/**
 * Background hex for a known Google event colour id, or null when the event uses the
 * calendar default (missing/empty/unknown id). Unknown ids must not invent a colour —
 * falling back to the calendar edge is better than a wrong fill.
 */
export function eventColorHex(colorId: string | null | undefined): string | null {
  if (!colorId) return null;
  return BY_ID.get(colorId)?.background ?? null;
}

/** Full palette entry, or null for default / unknown. */
export function eventColorEntry(
  colorId: string | null | undefined,
): GoogleEventColor | null {
  if (!colorId) return null;
  return BY_ID.get(colorId) ?? null;
}

/**
 * Normalise a form/API value to a stored `color_id`: known id, or null.
 * Garbage and empty string both become null so the DB never holds a dead id.
 */
export function normalizeColorId(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return isGoogleEventColorId(value) ? value : null;
}
