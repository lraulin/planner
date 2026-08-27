/**
 * Which set of rows an aggregate means, now that a transaction can have children.
 *
 * Every reader of `finance_transactions` has to answer one of two questions, and they take
 * opposite filters (`agent-os/specs/2026-08-26-2022-split-transactions/` D2). Both live here
 * so that a call site says which one it meant rather than leaving it to be inferred — the
 * bugs this schema can cause are all of the form "plausible number, wrong row set".
 */
import { eq, isNull } from "drizzle-orm";

import { financeTransactions } from "@/db/schema";

/**
 * **How much money?** — leaf rows only.
 *
 * The children sum to the parent, so summing leaves gives the true total with no special
 * case for the unsplit rows, which are leaves themselves. This is what Actual's query
 * executor appends to every aggregate by default
 * (`packages/loot-core/src/server/aql/schema/executors.ts:116,242`).
 *
 * Counting a parent *as well as* its children would double every split.
 */
export const moneyRows = eq(financeTransactions.isParent, false);

/**
 * **How many transactions?** — non-child rows only.
 *
 * The bank moved money once. A split is a statement about where that one charge went, not
 * about how many charges there were, so counting leaves would report the Apple charge as two
 * transactions and make an account's row count disagree with its statement.
 *
 * This is also the row set for anything that is a *register* rather than a total: reconcile's
 * arithmetic check, the register index, and import dedup all mean bank rows.
 */
export const bankRows = isNull(financeTransactions.parentId);
