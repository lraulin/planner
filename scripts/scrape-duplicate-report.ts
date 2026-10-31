/**
 * List `scrape:*` posted rows on feed-covered accounts that line up with a feed row at the
 * same amount and date — the duplicates D4 stopped creating but did not remove
 * (`agent-os/specs/2026-09-14-1004-ledger-ready-to-assign/` Task 7).
 *
 *   npx tsx --env-file=.env.local scripts/scrape-duplicate-report.ts --user <uuid>
 *
 * Read-only, same as `scripts/payee-merge-audit.ts`: there is no `--apply`. Confirm each
 * pair against the register, then delete the scrape row by hand.
 */

import {
  scrapeDuplicateReport,
  formatScrapeDuplicateReport,
} from "../src/lib/finances/scrapeDuplicateReport";
import { argValue, runMain } from "./cli";

async function main(): Promise<number> {
  const userId = argValue("--user");
  if (!userId) {
    console.error("Usage: tsx scripts/scrape-duplicate-report.ts --user <uuid>");
    return 2;
  }

  console.log(formatScrapeDuplicateReport(await scrapeDuplicateReport(userId)));
  return 0;
}

runMain(main);
