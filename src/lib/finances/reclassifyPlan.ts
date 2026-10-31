import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  financeAccounts,
  financePayeeAliases,
  financePaymentResolutions,
  financeTransactions,
} from "@/db/schema";
import { changedRows, planReclassify, type RowPlan } from "./classify/reclassify";
import type { FinanceExecutor } from "./dbExecutor";
import { numericStringToCents } from "./money";
import type { PaypalResolution } from "./paypalMatch";
import { payeeIndex } from "./payees/resolve";

/**
 * Load everything one user's classification depends on, and plan it. **Writes nothing.**
 *
 * Split out because a preview and a run must not be two implementations of the same answer.
 * The moment they diverge, the count a person confirmed stops being the count that lands —
 * and the difference would show up as a wrong number rather than as an error. `previewFlow`
 * and `reclassifyTransactions` therefore share this, and differ only in what they do with the
 * plan afterwards.
 *
 * Deliberately does **not** call `ensurePayees`: minting a payee is a write, and a caller that
 * only wants to look must be able to. A run calls it first; a preview accepts that a merchant
 * never seen before is still unclaimed and reports it that way.
 */
export async function loadAndPlanReclassify(executor: FinanceExecutor, userId: string) {
  const [rows, accounts, storedResolutions, aliases] = await Promise.all([
    executor
      .select({
        id: financeTransactions.id,
        accountId: financeTransactions.accountId,
        transactionDate: financeTransactions.transactionDate,
        description: financeTransactions.description,
        amount: financeTransactions.amount,
        sourceCategory: financeTransactions.sourceCategory,
        transferGroupId: financeTransactions.transferGroupId,
        payeeId: financeTransactions.payeeId,
        derivedFlow: financeTransactions.derivedFlow,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, userId)),
    executor
      .select({
        id: financeAccounts.id,
        externalKey: financeAccounts.externalKey,
      })
      .from(financeAccounts)
      .where(eq(financeAccounts.userId, userId)),
    executor
      .select({
        externalId: financePaymentResolutions.externalId,
        transactionDate: financePaymentResolutions.transactionDate,
        amount: financePaymentResolutions.amount,
        counterparty: financePaymentResolutions.counterparty,
        direction: financePaymentResolutions.direction,
      })
      .from(financePaymentResolutions)
      .where(eq(financePaymentResolutions.userId, userId)),
    executor
      .select({
        alias: financePayeeAliases.alias,
        payeeId: financePayeeAliases.payeeId,
      })
      .from(financePayeeAliases)
      .where(eq(financePayeeAliases.userId, userId)),
  ]);

  const parsed = rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    transactionDate: row.transactionDate,
    description: row.description,
    amountCents: numericStringToCents(row.amount) ?? 0,
    sourceCategory: row.sourceCategory,
    transferGroupId: row.transferGroupId,
    payeeId: row.payeeId,
    derivedFlow: row.derivedFlow,
  }));

  const resolutions: PaypalResolution[] = storedResolutions.flatMap((row) => {
    const amountCents = numericStringToCents(row.amount);
    if (amountCents === null) return [];
    if (row.direction !== "in" && row.direction !== "out") return [];
    return [
      {
        externalId: row.externalId,
        date: row.transactionDate,
        amountCents,
        counterparty: row.counterparty,
        direction: row.direction,
      },
    ];
  });

  const plan = planReclassify(
    parsed,
    accounts,
    randomUUID,
    resolutions,
    payeeIndex(aliases),
  );

  return { parsed, plan, changed: changedRows(parsed, plan) };
}

/**
 * How many rows one `update ... from (values ...)` carries.
 *
 * The first reclassify of a three-year history rewrites a few thousand rows; sending them
 * one statement each is thousands of round trips for a button press. Every run after that
 * writes only what changed, which is usually nothing.
 */
const RECLASSIFY_CHUNK = 250;

/**
 * Write a reclassify plan's changed rows: `derived_flow`, `transfer_group_id` and the
 * recomputable `payee_id`, and nothing a person owns. One statement per chunk rather than
 * per row, so a whole-history run inside a bank sync stays a handful of round trips.
 */
export async function writeReclassified(
  executor: FinanceExecutor,
  userId: string,
  changed: readonly RowPlan[],
): Promise<void> {
  for (let start = 0; start < changed.length; start += RECLASSIFY_CHUNK) {
    const chunk = changed.slice(start, start + RECLASSIFY_CHUNK);
    const values = sql.join(
      chunk.map(
        (row) =>
          sql`(${row.id}::uuid, ${row.derivedFlow}::finance_flow_kind, ${row.transferGroupId}::uuid, ${row.payeeId}::uuid)`,
      ),
      sql`, `,
    );
    await executor.execute(sql`
      update ${financeTransactions} as t
      set derived_flow = v.derived_flow,
          transfer_group_id = v.transfer_group_id,
          payee_id = v.payee_id,
          updated_at = now()
      from (values ${values}) as v(id, derived_flow, transfer_group_id, payee_id)
      where t.id = v.id and t.user_id = ${userId}::uuid
    `);
  }
}
