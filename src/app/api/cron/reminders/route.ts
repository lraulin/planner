import { errorResponse, successResponse } from "@/lib/agent/envelope";
import { requireCronSecret } from "@/lib/reminders/callerAuth";
import { runDailySweep } from "@/lib/reminders/sweep";

/**
 * The daily reminders sweep, called by Vercel Cron (`vercel.json`) with `CRON_SECRET`.
 * Hobby cron is daily-only, which is exactly enough: QStash fires each reminder at its
 * minute, and this arms the week ahead and catches up anything missed.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    requireCronSecret(request);
    return successResponse(await runDailySweep());
  } catch (error) {
    return errorResponse(error);
  }
}
