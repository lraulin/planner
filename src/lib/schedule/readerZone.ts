import { zonedDateKey } from "./geometry";

/**
 * The zone "today" means for server code that has no reader to ask.
 *
 * `localDateKey` on the server reads the process zone, and on Vercel that is UTC, so a page
 * that says "today" there rolls over at 8 PM Eastern. The browser's `useToday` is the reader's
 * own wall-clock day. Anything the server prepares *for* that reader — the Register's first
 * query, the agent's "this month" — has to name the same day, or the two disagree for the four
 * evening hours a day and the browser throws the server's work away.
 *
 * One constant rather than a lookup: this is a one-person app and Lee's zone is the reader's
 * zone. It is a best-effort prediction, not a rule — a browser in another zone still computes
 * its own day and refetches, so a wrong guess costs a request and never a wrong answer.
 */
export const READER_TIME_ZONE = "America/New_York";

/** The reader's calendar day for an instant, as the server can best predict it. */
export function readerTodayKey(now: Date = new Date()): string {
  return zonedDateKey(now, READER_TIME_ZONE);
}
