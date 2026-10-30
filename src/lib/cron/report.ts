/**
 * The pure half of the scheduled syncs: which window the calendar job mirrors, and how a
 * run's per-user outcomes fold into the one report the route returns. Kept free of the
 * database and the network so the judgement calls are unit-tested; `jobs.ts` moves bytes.
 */

import type { SyncResult } from "@/lib/banksync/sync";
import type { SyncStatus } from "@/lib/google/sync";
import { syncWindowFor, type MirrorWindow } from "@/lib/google/mirror";

export const CRON_JOBS = ["bank-sync", "calendar-sync"] as const;
export type CronJob = (typeof CRON_JOBS)[number];

export function isCronJob(value: string): value is CronJob {
  return (CRON_JOBS as readonly string[]).includes(value);
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Look back far enough to catch last-minute edits to the week just lived. */
export const CALENDAR_LOOKBACK_DAYS = 7;
/** Look ahead over the horizon the planner is actually used to plan. */
export const CALENDAR_LOOKAHEAD_DAYS = 56;

/**
 * The window the daily calendar pull mirrors: a week back to eight weeks ahead, rounded out
 * to whole weeks by `syncWindowFor` exactly as an on-screen read would be.
 *
 * Wider than any one view on purpose. The point of the job is that the planner — and the
 * agent reading it over MCP, which never opens a page — sees Google's edits without a page
 * load having pulled them first. One list request per calendar either way, so the extra
 * weeks cost nothing but rows.
 */
export function calendarCronWindow(now: Date): MirrorWindow {
  return syncWindowFor({
    start: new Date(now.getTime() - CALENDAR_LOOKBACK_DAYS * DAY_MS),
    end: new Date(now.getTime() + CALENDAR_LOOKAHEAD_DAYS * DAY_MS),
  });
}

export type UserOutcome<T> =
  | { userId: string; ok: true; result: T }
  | { userId: string; ok: false; result?: T; error?: string };

export type CronReport<T> = {
  job: CronJob;
  ok: boolean;
  users: UserOutcome<T>[];
};

/**
 * Whether a bank sync result is healthy. `not_linked` is a setup prompt rather than a fault
 * (the settings page shows it), so it does not fail the run; every other non-`ok` state
 * means the feed stopped and someone has to act, which is what a red cron run is for.
 */
export function bankResultOk(result: SyncResult): boolean {
  return result.connections.every(
    (connection) => connection.state === "ok" || connection.state === "not_linked",
  );
}

/**
 * Whether a calendar sync status is healthy. `off` (nothing enabled any more) is fine;
 * `failed` and `not_linked` (Google access revoked) are not. `skipped` and `stale` are the
 * page path's freshness answers and `syncWindow` never returns them, but neither is a fault.
 */
export function calendarStatusOk(status: SyncStatus): boolean {
  return status.state !== "failed" && status.state !== "not_linked";
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Fold per-user outcomes into the run's report. One bad user fails the run, not the rest. */
export function cronReport<T>(job: CronJob, users: UserOutcome<T>[]): CronReport<T> {
  return { job, ok: users.every((user) => user.ok), users };
}
