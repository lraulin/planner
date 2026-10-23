/**
 * Replace the single recorded budget opening with per-account openings
 * (`agent-os/specs/2026-09-14-1004-ledger-ready-to-assign/` D2, Task 8).
 *
 *   npx tsx --env-file=.env.local scripts/ledger-rta-cutover.ts --user <uuid|email>            # dry run
 *   npx tsx --env-file=.env.local scripts/ledger-rta-cutover.ts --user <uuid|email> --apply    # writes
 *
 * Prefix `DATABASE_URL="$NEON_URL"` for production (it wins over `.env.local`); the banner names
 * the database either way. The dry run is the apply transaction rolled back, so it needs a role
 * that may write. Before `--apply` on production, take a verified backup (`npm run backup:run`).
 */

import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { describeDatabaseUrl } from "../src/lib/db/target";
import {
  applyLedgerOpeningCutover,
  type OpeningCutoverAccount,
} from "../src/lib/finances/budget/openingCutover";
import { openingSeedLabel } from "../src/lib/finances/budget/openingSeed";
import type { LedgerSnapshot } from "../src/lib/finances/budget/membership";

function argValue(flag: string): string | null {
  const at = process.argv.indexOf(flag);
  return at === -1 ? null : (process.argv[at + 1] ?? null);
}

function usd(cents: number): string {
  return (cents / 100).toFixed(2);
}

async function userIdByEmail(email: string): Promise<string | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  return user?.id ?? null;
}

function sourceOf(account: OpeningCutoverAccount): string {
  if (!account.seed) return "already recorded, kept";
  if (account.seed.source === "bank-headline") {
    return `${openingSeedLabel(account.seed)} (no statement; absorbs any register error since the start)`;
  }
  const period = account.statementPeriod
    ? ` (period ${account.statementPeriod.start} – ${account.statementPeriod.end})`
    : "";
  return `${openingSeedLabel(account.seed)}${period}, ${usd(account.seed.crossingCents)} carried across the close`;
}

function printAccount(account: OpeningCutoverAccount): void {
  console.log(`\n  ${account.name} (${account.kind}) ${account.accountId}`);
  console.log(
    `    opening            ${usd(account.openingCents).padStart(10)}  ${sourceOf(account)}`,
  );
  console.log(
    `    register implies   ${usd(account.registerImpliedCents).padStart(10)}  working balance − rows since start`,
  );
  console.log(
    `    mismatch after     ${usd(account.mismatchCents).padStart(10)}  ${account.mismatchCents === 0 ? "matches" : "shown on the Budget card and Accounts; never moves Ready to Assign"}`,
  );
  for (const row of account.crossingRows) {
    console.log(
      `      ${row.sign > 0 ? "+" : "−"} ${row.transactionDate} posted ${row.postedDate ?? "(not given)"}  ${usd(row.amountCents).padStart(9)}  ${row.description}`,
    );
  }
}

function printSnapshot(label: string, snap: LedgerSnapshot): void {
  console.log(`\n${label}:`);
  console.log(`  opening                     ${usd(snap.openingCents)}`);
  console.log(`  readyToAssign               ${usd(snap.readyToAssignCents)}`);
  console.log(`  envelopeBalances            ${usd(snap.totalEnvelopeBalanceCents)}`);
  console.log(`  heldForNextMonth            ${usd(snap.heldForNextMonthCents)}`);
  console.log(`  assignedInFutureMonths      ${usd(snap.assignedInFutureMonthsCents)}`);
  console.log(`  uncategorizedActivity       ${usd(snap.uncategorizedActivityCents)}`);
}

async function main(): Promise<number> {
  console.log(`Database: ${describeDatabaseUrl(process.env.DATABASE_URL ?? "")}`);
  const userArg = argValue("--user");
  const userId = userArg?.includes("@") ? await userIdByEmail(userArg) : userArg;
  if (userArg && !userId) {
    console.error(`No user ${userArg} in this database.`);
    return 2;
  }
  if (!userId) {
    console.error(
      "Usage: tsx scripts/ledger-rta-cutover.ts --user <uuid|email> [--apply]",
    );
    return 2;
  }

  const apply = process.argv.includes("--apply");
  const receipt = await applyLedgerOpeningCutover(userId, { dryRun: !apply });

  console.log(
    `\nBudget starts ${receipt.startMonth}; openings stand on ${receipt.dayKey}. Legacy recorded total: ${usd(receipt.legacyOpeningCents)}.`,
  );
  console.log(
    `\nOn-budget accounts (${receipt.accounts.length}, ${receipt.seededCount} seeded now):`,
  );
  for (const account of receipt.accounts) printAccount(account);

  const openingTotal = receipt.accounts.reduce((sum, row) => sum + row.openingCents, 0);
  const registerTotal = receipt.accounts.reduce(
    (sum, row) => sum + row.registerImpliedCents,
    0,
  );
  console.log(`\n  Σ openings          ${usd(openingTotal).padStart(10)}`);
  console.log(`  Σ register implies  ${usd(registerTotal).padStart(10)}`);
  console.log(
    `  unmatched transfers ${usd(receipt.unmatchedTransferCents).padStart(10)}`,
  );

  // Where the bank's money sits once the openings are recorded. Every line but the last is a
  // figure the app already shows; the last is what none of them account for.
  const after = receipt.after;
  const foldCents = after.categorizedActivityCents + after.uncategorizedActivityCents;
  const mismatchTotal = receipt.accounts.reduce(
    (sum, row) => sum + row.mismatchCents,
    0,
  );
  const leftover =
    receipt.accountPoolCents -
    openingTotal -
    foldCents -
    receipt.unmatchedTransferCents -
    mismatchTotal;
  console.log("\nBank pool, accounted for:");
  console.log(
    `  bank pool (working balances)          ${usd(receipt.accountPoolCents).padStart(12)}`,
  );
  console.log(
    `  − Σ openings                          ${usd(openingTotal).padStart(12)}`,
  );
  console.log(`  − budget activity through this month  ${usd(foldCents).padStart(12)}`);
  console.log(
    `  − unmatched transfers since start     ${usd(receipt.unmatchedTransferCents).padStart(12)}`,
  );
  console.log(
    `  − Σ mismatches (bank vs register)     ${usd(mismatchTotal).padStart(12)}`,
  );
  console.log(
    `  = left over                           ${usd(leftover).padStart(12)}  ${leftover === 0 ? "" : "rows dated after this month, or a gap to find"}`,
  );

  printSnapshot("Before", receipt.before);
  printSnapshot("After", receipt.after);
  console.log(
    `\nReady to Assign: ${usd(receipt.before.readyToAssignCents)} → ${usd(receipt.after.readyToAssignCents)} (${usd(receipt.after.readyToAssignCents - receipt.before.readyToAssignCents)}).`,
  );

  if (receipt.seededCount === 0) {
    console.log("\nEvery on-budget account already has an opening. Nothing to do.");
  } else {
    console.log(
      apply ? "\nApplied." : "\nDry run. Nothing was written. Pass --apply to write.",
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
