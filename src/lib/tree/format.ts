import type { PriorityLetter } from "@/db/schema";

/**
 * Reading and writing the two notations Achieve uses in its grids: durations and ABCD
 * priorities. Each has a formatter and its inverse, so a cell can render a stored value
 * and parse back whatever the user types over it.
 */

/** Achieve counts a day as a working day, not 24 hours. */
const MINUTES_PER_DAY = 8 * 60;

const MONTHS = [
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
];

/**
 * A date short enough for a compact row's meta line: "12 Sep", or "12 Sep 27" once the year
 * stops being obvious.
 *
 * Takes a `YYYY-MM-DD` **day key** (from `toDateKey`), not a `Date`. Callers must convert
 * with `toDateKey` — never `toISOString().slice(0, 10)`. See
 * `agent-os/standards/development/dates.md`.
 */
export function formatCompactDate(
  iso: string | null | undefined,
  currentYear?: number,
): string {
  if (!iso) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return "";

  const [, year, month, day] = match;
  const label = MONTHS[Number(month) - 1];
  if (!label) return "";

  const shortDay = String(Number(day));
  return currentYear !== undefined && Number(year) !== currentYear
    ? `${shortDay} ${label} ${year.slice(2)}`
    : `${shortDay} ${label}`;
}

/** Formats minutes the way Achieve does: "45 min", "2 h", "3:45 h", "3 d". */
export function formatEffort(minutes: number | null): string {
  if (minutes === null || minutes === 0) return "";

  if (minutes % MINUTES_PER_DAY === 0) {
    return `${minutes / MINUTES_PER_DAY} d`;
  }

  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0
    ? `${hours} h`
    : `${hours}:${String(remainder).padStart(2, "0")} h`;
}

/** Dollar display for the cost fields Planner currently models. */
export function formatMoney(amount: number | null): string {
  if (amount === null || !Number.isFinite(amount)) return "";
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Reads a duration back into minutes. Accepts everything `formatEffort` emits, plus the
 * shorthand someone would actually type: "45m", "2h", "3:45", "3d", or a bare number of
 * minutes. Empty input clears the value; anything unrecognised returns `undefined` so the
 * caller can tell "cleared" from "not understood".
 */
export function parseEffort(text: string): number | null | undefined {
  const input = text.trim().toLowerCase();
  if (input === "") return null;

  // "3:45" or "3:45 h" — hours and minutes.
  const clock = /^(\d+):([0-5]\d)\s*h?$/.exec(input);
  if (clock) {
    return Number(clock[1]) * 60 + Number(clock[2]);
  }

  const scalar = /^(\d+(?:\.\d+)?)\s*(min|m|h|hr|hrs|d|day|days)?$/.exec(input);
  if (!scalar) return undefined;

  const value = Number(scalar[1]);
  switch (scalar[2]) {
    case "h":
    case "hr":
    case "hrs":
      return Math.round(value * 60);
    case "d":
    case "day":
    case "days":
      return Math.round(value * MINUTES_PER_DAY);
    // A bare number is minutes, matching how "45 min" renders.
    default:
      return Math.round(value);
  }
}

/** Formats a priority the way Achieve does: "A1", or bare "A" when unranked. */
export function formatPriority(
  letter: PriorityLetter | null,
  rank: number | null,
): string {
  if (letter === null) return "";
  return rank === null ? letter : `${letter}${rank}`;
}

/**
 * Reads "A1" or "A" back into its parts. Empty input clears the priority; anything
 * unrecognised returns `undefined`, so a typo reverts rather than silently clearing.
 *
 * Achieve also accepts `aa` as a typing shortcut for `A1` (home-row convenience —
 * no shift needed to reach `1`). See `docs/achieve-planner/release-log.txt`
 * (1.1.10).
 */
export function parsePriority(
  text: string,
): { letter: PriorityLetter | null; rank: number | null } | undefined {
  const input = text.trim().toUpperCase();
  if (input === "") return { letter: null, rank: null };

  // Achieve shortcut: "aa" → A1. Not generalized to bb/cc/dd — release note names only aa.
  if (input === "AA") return { letter: "A", rank: 1 };

  const match = /^([ABCD])(\d{1,2})?$/.exec(input);
  if (!match) return undefined;

  return {
    letter: match[1] as PriorityLetter,
    rank: match[2] ? Number(match[2]) : null,
  };
}
