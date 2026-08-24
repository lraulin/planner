/**
 * Writes for rules (`agent-os/specs/2026-08-23-1536-finance-rules/`).
 *
 * Every mutation takes `userId` first, scopes on it, and proves the row was theirs before
 * touching it (`agent-os/standards/development/security.md`).
 *
 * **Validation happens here, not only in the editor.** `conditions` and `actions` are JSONB, so
 * the database cannot check their shape; a rule saved past this point that fails to compile is
 * dropped silently from every pass. Parsing on the way in is what turns that into a message.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetCategories,
  financePayees,
  financeRules,
} from "@/db/schema";
import { isUniqueViolation } from "@/lib/db/constraints";
import * as sortKey from "@/lib/tree/sortKey";
import { storedConditionPayeeIds } from "../payees/references";
import { parseRuleActions } from "./actions";
import { parseRuleConditionsDetailed, toStoredConditions } from "./conditions";
import { getRule } from "./queries";

export type RuleInput = {
  name: string;
  conditions: unknown;
  actions: unknown;
  enabled?: boolean;
  notes?: string;
};

async function requireRule(userId: string, ruleId: string) {
  const row = await getRule(userId, ruleId);
  if (!row) throw new Error("That rule does not exist.");
  return row;
}

/**
 * Refuse a condition naming a payee or account that is not this user's.
 *
 * Without it, a rule could hold an id from another user's data: harmless to *them*, because
 * matching only ever runs over the owner's own transactions, but it would show a blank name in
 * the editor forever and quietly match nothing.
 */
async function requireOwnedReferences(
  userId: string,
  conditions: unknown,
  actions: readonly import("./actions").RuleAction[],
): Promise<void> {
  const payeeIds = storedConditionPayeeIds(conditions);
  if (payeeIds.length > 0) {
    const rows = await db
      .select({ id: financePayees.id })
      .from(financePayees)
      .where(
        and(eq(financePayees.userId, userId), inArray(financePayees.id, payeeIds)),
      );
    if (rows.length !== payeeIds.length) {
      throw new Error("One or more payees do not exist.");
    }
  }

  const accountIds = Array.isArray(conditions)
    ? [
        ...new Set(
          conditions.flatMap((condition) => {
            if (
              typeof condition !== "object" ||
              condition === null ||
              (condition as { field?: unknown }).field !== "account"
            ) {
              return [];
            }
            const value = (condition as { value?: unknown }).value;
            if (typeof value === "string") return [value];
            return Array.isArray(value)
              ? value.filter((v) => typeof v === "string")
              : [];
          }),
        ),
      ]
    : [];
  if (accountIds.length > 0) {
    const rows = await db
      .select({ id: financeAccounts.id })
      .from(financeAccounts)
      .where(
        and(
          eq(financeAccounts.userId, userId),
          inArray(financeAccounts.id, accountIds),
        ),
      );
    if (rows.length !== accountIds.length) {
      throw new Error("One or more accounts do not exist.");
    }
  }

  const categoryIds = actions.flatMap((action) =>
    action.op === "set" && action.field === "category" ? [action.value] : [],
  );
  if (categoryIds.length > 0) {
    const rows = await db
      .select({ id: financeBudgetCategories.id })
      .from(financeBudgetCategories)
      .where(
        and(
          eq(financeBudgetCategories.userId, userId),
          inArray(financeBudgetCategories.id, categoryIds),
        ),
      );
    if (rows.length !== new Set(categoryIds).size) {
      throw new Error("One or more categories do not exist.");
    }
  }
}

/** Parse both blobs together, because one of the action rules depends on the conditions. */
function validate(input: RuleInput) {
  const name = input.name.trim();
  if (name === "") throw new Error("A rule needs a name.");

  const parsedConditions = parseRuleConditionsDetailed(input.conditions);
  if ("error" in parsedConditions) throw new Error(parsedConditions.error);
  const conditions = parsedConditions.conditions;

  const parsed = parseRuleActions(input.actions, {
    hasPayeeCondition: conditions.some((condition) => condition.field === "payee"),
  });
  if ("error" in parsed) throw new Error(parsed.error);

  return { name, conditions: toStoredConditions(conditions), actions: parsed.actions };
}

