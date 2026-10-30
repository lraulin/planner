import { Client } from "@upstash/qstash";
import { publicOrigin } from "@/lib/oauth/origin";

/**
 * Schedule one firing callback with Upstash QStash.
 *
 * QStash is what lets reminders fire at their minute without a per-minute poll: it calls
 * `POST /api/reminders/fire` at `fireAt`, so Neon wakes only for real firings and the daily
 * sweep. Nothing ever cancels a message — the firing route re-checks the occurrence row
 * and a stale message is a no-op — so publishing is the only operation this module needs.
 *
 * With `QSTASH_TOKEN` unset (local development, preview deployments) this logs and returns:
 * `npm run reminders:fire-due` fires due rows against the local database instead. Preview
 * deployments share the production database, so the token belongs on Production only.
 */

export type FireMessage = { id: string; fireAt: string };

export function fireCallbackUrl(): string {
  return `${publicOrigin()}/api/reminders/fire`;
}

export async function publishFire(occurrence: {
  id: string;
  fireAt: Date;
}): Promise<void> {
  const token = process.env.QSTASH_TOKEN?.trim();
  const body: FireMessage = {
    id: occurrence.id,
    fireAt: occurrence.fireAt.toISOString(),
  };
  if (!token) {
    console.info(
      `[reminders] QSTASH_TOKEN unset; not scheduling ${body.id} for ${body.fireAt}`,
    );
    return;
  }

  const client = new Client({ token });
  await client.publishJSON({
    url: fireCallbackUrl(),
    body,
    // Seconds. A time already past delivers at once, which is what a just-missed reminder wants.
    notBefore: Math.floor(occurrence.fireAt.getTime() / 1000),
    // A snooze re-publishes the same row at a new time, so the time is part of the id.
    deduplicationId: `${body.id}-${occurrence.fireAt.getTime()}`,
    retries: 3,
  });
}
