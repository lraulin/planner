/**
 * One pass over a whole history, deciding what every row is.
 *
 * The three detectors each answer a different question and none of them can answer it
 * alone: `transfers.ts` knows which rows are two halves of one movement, `income.ts` knows
 * which credits arrive on a payroll cadence, and `categorize.ts` knows what a single row's
 * merchant is. This module is where their answers are ordered, and the order is the whole
 * of the design:
 *
 * 1. **A transfer is a transfer.** `Withdrawal from CAPITAL ONE MOBILE PMT` also matches a
 *    Capital One merchant rule; if the rule won, six figures of card payments would count
 *    as spending, which is the single largest error this layer exists to prevent.
 * 2. **A named flow beats a guessed one.** `INTEREST CHARGE` and `VACP TREAS` say what they
 *    are in the description. Rows a rule has claimed are also withheld from cadence
 *    detection, so a monthly benefit cannot drift into the biweekly paycheck median.
 * 3. **Cadence is income.** Whatever is left and arrives every fortnight is a paycheck.
 * 4. **Sign decides the rest.** Money out is spend; an unexplained credit is a refund.
 *
 * Everything here is pure and reproducible: same rows in, same plan out, including the
 * transfer group ids, which are **reused** whenever a pairing has not changed. That is what
 * makes a second reclassify write nothing at all rather than churning ids under the rows it
 * just wrote.
 */

import type { FinanceFlowKind } from "@/db/schema";
import { categorize } from "./categorize";
import { detectIncome, type IncomeRow, type Payday } from "./income";
import { matchRule } from "./rules";
import { matchTransfers, type TransferAccount, type TransferRow } from "./transfers";
import { normalizeMerchant } from "./merchant";

export type ReclassifyRow = {
  id: string;
  accountId: string;
  /** `YYYY-MM-DD`. */
  transactionDate: string;
  description: string;
  /** Signed; positive is money into the account. */
  amountCents: number;
  sourceCategory: string;
  /** What the previous run wrote. Reused when this run pairs the same two rows. */
  transferGroupId: string | null;
};

export type ReclassifyAccount = TransferAccount;

/** What one row should end up with. Every field is recomputable and safe to overwrite. */
export type RowPlan = {
  id: string;
  derivedCategory: string | null;
  derivedFlow: FinanceFlowKind;
  transferGroupId: string | null;
};

export type ReclassifyPlan = {
  rows: RowPlan[];
  /** Detected paydays, earliest first — the pay-period axis is built from these. */
  paydays: Payday[];
  medianPaycheckCents: number;
  normalizedMonthlyIncomeCents: number;
};

/**
 * Flows that describe money moving rather than money spent. A category on one of these
 * would be a category on a number no spending report is allowed to count, which is exactly
 * how a "Transfers" slice ends up as the biggest thing on a spending chart.
 */
function carriesCategory(flow: FinanceFlowKind): boolean {
  return flow === "spend" || flow === "refund" || flow === "interest_fee";
}

/**
 * Reuse the group id two rows already share, or mint one.
 *
 * `claimed` stops a split group from handing the same id to both halves: if last run paired
 * A–B and this run pairs A–C and B–D, only one of them may keep the old id.
 */
function groupIdFor(
  ids: readonly string[],
  current: ReadonlyMap<string, string | null>,
  claimed: Set<string>,
  mintGroupId: () => string,
): string {
  const first = current.get(ids[0]) ?? null;
  const unchanged =
    first !== null &&
    !claimed.has(first) &&
    ids.every((id) => current.get(id) === first);

  const groupId = unchanged ? first : mintGroupId();
  claimed.add(groupId);
  return groupId;
}

/**
 * Classify every row of one user's history.
 *
 * `mintGroupId` is injected rather than called directly so a test can assert idempotence
 * against fixed ids — and so this module stays pure, which is what lets the interesting
 * cases (the unpaired card payment, the employer change) be tested without a database.
 */
export function planReclassify(
  rows: readonly ReclassifyRow[],
  accounts: readonly ReclassifyAccount[],
  mintGroupId: () => string,
): ReclassifyPlan {
  const transferRows: TransferRow[] = rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    transactionDate: row.transactionDate,
    description: row.description,
    amountCents: row.amountCents,
  }));
  const transfers = matchTransfers(transferRows, accounts);

  // A rule that names a flow has settled the row. Withholding those from cadence detection
  // keeps a monthly VA benefit out of the biweekly median, which would otherwise deflate
  // `median × 26 ÷ 12` — the one figure the whole dashboard leans on.
  const ruleFlows = new Map<string, FinanceFlowKind>();
  for (const row of rows) {
    const flow = matchRule(normalizeMerchant(row.description))?.flow;
    if (flow) ruleFlows.set(row.id, flow);
  }

  const claimedByDetector = new Set([...transfers.flows.keys(), ...ruleFlows.keys()]);
  const incomeRows: IncomeRow[] = rows.map((row) => ({
    id: row.id,
    transactionDate: row.transactionDate,
    description: row.description,
    amountCents: row.amountCents,
  }));
  const income = detectIncome(incomeRows, claimedByDetector);

  const currentGroupIds = new Map(rows.map((row) => [row.id, row.transferGroupId]));
  const claimedGroupIds = new Set<string>();
  const groupIdByRow = new Map<string, string>();
  for (const group of transfers.groups) {
    const groupId = groupIdFor(group, currentGroupIds, claimedGroupIds, mintGroupId);
    for (const id of group) groupIdByRow.set(id, groupId);
  }

  const planned = rows.map((row) => {
    const flow: FinanceFlowKind =
      transfers.flows.get(row.id) ??
      ruleFlows.get(row.id) ??
      income.flows.get(row.id) ??
      // An unexplained credit is a refund rather than income: it is money back, and calling
      // it earnings would invent a wage the accounts cannot see.
      (row.amountCents > 0 ? "refund" : "spend");

    return {
      id: row.id,
      derivedCategory: carriesCategory(flow)
        ? categorize(row.description, row.sourceCategory).category
        : null,
      derivedFlow: flow,
      transferGroupId: groupIdByRow.get(row.id) ?? null,
    };
  });

  return {
    rows: planned,
    paydays: income.paydays,
    medianPaycheckCents: income.medianPaycheckCents,
    normalizedMonthlyIncomeCents: income.normalizedMonthlyIncomeCents,
  };
}

/** Rows whose stored values differ from the plan — the only ones a reclassify writes. */
export function changedRows(
  rows: readonly (ReclassifyRow & {
    derivedCategory: string | null;
    derivedFlow: FinanceFlowKind | null;
  })[],
  plan: ReclassifyPlan,
): RowPlan[] {
  const stored = new Map(rows.map((row) => [row.id, row]));
  return plan.rows.filter((planned) => {
    const row = stored.get(planned.id);
    if (!row) return true;
    return (
      row.derivedCategory !== planned.derivedCategory ||
      row.derivedFlow !== planned.derivedFlow ||
      row.transferGroupId !== planned.transferGroupId
    );
  });
}
