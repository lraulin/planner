/**
 * A payee claim is "this merchant's charges belong to this envelope."
 *
 * Track as bill, New bill…, Review, the payee picker, and the agent tool all end here.
 * Filing charges and writing the exact-payee rule live in this one place so those names
 * cannot drift apart
 * (`agent-os/specs/2026-08-24-1522-category-by-kind-and-history/` D3).
 */

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financePayees,
  financeRules,
  financeTransactions,
} from "@/db/schema";
import type { MonthKey } from "../budget/envelope";
import { parseRuleActions } from "../rules/actions";
import { createRule, updateRule } from "../rules/mutations";

export function isExactPayeeRule(conditions: unknown, payeeId: string): boolean {
  if (!Array.isArray(conditions) || conditions.length !== 1) return false;
  const condition = conditions[0] as Record<string, unknown> | null;
  return (
    condition?.field === "payee" && condition.op === "is" && condition.value === payeeId
  );
}

/**
 * File claimed payees' on-budget charges into the envelope that claims them.
 *
 * `since` bounds an ingest catch-up to the budget window when the caller wants that;
 * omitting it files history too, which is what Track as bill means by "this payee."
 * Off-budget accounts are never filed.
 */
export async function applyPayeeClaims(
  userId: string,
  options: { since?: MonthKey; payeeIds?: readonly string[] } = {},
): Promise<{ moved: number }> {
  const rows = await db
    .select({
      id: financeTransactions.id,
      categoryId: financePayees.budgetCategoryId,
    })
    .from(financeTransactions)
    .innerJoin(financePayees, eq(financePayees.id, financeTransactions.payeeId))
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financePayees.userId, userId),
        eq(financeAccounts.userId, userId),
        eq(financeAccounts.offBudget, false),
        sql`${financePayees.budgetCategoryId} is not null`,
        sql`${financeTransactions.budgetCategoryId} is distinct from ${financePayees.budgetCategoryId}`,
        ...(options.since
          ? [gte(financeTransactions.transactionDate, options.since)]
          : []),
        ...(options.payeeIds && options.payeeIds.length > 0
          ? [inArray(financePayees.id, [...options.payeeIds])]
          : []),
      ),
    );
  if (rows.length === 0) return { moved: 0 };

  const byCategory = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.categoryId) continue;
    const bucket = byCategory.get(row.categoryId) ?? [];
    bucket.push(row.id);
    byCategory.set(row.categoryId, bucket);
  }

  let moved = 0;
  await db.transaction(async (tx) => {
    for (const [categoryId, ids] of byCategory) {
      await tx
        .update(financeTransactions)
        .set({ budgetCategoryId: categoryId, updatedAt: new Date() })
        .where(
          and(
            eq(financeTransactions.userId, userId),
            inArray(financeTransactions.id, ids),
          ),
        );
      moved += ids.length;
    }
  });

  return { moved };
}

/** Create or update the exact-payee Category rule. Later-match-wins: new rules go last. */
export async function upsertPayeeCategoryRule(
  userId: string,
  payeeId: string,
  categoryId: string,
  notes?: string,
): Promise<void> {
  const [payee, rules] = await Promise.all([
    db
      .select({ name: financePayees.name })
      .from(financePayees)
      .where(and(eq(financePayees.userId, userId), eq(financePayees.id, payeeId)))
      .limit(1),
    db
      .select({
        id: financeRules.id,
        name: financeRules.name,
        conditions: financeRules.conditions,
        actions: financeRules.actions,
        enabled: financeRules.enabled,
        notes: financeRules.notes,
      })
      .from(financeRules)
      .where(eq(financeRules.userId, userId)),
  ]);
  if (!payee[0]) throw new Error("That payee does not exist.");

  const existing = rules.find((rule) => isExactPayeeRule(rule.conditions, payeeId));
  if (existing) {
    const parsed = parseRuleActions(existing.actions, { hasPayeeCondition: true });
    const actions =
      "actions" in parsed
        ? parsed.actions.filter(
            (action) => !(action.op === "set" && action.field === "category"),
          )
        : [];
    await updateRule(userId, existing.id, {
      name: existing.name,
      conditions: existing.conditions,
      actions: [...actions, { op: "set", field: "category", value: categoryId }],
      enabled: existing.enabled,
      notes: existing.notes,
    });
    return;
  }

  await createRule(userId, {
    name: `Categorize ${payee[0].name} (${payeeId.slice(0, 6)})`,
    conditions: [{ field: "payee", op: "is", value: payeeId }],
    actions: [{ op: "set", field: "category", value: categoryId }],
    notes: notes ?? "This payee belongs to this envelope.",
  });
}

/**
 * After a claim is stored: file every on-budget charge of those payees, including
 * history, and make sure an exact-payee rule will beat a broader merchant match.
 */
export async function applyClaimedPayees(
  userId: string,
  envelopeId: string,
  payeeIds: readonly string[],
): Promise<void> {
  if (payeeIds.length === 0) return;
  await applyPayeeClaims(userId, { payeeIds });
  for (const payeeId of payeeIds) {
    await upsertPayeeCategoryRule(userId, payeeId, envelopeId);
  }
}
