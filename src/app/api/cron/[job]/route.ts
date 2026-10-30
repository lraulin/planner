import { revalidatePath } from "next/cache";
import { cronAuthorization } from "@/lib/cron/auth";
import { runBankSyncJob, runCalendarSyncJob } from "@/lib/cron/jobs";
import { isCronJob } from "@/lib/cron/report";

/**
 * Scheduled jobs: GET /api/cron/{bank-sync | calendar-sync}
 *
 * Invoked by Vercel Cron (schedules in `vercel.json`), which sends
 * `Authorization: Bearer $CRON_SECRET`. GET because that is the only method Vercel Cron
 * uses. Outside the session gate in `src/proxy.ts` for the same reason the agent API is:
 * the caller cannot log in, and a cron does not follow the redirect to `/login`.
 *
 * Answers 500 when any user's sync failed, so the run shows red in Vercel's cron log; the
 * body says which and why. Vercel does not retry, and the next run is a day away, so the
 * log is the only place a failure surfaces.
 */
// 60 s is the Hobby ceiling without Fluid compute; a SimpleFIN pull is a few seconds.
export const maxDuration = 60;

export async function GET(
  request: Request,
  context: { params: Promise<{ job: string }> },
) {
  const authorization = cronAuthorization(request, process.env.CRON_SECRET);
  if (authorization === "unconfigured") {
    return Response.json(
      { ok: false, error: "CRON_SECRET is not configured on the server" },
      { status: 500 },
    );
  }
  if (authorization === "unauthorized") {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { job } = await context.params;
  if (!isCronJob(job)) {
    return Response.json({ ok: false, error: `Unknown job ${job}` }, { status: 404 });
  }

  const report =
    job === "bank-sync" ? await runBankSyncJob() : await runCalendarSyncJob(new Date());
  // The manual buttons do the same: pages read through the cache, so new rows need it.
  revalidatePath("/", "layout");
  return Response.json(report, { status: report.ok ? 200 : 500 });
}
