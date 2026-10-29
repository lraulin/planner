import { syncWindow } from "@/lib/google/sync";
import { armHorizon, checkReadyToAssign, fireDue, type FireOutcome } from "./arm";
import { ARM_HORIZON_DAYS } from "./derive";
import { listSweepUserIds } from "./queries";

/**
 * The once-a-day job (`/api/cron/reminders`), and the only scheduled thing that wakes the
 * database on a day nothing fires. Per user, in order:
 *
 * 1. Pull the coming week from Google, so a project block made on the phone is in
 *    `appointments` — and armed — by morning.
 * 2. Arm everything due in the next seven days; supersede what went stale.
 * 3. Check Ready to Assign.
 *
 * Then, once, fire any `scheduled` row whose time has passed — a callback that never came.
 *
 * One user's failure is logged and the next user still runs: a revoked Google grant must not
 * stop anyone's bill reminder.
 */
export type SweepReport = {
  users: number;
  armed: number;
  superseded: number;
  failures: number;
  caughtUp: Record<FireOutcome, number>;
};

export async function runDailySweep(now: Date = new Date()): Promise<SweepReport> {
  const report: SweepReport = {
    users: 0,
    armed: 0,
    superseded: 0,
    failures: 0,
    caughtUp: { fired: 0, stale: 0, superseded: 0 },
  };

  for (const userId of await listSweepUserIds()) {
    report.users += 1;
    try {
      const status = await syncWindow(userId, {
        start: now,
        end: new Date(now.getTime() + (ARM_HORIZON_DAYS + 1) * 24 * 60 * 60_000),
      });
      if (status.state === "failed" || status.state === "not_linked") {
        console.warn("[reminders] sweep: Google pull", userId, status.message);
      }
    } catch (error) {
      console.error("[reminders] sweep: Google pull threw", userId, error);
    }

    try {
      const armed = await armHorizon(userId, now);
      report.armed += armed.armed;
      report.superseded += armed.superseded;
      await checkReadyToAssign(userId, now);
    } catch (error) {
      report.failures += 1;
      console.error("[reminders] sweep failed for user", userId, error);
    }
  }

  report.caughtUp = await fireDue(now);
  return report;
}
