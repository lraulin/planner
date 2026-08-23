/**
 * Reads for rules (`agent-os/specs/2026-08-23-1536-finance-rules/`).
 *
 * Every query is scoped to one user. Payee and account conditions hold ids, so the list
 * resolves them to names here rather than leaving a page to join a UUID against something —
 * the same shape `schedules/queries.ts` uses for the identical problem.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financePayees, financeRules } from "@/db/schema";
import { compileRules, type StoredRule } from "./compile";
import { storedSchedulePayeeIds } from "../payees/references";

export type RuleRecord = {
  id: string;
  name: string;
  conditions: unknown;
  actions: unknown;
  enabled: boolean;
  sortKey: string;
  seededId: string | null;
  notes: string;
};

export type RuleRow = RuleRecord & {
  /** Payee and account ids resolved to names, for display only. */
  names: Record<string, string>;
  /** Why this rule did not compile, or null. A page shows it so the row can be fixed. */
  problem: string | null;
};

export async function getRule(
  userId: string,
  ruleId: string,
): Promise<RuleRecord | null> {
  const [row] = await db
    .select({
      id: financeRules.id,
      name: financeRules.name,
      conditions: financeRules.conditions,
      actions: financeRules.actions,
      enabled: financeRules.enabled,
      sortKey: financeRules.sortKey,
      seededId: financeRules.seededId,
      notes: financeRules.notes,
    })
    .from(financeRules)
    .where(and(eq(financeRules.userId, userId), eq(financeRules.id, ruleId)));
  return row ?? null;
}

/** Every account id named by an `account` condition. */
function storedAccountIds(conditions: unknown): string[] {
  if (!Array.isArray(conditions)) return [];
  const ids: string[] = [];
  for (const condition of conditions) {
    if (
      typeof condition !== "object" ||
      condition === null ||
      (condition as { field?: unknown }).field !== "account"
    ) {
      continue;
    }
    const value = (condition as { value?: unknown }).value;
    if (typeof value === "string") ids.push(value);
    else if (Array.isArray(value)) {
      for (const entry of value) if (typeof entry === "string") ids.push(entry);
    }
  }
  return ids;
}

export async function listRules(userId: string): Promise<RuleRow[]> {
  const records = await db
    .select({
      id: financeRules.id,
      name: financeRules.name,
      conditions: financeRules.conditions,
      actions: financeRules.actions,
      enabled: financeRules.enabled,
      sortKey: financeRules.sortKey,
      seededId: financeRules.seededId,
      notes: financeRules.notes,
    })
    .from(financeRules)
    .where(eq(financeRules.userId, userId))
    .orderBy(financeRules.sortKey);

  const payeeIds = new Set<string>();
  const accountIds = new Set<string>();
  for (const record of records) {
    for (const id of storedSchedulePayeeIds(record.conditions)) payeeIds.add(id);
    for (const id of storedAccountIds(record.conditions)) accountIds.add(id);
  }

  const [payees, accounts] = await Promise.all([
    payeeIds.size === 0
      ? []
      : db
          .select({ id: financePayees.id, name: financePayees.name })
          .from(financePayees)
          .where(
            and(
              eq(financePayees.userId, userId),
              inArray(financePayees.id, [...payeeIds]),
            ),
          ),
    accountIds.size === 0
      ? []
      : db
          .select({ id: financeAccounts.id, name: financeAccounts.name })
          .from(financeAccounts)
          .where(
            and(
              eq(financeAccounts.userId, userId),
              inArray(financeAccounts.id, [...accountIds]),
            ),
          ),
  ]);

  const names: Record<string, string> = {};
  for (const row of [...payees, ...accounts]) names[row.id] = row.name;

  // Compile the whole set once, so a page can say *which* rule is broken without parsing
  // anything itself — and so "did not compile" comes from the same code that runs a pass.
  const problems = new Map(
    compileRules(records as StoredRule[]).problems.map((problem) => [
      problem.id,
      problem.reason,
    ]),
  );

  return records.map((record) => ({
    ...record,
    names,
    problem: record.enabled ? (problems.get(record.id) ?? null) : null,
  }));
}
