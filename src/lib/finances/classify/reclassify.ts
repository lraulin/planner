/**
 * One pass over a whole history, deciding what every row is.
 *
 * The three detectors each answer a different question and none of them can answer it
 * alone: `transfers.ts` knows which rows are two halves of one movement, `income.ts` knows
 * which credits arrive on a payroll cadence, and `categorize.ts` knows what a single row's
 * merchant is. This module is where their answers are ordered, and the order is the whole
 * of the design:
 *
 * 1. **A transfer is a transfer.** `Withdrawal from CAPITAL ONE MOBILE PMT` also looks like
 *    a Capital One merchant; if that won, six figures of card payments would count as
 *    spending, which is the single largest error this layer exists to prevent.
 * 2. **A named flow beats a guessed one.** `INTEREST CHARGE` and `VACP TREAS` say what they
 *    are in the description. Those rows are withheld from cadence detection so a monthly
 *    benefit cannot drift into the biweekly paycheck median.
 * 3. **Cadence is income.** Whatever is left and arrives every fortnight is a paycheck.
 * 4. **Sign decides the rest.** Money out is spend. Money *in* that nobody claimed is a
 *    refund only when it comes back from a merchant money went out to; otherwise it is a
 *    deposit from outside, and calling it a refund would make it subtract from spending.
 *
 * Category is not recomputed here. Envelope claims and payee auto-category write
 * `budget_category_id` on new or uncategorised rows; previously categorised rows stay.
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

  const perRow = new Map(
    rows.map((row) => {
      const fromBank = categorize(row.description);
      const resolution = named.get(row.id);
      if (!resolution?.counterparty) return [row.id, fromBank] as const;
      const fromPaypal = categorize(resolution.counterparty);
      /*
       * **Flow comes from the bank line**, because flow is about how the money moved —
       * `PAYPAL TO LEE RAULIN` files a checking withdrawal as spend, and the counterparty
       * knows nothing about that. **Merchant uses `||` rather than `??`**, so an empty
       * string from a counterparty that normalized to nothing falls back instead of
       * erasing a name the bank did give.
       */
      return [
        row.id,
        {
          merchant: fromPaypal.merchant || fromBank.merchant,
          flow: fromBank.flow ?? fromPaypal.flow,
        },
      ] as const;
    }),
  );

  const payeeIdByRow = new Map(
    rows.map((row) => [
      row.id,
      payeeForDescription(row.description, payees, named.get(row.id)?.counterparty),
    ]),
  );

  const namedFlows = new Map<string, FinanceFlowKind>();
  for (const row of rows) {
    const flow = perRow.get(row.id)?.flow;
    if (flow) namedFlows.set(row.id, flow);
  }

  const claimedByDetector = new Set([...transfers.flows.keys(), ...namedFlows.keys()]);
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
      transfers.flows.get(row.id) ?? namedFlows.get(row.id) ?? income.flows.get(row.id);
    if (flow) claimed.set(row.id, flow);
    else if (row.amountCents <= 0) claimed.set(row.id, "spend");
  }

  /*
   * Payees money actually goes out to. A credit only counts as a refund if it comes back
   * from one of these. Keyed on the payee, not the merchant string — two spellings of one
   * shop are one identity.
   *
   * A row with no payee is **never** a member. Null is not an identity, and grouping every
   * unresolved row under one absent key would make any credit a refund of any other.
   */
  const spendingPayees = new Set<string>();
  for (const row of rows) {
    if (claimed.get(row.id) !== "spend") continue;
    const payeeId = payeeIdByRow.get(row.id);
    if (payeeId) spendingPayees.add(payeeId);
  }

  const planned = rows.map((row) => {
    const payeeId = payeeIdByRow.get(row.id) ?? null;
    const flow: FinanceFlowKind =
      claimed.get(row.id) ??
      (named.has(row.id)
        ? "external_transfer"
        : payeeId !== null && spendingPayees.has(payeeId)
          ? "refund"
          : "external_transfer");

    return {
      id: row.id,
      derivedFlow: flow,
      transferGroupId: groupIdByRow.get(row.id) ?? null,
      payeeId,
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
    derivedFlow: FinanceFlowKind | null;
  })[],
  plan: ReclassifyPlan,
): RowPlan[] {
  const stored = new Map(rows.map((row) => [row.id, row]));
  return plan.rows.filter((planned) => {
    const row = stored.get(planned.id);
    if (!row) return true;
    return (
      row.derivedFlow !== planned.derivedFlow ||
      row.transferGroupId !== planned.transferGroupId ||
      row.payeeId !== planned.payeeId
    );
  });
}
