/**
 * Which rule claims a row, and what it says about it.
 *
 * **First match wins, in the order the user set.** Every condition on a rule must hold (AND);
 * an "or" within one field is `oneOf`, and an "or" across fields is two rules.
 *
 * **This is a deliberate divergence from Actual**, recorded in
 * `agent-os/specs/2026-08-23-1536-finance-rules/` D2. Actual ranks rules by a computed
 * specificity score and lets every matching rule apply, most specific last. That cannot work
 * on this corpus: `OP_SCORES` in `../actual/packages/loot-core/src/server/rules/rule-utils.ts`
 * gives `matches` a score of zero, and the specificity bonus requires *every* condition to be
 * an equality op — so 65 regex rules would all score zero, tie, and be ordered by id.
 * `METLIFE PET` beating `METLIFE` would come down to a UUID comparison.
 *
 * Keeping one rule per row also keeps `ruleId` singular, so "why is this Dining?" has one
 * answer with a name on it.
 */

import type { CompiledRule } from "./compile";
import { conditionMatches, type RuleRowInput } from "./conditions";

/** Whether every condition on this rule holds for this row. */
export function ruleMatches(rule: CompiledRule, row: RuleRowInput): boolean {
  return rule.conditions.every((condition) => conditionMatches(condition, row));
}

/** The first rule in priority order that claims this row, or null. */
export function matchRules(
  rules: readonly CompiledRule[],
  row: RuleRowInput,
): CompiledRule | null {
  for (const rule of rules) {
    if (ruleMatches(rule, row)) return rule;
  }
  return null;
}

/** What the winning rule says about a row. Every field is null when nothing claimed it. */
export type RuleOutcome = {
  category: string | null;
  flow: string | null;
  /** A name for a payee about to be minted — never a rename of one that exists. */
  payeeName: string | null;
  /** Which rule decided, for explaining a categorisation. */
  ruleId: string | null;
};

export const NO_RULE: RuleOutcome = {
  category: null,
  flow: null,
  payeeName: null,
  ruleId: null,
};

export function applyRules(
  rules: readonly CompiledRule[],
  row: RuleRowInput,
): RuleOutcome {
  const rule = matchRules(rules, row);
  if (!rule) return NO_RULE;

  const outcome: RuleOutcome = { ...NO_RULE, ruleId: rule.id };
  for (const action of rule.actions) {
    if (action.op === "name-payee") outcome.payeeName = action.value;
    else if (action.field === "category") outcome.category = action.value;
    else outcome.flow = action.value;
  }
  return outcome;
}
