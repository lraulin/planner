/**
 * What a payee repair would do, printed before anything writes.
 *
 * The guarded shape the payee-matcher cutover established and `scripts/flow-audit.ts`
 * demonstrates: a pure deterministic planner, read-only, reporting counts rather than
 * transaction ids, with no `--apply` anywhere near it. The reason is in
 * `.../2026-08-25-2144-payee-evidence-and-merge/` references, Finding 7 — a plausible-looking
 * city/state sweep merged `AMAZON PRIME` into `AMAZON` on real data, collapsing a
 * subscription into discretionary spending. Every candidate is confirmed by a person.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeBudgetCategories,
  financePayeeAliases,
  financePayees,
  financeTransactions,
} from "@/db/schema";
import { cityStateMergeProposals, type CityStateProposal } from "./cityState";
import { isDamagedPayeeName } from "./evidence";

/** Where a payee's charges currently sit, biggest envelope first. */
export type EnvelopeShare = { name: string; count: number };

export type AuditProposal = CityStateProposal & {
  sourceEnvelopes: EnvelopeShare[];
  targetEnvelopes: EnvelopeShare[];
};

export type PayeeRepairAudit = {
  aliasCount: number;
  proposals: AuditProposal[];
  /** Payees whose name is too short to be a merchant — normalizer wreckage. */
  damaged: { name: string; alias: string; transactionCount: number }[];
};

export async function payeeRepairAudit(userId: string): Promise<PayeeRepairAudit> {
  const [aliases, activity, filing, envelopes] = await Promise.all([
    db
      .select({
        alias: financePayeeAliases.alias,
        payeeId: financePayeeAliases.payeeId,
        payeeName: financePayees.name,
      })
      .from(financePayeeAliases)
      .innerJoin(
        financePayees,
        and(
          eq(financePayees.id, financePayeeAliases.payeeId),
          eq(financePayees.userId, userId),
        ),
      )
      .where(eq(financePayeeAliases.userId, userId)),
    db
      .select({
        payeeId: financeTransactions.payeeId,
        count: sql<number>`count(*)::int`,
      })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          sql`${financeTransactions.payeeId} is not null`,
        ),
      )
      .groupBy(financeTransactions.payeeId),
    db
      .select({
        payeeId: financeTransactions.payeeId,
        categoryId: financeTransactions.budgetCategoryId,
        count: sql<number>`count(*)::int`,
      })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          sql`${financeTransactions.payeeId} is not null`,
          sql`${financeTransactions.budgetCategoryId} is not null`,
        ),
      )
      .groupBy(financeTransactions.payeeId, financeTransactions.budgetCategoryId),
    db
      .select({ id: financeBudgetCategories.id, name: financeBudgetCategories.name })
      .from(financeBudgetCategories)
      .where(eq(financeBudgetCategories.userId, userId)),
  ]);

  const countByPayee = new Map(
    activity.flatMap((row) => (row.payeeId ? [[row.payeeId, row.count] as const] : [])),
  );
  const envelopeNames = new Map(envelopes.map((row) => [row.id, row.name]));

  const sharesByPayee = new Map<string, EnvelopeShare[]>();
  for (const row of filing) {
    if (!row.payeeId || !row.categoryId) continue;
    const share = {
      name: envelopeNames.get(row.categoryId) ?? "an envelope that is gone",
      count: row.count,
    };
    const list = sharesByPayee.get(row.payeeId);
    if (list) list.push(share);
    else sharesByPayee.set(row.payeeId, [share]);
  }
  for (const list of sharesByPayee.values()) list.sort((a, b) => b.count - a.count);

  const entries = aliases.map((row) => ({
    alias: row.alias,
    payeeId: row.payeeId,
    payeeName: row.payeeName,
    transactionCount: countByPayee.get(row.payeeId) ?? 0,
  }));

  return {
    aliasCount: entries.length,
    proposals: cityStateMergeProposals(entries).map((proposal) => ({
      ...proposal,
      sourceEnvelopes: sharesByPayee.get(proposal.source.payeeId) ?? [],
      targetEnvelopes: sharesByPayee.get(proposal.target.payeeId) ?? [],
    })),
    damaged: entries
      .filter((entry) => isDamagedPayeeName(entry.payeeName))
      .sort((a, b) => b.transactionCount - a.transactionCount)
      .map((entry) => ({
        name: entry.payeeName,
        alias: entry.alias,
        transactionCount: entry.transactionCount,
      })),
  };
}

function shareCopy(shares: readonly EnvelopeShare[]): string {
  if (shares.length === 0) return "nothing filed";
  return shares.map((share) => `${share.name} (${share.count})`).join(", ");
}

/** The report itself. Pure, so what the script prints is what the tests read. */
export function formatPayeeRepairAudit(report: PayeeRepairAudit): string {
  const lines: string[] = [
    `${report.aliasCount} spellings examined.`,
    "",
    `City/state merge proposals: ${report.proposals.length}`,
  ];

  if (report.proposals.length === 0) {
    lines.push(
      "  none — no spelling resolves to a merchant this ledger already knows.",
    );
  }

  for (const proposal of report.proposals) {
    lines.push(
      `  ${proposal.source.alias}  →  ${proposal.target.alias}`,
      `      glued on: ${proposal.glued}`,
      `      moves:    ${proposal.source.transactionCount} charges — ${shareCopy(proposal.sourceEnvelopes)}`,
      `      into:     ${proposal.target.transactionCount} charges — ${shareCopy(proposal.targetEnvelopes)}`,
    );
  }

  lines.push("", `Damaged names: ${report.damaged.length}`);
  if (report.damaged.length === 0) {
    lines.push("  none — no payee is too short to be a merchant.");
  }
  for (const entry of report.damaged) {
    lines.push(
      `  "${entry.name}" (spelling "${entry.alias}") — ${entry.transactionCount} charges`,
    );
  }

  lines.push(
    "",
    "Nothing was written. Confirm each merge against the register before running one;",
    "a merge that guesses is how a subscription ends up inside discretionary spending.",
  );
  return lines.join("\n");
}
