/**
 * User-facing alias edits, including the derived transaction identity they promise to change.
 *
 * `finance_transactions.payee_id` is intentionally recomputable from aliases. Changing the
 * source without recomputing that pointer leaves the Payees page and every payee-based reader
 * disagreeing until the next import happens to run a classification pass.
 */

import { reclassifyTransactions } from "../mutations";
import { applyPayeeAutoCategories } from "./claims";
import { addAlias, removeAlias } from "./mutations";

export async function addPayeeAlias(
  userId: string,
  payeeId: string,
  alias: string,
): Promise<void> {
  await addAlias(userId, payeeId, alias);
  await reclassifyTransactions(userId);
  // Newly recognized rows may now be eligible for this payee's claim or default. Existing
  // Categories still win because this path fills only uncategorized rows.
  await applyPayeeAutoCategories(userId, { payeeIds: [payeeId] });
}

/**
 * Remove an alias and recompute who its rows belong to.
 *
 * The rows it covered lose this payee. The reclassify mints a payee of their own for the
 * merchant, as it would for a merchant seen for the first time.
 */
export async function removePayeeAlias(
  userId: string,
  payeeId: string,
  alias: string,
): Promise<void> {
  await removeAlias(userId, payeeId, alias);
  await reclassifyTransactions(userId);
}