async function lastSortKey(userId: string): Promise<string | null> {
  const rows = await db
    .select({ sortKey: financeRules.sortKey })
    .from(financeRules)
    .where(eq(financeRules.userId, userId))
    .orderBy(financeRules.sortKey);
  return rows.at(-1)?.sortKey ?? null;
}

/**
 * Create a rule at the **end** of the list — the lowest priority.
 *
 * Deliberate: a new rule that landed first would start claiming rows an existing rule was
 * handling, which is a surprising thing for "add a rule" to do. Moving it up is one drag.
 */
export async function createRule(userId: string, input: RuleInput): Promise<string> {
  const { name, conditions, actions } = validate(input);
  await requireOwnedReferences(userId, conditions, actions);
  const last = await lastSortKey(userId);

  try {
    const [row] = await db
      .insert(financeRules)
      .values({
        userId,
        name,
        conditions,
        actions,
        enabled: input.enabled ?? true,
        notes: input.notes ?? "",
        sortKey: sortKey.between(last, null),
      })
      .returning({ id: financeRules.id });
    return row.id;
  } catch (error) {
    if (isUniqueViolation(error))
      throw new Error(`A rule named "${name}" already exists.`);
    throw error;
  }
}

export async function updateRule(
  userId: string,
  ruleId: string,
  input: RuleInput,
): Promise<void> {
  await requireRule(userId, ruleId);
  const { name, conditions, actions } = validate(input);
  await requireOwnedReferences(userId, conditions, actions);

  try {
    await db
      .update(financeRules)
      .set({
        name,
        conditions,
        actions,
        enabled: input.enabled ?? true,
        notes: input.notes ?? "",
        categoryReviewRequired: false,
        updatedAt: new Date(),
      })
      .where(and(eq(financeRules.userId, userId), eq(financeRules.id, ruleId)));
  } catch (error) {
    if (isUniqueViolation(error))
      throw new Error(`A rule named "${name}" already exists.`);
    throw error;
  }
}

export async function setRuleEnabled(
  userId: string,
  ruleId: string,
  enabled: boolean,
): Promise<void> {
  await requireRule(userId, ruleId);
  await db
    .update(financeRules)
    .set({ enabled, updatedAt: new Date() })
    .where(and(eq(financeRules.userId, userId), eq(financeRules.id, ruleId)));
}

export async function deleteRule(userId: string, ruleId: string): Promise<void> {
  await requireRule(userId, ruleId);
  await db
    .delete(financeRules)
    .where(and(eq(financeRules.userId, userId), eq(financeRules.id, ruleId)));
}

/**
 * Move one rule between two others.
 *
 * A fractional index, so this rewrites exactly one row however long the list is — and so two
 * people reordering different rules cannot collide. `sort_key` is unique per user, which is
 * what turns a colliding key into an error rather than an arbitrary tie.
 */
export async function moveRule(
  userId: string,
  ruleId: string,
  position: { afterId?: string | null; beforeId?: string | null },
): Promise<void> {
  await requireRule(userId, ruleId);

  const neighbours = await db
    .select({ id: financeRules.id, sortKey: financeRules.sortKey })
    .from(financeRules)
    .where(eq(financeRules.userId, userId));
  const keyOf = (id: string | null | undefined) =>
    id ? (neighbours.find((row) => row.id === id)?.sortKey ?? null) : null;

  const next = sortKey.between(keyOf(position.afterId), keyOf(position.beforeId));
  await db
    .update(financeRules)
    .set({ sortKey: next, updatedAt: new Date() })
    .where(and(eq(financeRules.userId, userId), eq(financeRules.id, ruleId)));
}
