/**
 * Seed the 65 categorisation rules, and prove the app classifies identically afterwards.
 *
 *   npm run rules:audit -- --user <uuid>     # report only, writes nothing
 *   npm run rules:seed  -- --user <uuid> --apply
 *
 * Dry run unless `--apply` is passed, in the shape the payee matcher cutover used twice. The
 * order that matters: audit, seed, audit again. The **second** audit is the one that has to
 * report zero — before seeding, the diff shows what the app would lose by classifying with no
 * rules at all, which is exactly the hazard this guards.
 */

import { auditRuleSeed, seedRules } from "../src/lib/finances/rules/cutover";
import { formatFlowDiff } from "../src/lib/finances/classify/flowDiff";

function argValue(flag: string): string | null {
  const at = process.argv.indexOf(flag);
  return at === -1 ? null : (process.argv[at + 1] ?? null);
}

async function main(): Promise<number> {
  const userId = argValue("--user");
  if (!userId) {
    console.error("Usage: tsx scripts/rules-seed.ts --user <uuid> [--apply]");
    return 2;
  }
  const apply = process.argv.includes("--apply");

  const audit = await auditRuleSeed(userId);
  console.log(`${audit.toCreate} rules to create, ${audit.existing} already present.`);
  console.log(formatFlowDiff(audit.flow, "flow"));
  console.log(formatFlowDiff(audit.category, "category"));
  for (const problem of audit.problems) {
    console.log(`  rule "${problem.name}" did not compile: ${problem.reason}`);
  }

  if (!apply) {
    console.log("\nDry run. Nothing was written. Pass --apply to seed.");
    return 0;
  }

  const { created } = await seedRules(userId);
  console.log(`\nCreated ${created} rules.`);

  const after = await auditRuleSeed(userId);
  console.log(formatFlowDiff(after.flow, "flow"));
  console.log(formatFlowDiff(after.category, "category"));
  console.log(
    after.canApply
      ? "Parity holds: classification is unchanged."
      : "PARITY BROKEN — investigate before trusting any finance figure.",
  );
  return after.canApply ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
