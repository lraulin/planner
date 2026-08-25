/**
 * Bring existing off-budget savings (and any other core-kind off-budget row) into the
 * one account pool, rebasing opening once
 * (`agent-os/specs/2026-08-24-2206-single-pool-budget/` D5).
 *
 *   npx tsx scripts/single-pool-cutover.ts --user <uuid>            # dry run
 *   npx tsx scripts/single-pool-cutover.ts --user <uuid> --apply    # writes
 */

import { applySinglePoolCutover } from "../src/lib/finances/budget/membership";

function argValue(flag: string): string | null {
  const at = process.argv.indexOf(flag);
  return at === -1 ? null : (process.argv[at + 1] ?? null);
}

function usd(cents: number): string {
  return (cents / 100).toFixed(2);
}

async function main(): Promise<number> {
  const userId = argValue("--user");
  if (!userId) {
    console.error("Usage: tsx scripts/single-pool-cutover.ts --user <uuid> [--apply]");
    return 2;
  }
  const apply = process.argv.includes("--apply");
  const receipt = await applySinglePoolCutover(userId, { dryRun: !apply });

  console.log(`\nTransitions (${receipt.transitions.length}):`);
  for (const transition of receipt.transitions) {
    console.log(
      `  ${transition.name} (${transition.kind}) ${transition.accountId}  position ${usd(transition.positionCents)}  ${transition.offBudgetBefore ? "off" : "on"} → ${transition.offBudgetAfter ? "off" : "on"}`,
    );
  }

  const print = (label: string, snap: typeof receipt.before) => {
    console.log(`\n${label}:`);
    console.log(`  openingCents                ${usd(snap.openingCents)}`);
    console.log(`  accountPoolCents            ${usd(snap.accountPoolCents)}`);
    console.log(`  readyToAssignCents          ${usd(snap.readyToAssignCents)}`);
    console.log(`  totalEnvelopeBalanceCents   ${usd(snap.totalEnvelopeBalanceCents)}`);
    console.log(`  heldForNextMonthCents       ${usd(snap.heldForNextMonthCents)}`);
    console.log(
      `  uncategorizedActivityCents  ${usd(snap.uncategorizedActivityCents)}`,
    );
    console.log(
      `  accountReconciliationCents  ${usd(snap.accountReconciliationCents)}`,
    );
  };
  print("Before", receipt.before);
  print("After", receipt.after);

  console.log(
    apply ? "\nApplied." : "\nDry run. Nothing was written. Pass --apply to write.",
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
