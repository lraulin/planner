/**
 * Move a user's declared bills, recurring spend and payee claims onto bill envelopes,
 * before `finance_recurring_bills` / `finance_recurring_spend` / `finance_schedules` are
 * dropped (`agent-os/specs/2026-08-23-2313-one-budget/`).
 *
 *   npx tsx scripts/one-budget-cutover.ts --user <uuid>            # dry run, writes nothing
 *   npx tsx scripts/one-budget-cutover.ts --user <uuid> --apply    # writes
 *
 * Dry run unless `--apply` is passed, in the shape the rules and payee-matcher cutovers used.
 */

import { applyCommitmentsCutover } from "../src/lib/finances/budget/cutover";

function argValue(flag: string): string | null {
  const at = process.argv.indexOf(flag);
  return at === -1 ? null : (process.argv[at + 1] ?? null);
}

async function main(): Promise<number> {
  const userId = argValue("--user");
  if (!userId) {
    console.error("Usage: tsx scripts/one-budget-cutover.ts --user <uuid> [--apply]");
    return 2;
  }
  const apply = process.argv.includes("--apply");

  const receipt = await applyCommitmentsCutover(userId, { dryRun: !apply });

  console.log(`\nBills → envelopes (${receipt.billsMigrated.length}):`);
  for (const bill of receipt.billsMigrated) {
    console.log(
      `  ${bill.name} — cadence ${bill.cadenceMonths}mo — envelope ${bill.envelopeId}`,
    );
  }
  console.log(`\nRecurring spend → envelopes (${receipt.spendMigrated.length}):`);
  for (const entry of receipt.spendMigrated) {
    console.log(
      `  ${entry.name} — $${(entry.monthlyCents / 100).toFixed(2)}/mo — envelope ${entry.envelopeId}`,
    );
  }
  console.log(`\nPayee claims rewritten: ${receipt.claimsRewritten}`);
  console.log(
    receipt.renamedCatchAll
      ? `Renamed catch-all envelope: "${receipt.renamedCatchAll.from}" → "${receipt.renamedCatchAll.to}"`
      : "No catch-all envelope needed renaming.",
  );

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
