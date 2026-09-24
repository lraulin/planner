/**
 * Hand an account's history to one source
 * (`agent-os/specs/2026-09-23-1316-one-history-source-per-account/` D5).
 *
 *   npx tsx --env-file=.env.local scripts/history-source-cutover.ts --user <uuid>                                 # list accounts
 *   npx tsx --env-file=.env.local scripts/history-source-cutover.ts --user <uuid> --account <uuid> --to bank_page  # dry run
 *   npx tsx --env-file=.env.local scripts/history-source-cutover.ts --user <uuid> --account <uuid> --to bank_page --apply
 *
 * `--to bank_page` is Capital One: the page authors history after SimpleFIN's last posted day,
 * SimpleFIN's holds retire onto the page's, and the link is removed. `--to simplefin` is
 * Chase: it stays on the feed and sheds the page's leftover holds.
 *
 * Prefix `DATABASE_URL="$NEON_URL"` for production (it wins over `.env.local`); the banner names
 * the database either way.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { bankAccountLinks, financeAccounts } from "../src/db/schema";
import { describeDatabaseUrl } from "../src/lib/db/target";
import { applyHistorySourceCutover } from "../src/lib/finances/historySourceCutover";

function argValue(flag: string): string | null {
  const at = process.argv.indexOf(flag);
  return at === -1 ? null : (process.argv[at + 1] ?? null);
}

function usd(cents: number): string {
  return (cents / 100).toFixed(2);
}

async function listAccounts(userId: string): Promise<void> {
  const accounts = await db
    .select({
      id: financeAccounts.id,
      name: financeAccounts.name,
      historySource: financeAccounts.historySource,
      since: financeAccounts.historySourceSince,
      linkId: bankAccountLinks.id,
    })
    .from(financeAccounts)
    .leftJoin(
      bankAccountLinks,
      and(
        eq(bankAccountLinks.accountId, financeAccounts.id),
        eq(bankAccountLinks.userId, userId),
      ),
    )
    .where(eq(financeAccounts.userId, userId));
  for (const account of accounts) {
    console.log(
      `  ${account.id}  ${account.name.padEnd(28)} ${account.historySource}${account.since ? ` since ${account.since}` : ""}${account.linkId ? "  (linked)" : ""}`,
    );
  }
}

async function main(): Promise<number> {
  console.log(`Database: ${describeDatabaseUrl(process.env.DATABASE_URL ?? "")}`);
  const userId = argValue("--user");
  if (!userId) {
    console.error(
      "Usage: tsx scripts/history-source-cutover.ts --user <uuid> [--account <uuid> --to bank_page|simplefin] [--apply]",
    );
    return 2;
  }
  const accountId = argValue("--account");
  const to = argValue("--to");
  if (!accountId || (to !== "bank_page" && to !== "simplefin")) {
    await listAccounts(userId);
    return accountId ? 2 : 0;
  }

  const apply = process.argv.includes("--apply");
  const receipt = await applyHistorySourceCutover(userId, accountId, to, {
    dryRun: !apply,
  });

  console.log(`\n${receipt.accountName}: ${receipt.from} → ${receipt.to}`);
  if (receipt.to === "bank_page") {
    console.log(
      `  Page authors history posted after: ${receipt.since ?? "(everything)"}`,
    );
    console.log(`  SimpleFIN links removed: ${receipt.unlinked}`);
  }
  console.log(
    `  Holds retired onto the kept source: ${receipt.retired} (${receipt.carried} carried an envelope, note or split)`,
  );

  console.log(`\nUnpaired holds, kept (${receipt.unpaired.length}):`);
  for (const row of receipt.unpaired) {
    console.log(
      `  ${row.transactionDate}  ${usd(row.amountCents).padStart(9)}  ${row.description}${row.hasUserState ? "  [has envelope/notes]" : ""}  ${row.id}`,
    );
  }

  if (receipt.to === "bank_page") {
    console.log(
      `\nOn the latest capture${receipt.latestCaptureAt ? ` (${receipt.latestCaptureAt.toISOString()})` : " (none found)"}, posted on or before the cutover and stored nowhere (${receipt.missedByPreviousSource.length}). Nothing is inserted for these:`,
    );
    for (const row of receipt.missedByPreviousSource) {
      console.log(
        `  ${row.transactionDate} posted ${row.postedDate ?? "?"}  ${usd(row.amountCents).padStart(9)}  ${row.description}`,
      );
    }
  }

  for (const warning of receipt.warnings) console.log(`\nWarning: ${warning}`);
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
