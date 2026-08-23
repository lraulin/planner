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
 * 4. **Sign decides the rest.** Money out is spend. Money *in* that nobody claimed is a
 *    refund only when it comes back from a merchant money went out to; otherwise it is a
 *    deposit from outside, and calling it a refund would make it subtract from spending.
 *
 * Everything here is pure and reproducible: same rows in, same plan out, including the
 * transfer group ids, which are **reused** whenever a pairing has not changed. That is what
 * makes a second reclassify write nothing at all rather than churning ids under the rows it
 * just wrote.
 */

import type { FinanceFlowKind } from "@/db/schema";
import { matchPaypalResolutions, type PaypalResolution } from "../paypalMatch";
import { payeeForDescription, type PayeeIndex } from "../payees/resolve";
import { categorize } from "./categorize";
import { detectIncome, type IncomeRow, type Payday } from "./income";
import { matchTransfers, type TransferAccount, type TransferRow } from "./transfers";

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
  /** What the previous run wrote. Recomputed from the alias index on every pass. */
  payeeId: string | null;
};

export type ReclassifyAccount = TransferAccount;

/** What one row should end up with. Every field is recomputable and safe to overwrite. */
export type RowPlan = {
  id: string;
  derivedCategory: string | null;
  derivedFlow: FinanceFlowKind;
  transferGroupId: string | null;
  payeeId: string | null;
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
  resolutions: readonly PaypalResolution[] = [],
  /** Merchant → the category its commitment declares. Outranks a `rules.ts` match. */
  commitmentCategories: ReadonlyMap<string, string> = new Map(),
  /** Normalized alias → stable payee id, ensured by the caller before planning. */
  payees: PayeeIndex = new Map(),
): ReclassifyPlan {
  const transferRows: TransferRow[] = rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    transactionDate: row.transactionDate,
    description: row.description,
    amountCents: row.amountCents,
  }));
  const transfers = matchTransfers(transferRows, accounts);
  const named = matchPaypalResolutions(rows, resolutions).byRowId;

  // One pass for merchant, category and any flow the merchant itself settles.
  // A resolution names who PayPal actually paid, so that name is what categorise
  // should see — the bank description is only the rail.
  const perRow = new Map(
    rows.map((row) => {
      const fromBank = categorize(
        row.description,
        row.sourceCategory,
        commitmentCategories,
      );
      const resolution = named.get(row.id);
      if (!resolution?.counterparty) return [row.id, fromBank] as const;
      const fromPaypal = categorize(
        resolution.counterparty,
        row.sourceCategory,
        commitmentCategories,
      );
      return [
        row.id,
        {
          merchant: fromPaypal.merchant || fromBank.merchant,
          category: fromPaypal.category ?? fromBank.category,
          flow: fromBank.flow ?? fromPaypal.flow,
          ruleId: fromPaypal.ruleId ?? fromBank.ruleId,
        },
      ] as const;
    }),
  );

  // A rule that names a flow has settled the row. Withholding those from cadence detection
  // keeps a monthly VA benefit out of the biweekly median, which would otherwise deflate
  // `median × 26 ÷ 12` — the one figure the whole dashboard leans on.
  const ruleFlows = new Map<string, FinanceFlowKind>();
  for (const row of rows) {
    const flow = perRow.get(row.id)?.flow;
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

  /** What every detector agrees on, plus the debits. Credits are settled below. */
  const claimed = new Map<string, FinanceFlowKind>();
  for (const row of rows) {
    const flow =
      transfers.flows.get(row.id) ?? ruleFlows.get(row.id) ?? income.flows.get(row.id);
    if (flow) claimed.set(row.id, flow);
    else if (row.amountCents <= 0) claimed.set(row.id, "spend");
  }

  // Merchants money actually goes out to. A credit only counts as a refund if it comes back
  // from one of these.
  const spendingMerchants = new Set<string>();
  for (const row of rows) {
    if (claimed.get(row.id) !== "spend") continue;
    const merchant = perRow.get(row.id)?.merchant;
    if (merchant) spendingMerchants.add(merchant);
  }

  const planned = rows.map((row) => {
    const merchant = perRow.get(row.id)?.merchant ?? "";
    const flow: FinanceFlowKind =
      claimed.get(row.id) ??
      /*
       * An unclaimed credit, and the two possibilities are not close.
       *
       * A **refund** is negative spending — returning the couch reduces what the couch cost
       * — so it may only be a refund if the money came back from a merchant money went out
       * to. Anything else is a deposit: a cheque, a tax refund, a Coinbase withdrawal, Zelle
       * from a friend. Filing those as refunds made them *subtract* from spending, which is
       * how a pay period that received a $2,516 tax refund reported negative money out.
       *
       * A PayPal resolution that names the sender takes priority over that refund check:
       * $2,000 from Dennis Raulin is not a store credit even if we also shop somewhere
       * whose merchant string happens to collide. Then the default is `external_transfer`:
       * money arriving from outside what this module can see. That is deliberately the
       * conservative bucket — it is neither a cost nor earnings, on the same reasoning
       * already recorded for the Pentagon Federal sweeps in `transfers.ts`. Calling it
       * income would invent a wage; calling it a refund invents a discount.
       */
      (named.has(row.id)
        ? "external_transfer"
        : spendingMerchants.has(merchant)
          ? "refund"
          : "external_transfer");

    return {
      id: row.id,
      derivedCategory: carriesCategory(flow)
        ? (perRow.get(row.id)?.category ?? null)
        : null,
      derivedFlow: flow,
      transferGroupId: groupIdByRow.get(row.id) ?? null,
      payeeId: payeeForDescription(
        row.description,
        payees,
        named.get(row.id)?.counterparty,
      ),
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
      row.transferGroupId !== planned.transferGroupId ||
      row.payeeId !== planned.payeeId
    );
  });
}
