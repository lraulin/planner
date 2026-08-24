/**
 * Which rule claims a row, and what it says about it.
 *
 * **Every match applies, in the order the user set.** Every condition on a rule must hold (AND);
 * an "or" within one field is `oneOf`, and an "or" across fields is two rules.
 *
 * **This is a deliberate divergence from Actual**, recorded in
 * `agent-os/specs/2026-08-23-1536-finance-rules/` D2. Actual ranks rules by a computed
 * specificity score and lets every matching rule apply, most specific last. That cannot work
 * on this corpus: `OP_SCORES` in `../actual/packages/loot-core/src/server/rules/rule-utils.ts`
 * gives `matches` a score of zero, and the specificity bonus requires *every* condition to be
 * an equality op — so 65 regex rules would all score zero, tie, and be ordered by id. Which
 * rule wins would then be a UUID comparison: stable, but not an ordering anyone can reason
 * about or correct.
 *
 * **Nothing in the seeded corpus depends on this yet.** None of the 65 patterns overlaps
 * another on any of the 851 distinct merchant strings in the real file, so today every row is
 * claimed by at most one rule. The order matters for the rules a person writes next — a broad
 * `contains` over a specific one — and it has to already be legible when that happens.
 *
 * Scalar fields retain the id of the last rule that wrote them, while `ruleIds` records the
 * complete ordered match set. That keeps both "what won?" and "what participated?" answerable.
 */

import type { CompiledRule } from "./compile";
import { conditionMatches, type RuleRowInput } from "./conditions";

/** Whether every condition on this rule holds for this row. */
export function ruleMatches(rule: CompiledRule, row: RuleRowInput): boolean {
  return rule.conditions.every((condition) => conditionMatches(condition, row));
}

/** Every rule in visible order that matches this row. */
export function matchRules(
  rules: readonly CompiledRule[],
  row: RuleRowInput,
): CompiledRule[] {
  return rules.filter((rule) => ruleMatches(rule, row));
}

/** The composed result of every matching rule. Every scalar is null when nothing wrote it. */
export type RuleOutcome = {
  category: string | null;
  flow: string | null;
  /** A name for a payee about to be minted — never a rename of one that exists. */
  payeeName: string | null;
  tags: string[];
  ruleIds: string[];
  categoryRuleId: string | null;
  flowRuleId: string | null;
  payeeRuleId: string | null;
  /** Last matching rule, retained for the older classifier audit contract. */
  ruleId: string | null;
};

export const NO_RULE: RuleOutcome = {
  category: null,
  flow: null,
  payeeName: null,
  tags: [],
  ruleIds: [],
  categoryRuleId: null,
  flowRuleId: null,
  payeeRuleId: null,
  ruleId: null,
};

export function applyRules(
  rules: readonly CompiledRule[],
  row: RuleRowInput,
): RuleOutcome {
  const matched = matchRules(rules, row);
  if (matched.length === 0) return NO_RULE;

  const outcome: RuleOutcome = {
    ...NO_RULE,
    tags: [],
    ruleIds: matched.map((rule) => rule.id),
    ruleId: matched.at(-1)?.id ?? null,
  };
  const tags = new Set<string>();
  for (const rule of matched) {
    for (const action of rule.actions) {
      if (action.op === "name-payee") {
        outcome.payeeName = action.value;
        outcome.payeeRuleId = rule.id;
      } else if (action.op === "add-tag") {
        tags.add(action.value);
      } else if (action.field === "category") {
        outcome.category = action.value;
        outcome.categoryRuleId = rule.id;
      } else {
        outcome.flow = action.value;
        outcome.flowRuleId = rule.id;
      }
    }
  }
  outcome.tags = [...tags];
  return outcome;
}
