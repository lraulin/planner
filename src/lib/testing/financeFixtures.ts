import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetCategories,
  financeCategoryGroups,
} from "@/db/schema";

/** An on-budget checking account for `userId`, unique per call; `values` overrides columns. */
export async function insertTestAccount(
  userId: string,
  values: Partial<typeof financeAccounts.$inferInsert> = {},
): Promise<string> {
  const [account] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: "Checking",
      kind: "checking",
      externalSource: "test",
      externalKey: `chk-${crypto.randomUUID()}`,
      ...values,
    })
    .returning({ id: financeAccounts.id });
  return account.id;
}

/**
 * A spending envelope called `name`, in a spending group of its own; `values` overrides the
 * envelope's columns (a bill: `{ kind: "bill", cadenceMonths: 1 }`).
 */
export async function insertTestEnvelope(
  userId: string,
  name: string,
  values: Partial<typeof financeBudgetCategories.$inferInsert> = {},
): Promise<string> {
  const [group] = await db
    .insert(financeCategoryGroups)
    .values({
      userId,
      name: `${name} group ${crypto.randomUUID()}`,
      kind: "spending",
      sortKey: "a0",
    })
    .returning({ id: financeCategoryGroups.id });
  const [row] = await db
    .insert(financeBudgetCategories)
    .values({
      userId,
      groupId: group.id,
      name,
      sortKey: "a0",
      kind: "spending",
      ...values,
    })
    .returning({ id: financeBudgetCategories.id });
  return row.id;
}
