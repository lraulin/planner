/**
 * User-facing alias edits, including the derived transaction identity they promise to change.
 *
 * `finance_transactions.payee_id` is intentionally recomputable from aliases. Changing the
 * source without recomputing that pointer leaves the Payees page and every payee-based reader
 * disagreeing until the next import happens to run a classification pass.
 */

import { reclassifyTransactions } from "../mutations";
import { applyPayeeAutoCategories } from "./claims";
import { addAlias } from "./mutations";

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
