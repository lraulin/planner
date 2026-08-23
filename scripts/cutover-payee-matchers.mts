import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { describeDatabaseUrl } from "@/lib/db/target";
import {
  applyPayeeCutover,
  auditPayeeCutover,
  PayeeCutoverBlockedError,
} from "@/lib/finances/payees/cutoverDb";
import type { PayeeCutoverPlan } from "@/lib/finances/payees/cutover";

function requestedUserId(args: readonly string[]): string | null {
  const equals = args.find((arg) => arg.startsWith("--user="));
  if (equals) return equals.slice("--user=".length);
  const index = args.indexOf("--user");
  return index >= 0 ? (args[index + 1] ?? null) : null;
}

function summary(plan: PayeeCutoverPlan) {
  const parityDifferences = plan.parityDifferences.map((difference) => {
    const grouped = (rows: typeof difference.legacyOnly) => {
      const byMerchant = new Map<string, { count: number; cents: number }>();
      for (const row of rows) {
        const current = byMerchant.get(row.legacyMerchant) ?? { count: 0, cents: 0 };
        current.count += 1;
        current.cents += row.amountCents;
        byMerchant.set(row.legacyMerchant, current);
      }
      return [...byMerchant.entries()]
        .map(([merchant, values]) => ({ merchant, ...values }))
        .sort((a, b) => a.merchant.localeCompare(b.merchant));
    };
    return {
      commitment: difference.commitment,
      legacyCount: difference.legacyTransactionIds.length,
      payeeCount: difference.payeeTransactionIds.length,
      legacyOnly: grouped(difference.legacyOnly),
      payeeOnly: grouped(difference.payeeOnly),
    };
  });
  return {
    canApply: plan.canApply,
    isIdempotent: plan.isIdempotent,
    createPayees: plan.creates,
    assignClaims: plan.claims.length,
    releaseClaims: plan.releases.length,
    rewriteSchedules: plan.scheduleUpdates.map((row) => row.name),
    conflicts: plan.conflicts,
    malformedSchedules: plan.malformedSchedules,
    unresolvedValues: plan.unresolvedValues,
    parityDifferences,
  };
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const userId = requestedUserId(args);
const selected = userId
  ? await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
  : await db.select({ id: users.id, email: users.email }).from(users);

if (selected.length === 0) throw new Error("No matching user exists.");

console.log(`Database: ${describeDatabaseUrl(process.env.DATABASE_URL)}`);
console.log(`Mode: ${apply ? "APPLY" : "dry run"}`);

const audits = [];
for (const user of selected) {
  const plan = await auditPayeeCutover(user.id);
  audits.push({ user, plan });
  console.log(JSON.stringify({ user, audit: summary(plan) }, null, 2));
}

const blocked = audits.filter(({ plan }) => !plan.canApply);
if (blocked.length > 0) {
  throw new Error(
    `${blocked.length} user audit${blocked.length === 1 ? " is" : "s are"} blocked; nothing was applied.`,
  );
}

if (!apply) {
  console.log("Dry run only. Re-run with --apply to write the audited plan.");
  process.exit(0);
}

for (const { user } of audits) {
  try {
    const result = await applyPayeeCutover(user.id);
    console.log(JSON.stringify({ user, applied: result }, null, 2));
  } catch (error) {
    if (error instanceof PayeeCutoverBlockedError) {
      console.error(JSON.stringify({ user, blocked: summary(error.plan) }, null, 2));
    }
    throw error;
  }
}

process.exit(0);
