/**
 * Report the payee repairs a person could confirm, and write nothing.
 *
 * Run this before merging anything the normalizer fragmented:
 *
 *   npx tsx --env-file=.env.local scripts/payee-merge-audit.ts --user <uuid>
 *
 * There is no `--apply`, and there will not be one. A prefix sweep over the real 7,322-row
 * export merged `AMAZON PRIME` into `AMAZON` — collapsing a subscription into discretionary
 * spending — and `GRAY MIRROR` into the damaged fragment `GRAY`. Applying is the merge dialog,
 * one confirmation at a time, deliberately behind a human.
 */

import {
  formatPayeeRepairAudit,
  payeeRepairAudit,
} from "../src/lib/finances/payees/audit";
import { argValue, runMain } from "./cli";

async function main(): Promise<number> {
  const userId = argValue("--user");
  if (!userId) {
    console.error("Usage: tsx scripts/payee-merge-audit.ts --user <uuid>");
    return 2;
  }

  console.log(formatPayeeRepairAudit(await payeeRepairAudit(userId)));
  return 0;
}

runMain(main);
