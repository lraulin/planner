import type { NodeState, PriorityLetter, ProgressReview } from "@/db/schema";
import { daysInMonth } from "@/lib/dateMath";
import type { AchPriority } from "./types";

/**
 * Achieve stores ABCD priorities as a single int. Each letter owns a 2500-wide band;
 * the offset inside the band is the rank (1-based). Bare letter is offset 0 for B/C/D;
 * for A, rank starts at 1 (A1 = 1) and there is no bare-A zero in real files.
 *
 * `100000` (and anything at or above it) means no priority — the schema default.
 */
export const ACH_PRIORITY_NONE = 100000;
const BAND = 2500;
const LETTERS: PriorityLetter[] = ["A", "B", "C", "D"];

/** Decode Achieve's priority int into letter + rank. */
export function decodePriority(value: number | null | undefined): AchPriority {
  if (
    value === null ||
    value === undefined ||
    value >= ACH_PRIORITY_NONE ||
    value < 0
  ) {
    return { letter: null, rank: null };
  }

  const letterIndex = Math.min(Math.floor(value / BAND), LETTERS.length - 1);
  const letter = LETTERS[letterIndex];
  const offset = value - letterIndex * BAND;

  // Bare B/C/D is offset 0. A has no bare form in practice; offset 0 would be odd, treat as A without rank.
  if (offset === 0) {
    return { letter, rank: null };
  }
  return { letter, rank: offset };
}

/** Encode letter + rank back to Achieve's int. Null letter → 100000. */
export function encodePriority(priority: AchPriority): number {
  if (priority.letter === null) return ACH_PRIORITY_NONE;
  const letterIndex = LETTERS.indexOf(priority.letter);
  if (letterIndex < 0) return ACH_PRIORITY_NONE;

  const base = letterIndex * BAND;
  if (priority.rank === null || priority.rank <= 0) {
    // Bare letter: A has no stable bare form in files (A1 is the usual minimum). Use base+1 for A.
    return letterIndex === 0 ? base + 1 : base;
  }
  return base + priority.rank;
}

/**
 * Achieve State codes in the order the app lists them (see `STATE_CODES` in hierarchy.ts).
 * Correlated on real Full XML: 0/1/3 are solid; 2 and 4–8 match the documented labels and
 * plausible project names (status 8 on "Become Ubuntu maintainer?" → proposed).
 */
const STATUS_BY_CODE: NodeState[] = [
  "not_started", // 0
  "in_progress", // 1
  "waiting", // 2
  "completed", // 3
  "postponed", // 4
  "delegated", // 5
  "should_delegate", // 6
  "cancelled", // 7
  "proposed", // 8
];

export function decodeStatus(code: number | null | undefined): NodeState {
  if (
    code === null ||
    code === undefined ||
    code < 0 ||
    code >= STATUS_BY_CODE.length
  ) {
    return "not_started";
  }
  return STATUS_BY_CODE[code];
}

export function encodeStatus(state: NodeState): number {
  const idx = STATUS_BY_CODE.indexOf(state);
  return idx >= 0 ? idx : 0;
}

/**
 * Achieve Goal `ProgressReviewSchedule` int → our enum.
 * Observed default is `1` on almost every goal; treat 0 as none, 1 as weekly (the usual
 * planning cadence), 2 as daily. Unknown codes collapse to none.
 */
export function decodeProgressReview(code: number | null | undefined): ProgressReview {
  if (code === 1) return "weekly";
  if (code === 2) return "daily";
  return "none";
}

export function encodeProgressReview(value: ProgressReview): number {
  if (value === "weekly") return 1;
  if (value === "daily") return 2;
  return 0;
}

/**
 * Percent complete: Achieve uses hundredths of a percent (10000 = 100%).
 * We store whole percent 0–100.
 */
export function decodePercentComplete(value: number | null | undefined): number {
  if (value === null || value === undefined || value <= 0) return 0;
  return Math.min(100, Math.round(value / 100));
}

export function encodePercentComplete(percent: number): number {
  if (percent <= 0) return 0;
  return Math.min(10000, Math.round(percent * 100));
}

/**
 * Effort/duration unit codes observed in Full XML: 0 = minutes, 1 = hours.
 * Unknown units fall back to minutes so we never invent days from a bare number.
 */
export function decodeEffortToMinutes(
  amount: number | null | undefined,
  units: number | null | undefined,
): number | null {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return null;
  if (amount === 0) return 0;
  if (units === 1) return Math.round(amount * 60);
  return Math.round(amount);
}

export function encodeEffortFromMinutes(minutes: number | null): {
  amount: number | null;
  units: number;
} {
  if (minutes === null) return { amount: null, units: 0 };
  if (minutes !== 0 && minutes % 60 === 0 && minutes >= 60) {
    return { amount: minutes / 60, units: 1 };
  }
  return { amount: minutes, units: 0 };
}

/** A leading calendar day, whether or not a time follows it. */
const LEADING_DAY = /^(\d{4})-(\d{2})-(\d{2})(?=$|[T ])/;

/**
 * Parse an Achieve dateTime string; empty, missing or impossible → null.
 *
 * The impossible case is the one worth spelling out: `new Date("2011-02-31")` is not Invalid
 * Date, it is March 3. Achieve itself will not emit that, but this also reads files a user
 * hands the import panel, and a date that silently moves three days during an import is worse
 * than a field that arrives empty — the empty one is visible. Same rule the agent API's
 * `parseDate` applies; `rednotebook/parse.ts` has always done it.
 */
export function decodeDateTime(text: string | null | undefined): Date | null {
  if (!text || !text.trim()) return null;

  const day = LEADING_DAY.exec(text.trim());
  if (day) {
    const [, year, month, date] = day.map(Number);
    if (month < 1 || month > 12 || date < 1 || date > daysInMonth(year, month)) {
      return null;
    }
  }

  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Read a field as int; missing or unparseable → null. */
export function intField(row: Record<string, string>, name: string): number | null {
  const raw = row[name];
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Read a field as boolean; Achieve writes "true"/"false". */
export function boolField(
  row: Record<string, string>,
  name: string,
  fallback = false,
): boolean {
  const raw = row[name];
  if (raw === undefined || raw === "") return fallback;
  return raw.toLowerCase() === "true";
}
