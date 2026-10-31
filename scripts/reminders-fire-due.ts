/**
 * Fire due reminders against the local database — the stand-in for QStash in development.
 *
 *   npm run reminders:fire-due              # fire every scheduled row whose time has come
 *   npm run reminders:fire-due -- --sweep   # run the whole daily sweep first (arm, RTA)
 *   npm run reminders:fire-due -- --watch   # keep firing every 30 seconds until stopped
 *
 * With `QSTASH_TOKEN` unset, saving a reminder arms its row and publishes nothing, so this is
 * what turns an armed row into a push. Pushes still need `VAPID_*` in `.env.local` and a
 * device subscribed from Settings → Notifications.
 *
 * Refuses a hosted database: production fires through QStash, never through this.
 */

import { fireDue } from "../src/lib/reminders/arm";
import { runDailySweep } from "../src/lib/reminders/sweep";
import { runMain } from "./cli";

function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    // Reported below with the same message as a hosted URL.
  }
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error("reminders:fire-due runs against the local database only.");
  }
}

async function once(sweep: boolean): Promise<void> {
  if (sweep) console.log("sweep", await runDailySweep());
  const counts = await fireDue();
  if (counts.fired + counts.stale + counts.superseded > 0) {
    console.log(new Date().toISOString(), counts);
  }
}

async function main(): Promise<number> {
  assertLocalDatabase();
  const sweep = process.argv.includes("--sweep");
  if (!process.argv.includes("--watch")) {
    await once(sweep);
    return 0;
  }
  console.log("Firing due reminders every 30 s. Ctrl-C to stop.");
  await once(sweep);
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 30_000));
    await once(false);
  }
}

runMain(main);
