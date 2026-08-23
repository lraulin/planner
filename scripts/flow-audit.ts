/**
 * Report what the next reclassify would do to `derived_flow`, and write nothing.
 *
 * Run this before shipping any change to a detector in `src/lib/finances/classify/`. Flow
 * decides whether a row is counted as cost or as movement, so a detector change silently
 * restates reported spending, the pay-period result, the Sankey and the dashboard the next
 * time anything triggers a pass. This prints the size of that restatement first.
 *
 *   npx tsx --env-file=.env.local scripts/flow-audit.ts --user <uuid>
 *
 * There is no `--apply`. This script cannot write; applying is what the existing
 * "Run rules" / reclassify path already does, deliberately behind a human.
 */

import { previewFlowChanges } from "../src/lib/finances/mutations";
import { formatFlowDiff } from "../src/lib/finances/classify/flowDiff";

function userIdFromArgv(argv: readonly string[]): string | null {
  const at = argv.indexOf("--user");
  if (at === -1) return null;
  return argv[at + 1] ?? null;
}

async function main(): Promise<number> {
  const userId = userIdFromArgv(process.argv);
  if (!userId) {
    console.error("Usage: tsx scripts/flow-audit.ts --user <uuid>");
    return 2;
  }

  const diff = await previewFlowChanges(userId);
  console.log(formatFlowDiff(diff));

  if (diff.changed > 0) {
    console.log(
      "\nNothing was written. Explain every transition above before letting a reclassify run.",
    );
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
