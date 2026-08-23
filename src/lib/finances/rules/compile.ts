/**
 * Turn stored rule rows into something a pass can run, once per pass.
 *
 * **Compiling here rather than per row is the whole reason this module exists.** The corpus is
 * 65 rules and the history is 7,030 transactions; building a `RegExp` inside that loop is
 * 457,000 constructions per reclassify, and it is the kind of cost that looks free in a unit
 * test and shows up only against real data.
 *
 * **A bad row is dropped and reported, never thrown.** `conditions` and `actions` are JSONB,
 * so nothing in the database guarantees their shape, and a rule saved by an older version — or
 * by hand — must not be able to take down every page that classifies a transaction. The
 * `problems` list is what a page shows so the row can be fixed rather than silently ignored.
 *
 * Spec: `agent-os/specs/2026-08-23-1536-finance-rules/`.
 */

import { parseRuleActions, type RuleAction } from "./actions";
import { parseRuleConditionsDetailed, type CompiledCondition } from "./conditions";

export type StoredRule = {
  id: string;
  name: string;
  conditions: unknown;
  actions: unknown;
  enabled: boolean;
  /** The priority. Rules run in ascending order and the first match wins. */
  sortKey: string;
};

export type CompiledRule = {
  id: string;
  name: string;
  sortKey: string;
  conditions: CompiledCondition[];
  actions: RuleAction[];
};

export type RuleProblem = {
  id: string;
  name: string;
  reason: string;
};

export type CompiledRules = {
  /** Enabled, valid, in priority order. */
  rules: CompiledRule[];
  problems: RuleProblem[];
};

function hasPayeeCondition(conditions: readonly CompiledCondition[]): boolean {
  return conditions.some((condition) => condition.field === "payee");
}

/**
 * Compile every enabled rule, in `sortKey` order.
 *
 * A disabled rule is skipped rather than compiled-and-not-run: it is also not validated, so a
 * rule can be switched off precisely because it is broken, which is the only way to recover
 * from a bad row without deleting it.
 */
export function compileRules(stored: readonly StoredRule[]): CompiledRules {
  const rules: CompiledRule[] = [];
  const problems: RuleProblem[] = [];

  const ordered = [...stored].sort((a, b) =>
    a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.id.localeCompare(b.id),
  );

  for (const row of ordered) {
    if (!row.enabled) continue;

    const parsedConditions = parseRuleConditionsDetailed(row.conditions);
    if ("error" in parsedConditions) {
      problems.push({
        id: row.id,
        name: row.name,
        reason: parsedConditions.error,
      });
      continue;
    }
    const conditions = parsedConditions.conditions;

    const parsed = parseRuleActions(row.actions, {
      hasPayeeCondition: hasPayeeCondition(conditions),
    });
    if ("error" in parsed) {
      problems.push({ id: row.id, name: row.name, reason: parsed.error });
      continue;
    }

    rules.push({
      id: row.id,
      name: row.name,
      sortKey: row.sortKey,
      conditions,
      actions: parsed.actions,
    });
  }

  return { rules, problems };
}
