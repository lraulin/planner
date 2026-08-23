/**
 * Turn the 65 hardcoded `CLASSIFY_RULES` into rows, once.
 *
 * **Deliberately a transcription, not a translation.** Every rule becomes exactly one
 * `merchant matches` condition with the same pattern, in the same order, so the seeded corpus
 * cannot classify a single row differently from the array it replaces. That is what makes the
 * parity audit's answer meaningful: a difference would be a bug in this module rather than an
 * intentional improvement to argue about.
 *
 * The tempting version — "now that payees exist, convert these to `payee oneOf`" — is refused
 * for two reasons. It would be a second change hiding inside a migration, and it would break
 * the rules that matter most: `grocery-chains` and its siblings exist to categorise a merchant
 * **on first sight**, and a spelling nobody has seen mints a *new* payee that no `oneOf` list
 * contains. Regex stays available afterwards for exactly that reason (D3).
 *
 * Idempotence is `seeded_id`: a second run plans nothing for an id already present, so a rule
 * the user has since renamed, reordered, disabled or deleted is never resurrected.
 *
 * Spec: `agent-os/specs/2026-08-23-1536-finance-rules/` D1, D3.
 */

import * as sortKey from "@/lib/tree/sortKey";
import { CLASSIFY_RULES } from "../classify/rules";
import type { RuleAction } from "./actions";
import type { RuleCondition } from "./conditions";

export type RuleDraft = {
  seededId: string;
  name: string;
  sortKey: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  notes: string;
};

/**
 * Why a rule sits where it does, carried over from the comments in `classify/rules.ts`.
 *
 * The array's comments are the only record of several decisions with money attached, and a
 * comment cannot survive the file being deleted. Moving them into `notes` is the point of that
 * column: the reasoning becomes visible next to the rule rather than to whoever reads the
 * source, and it stays correctable.
 *
 * Only the rules whose reasoning is load-bearing appear here. A rule that simply names a
 * merchant explains itself.
 */
const SEED_NOTES: Record<string, string> = {
  "metlife-pet":
    "Filed under Pets rather than Insurance, so pet insurance counts as a pet cost. MetLife's other products are not in this file; if one is ever added, this rule has to stay above it.",
  spotify:
    "PP*SPOTIFY*<hash> and PAYPAL *SPOTIFY USA normalize to different residues; naming it here is what stops one subscription appearing as fourteen merchants.",
  "interest-charged":
    "Interest and fees are the cost of holding the accounts, not a purchase. Separated from spend so a card's carrying cost can be read on its own.",
  "interest-earned":
    "Charged interest is money out; interest paid on savings is money in. Both sit outside spend for the same reason.",
  "va-benefits":
    "Recurring income that arrives monthly, so the biweekly cadence detector in income.ts will never see it. Naming the payer is the only way it counts.",
  "paypal-outbound":
    "Lee never carries a PayPal balance, so a checking withdrawal to PayPal is the purchase itself. transfers.ts used to park these as external; this is what the cash-flow identity needs, and it does not need a statement to fire.",
};

/** What a seeded rule is called. The slug the array already used, so provenance is legible. */
function nameOf(id: string): string {
  return id;
}

export type SeedPlan = {
  create: RuleDraft[];
  /** Ids already present, skipped. Reported so a replay can say it planned nothing. */
  skipped: string[];
};

/**
 * Plan the seed against what is already there.
 *
 * Sort keys come from one `sequence` over the whole corpus rather than from the surviving
 * rows, so the drafts keep the array's relative order even on a partial re-seed. A partial
 * seed is not expected — the executor is all-or-nothing — but deriving order from whatever
 * happens to be missing would make the outcome depend on the failure.
 */
export function planRuleSeed(existingSeededIds: readonly string[]): SeedPlan {
  const present = new Set(existingSeededIds);
  const keys = sortKey.sequence(CLASSIFY_RULES.length);

  const create: RuleDraft[] = [];
  const skipped: string[] = [];

  CLASSIFY_RULES.forEach((rule, index) => {
    if (present.has(rule.id)) {
      skipped.push(rule.id);
      return;
    }

    /*
     * `RegExp.source` drops the flags, so a rule that ever gained one would be seeded as a
     * different pattern with no error anywhere. Every entry is flagless today; asserting it
     * here means the day that changes, the seed stops instead of quietly narrowing a match.
     */
    if (rule.match.flags !== "") {
      throw new Error(
        `Rule "${rule.id}" carries regex flags (${rule.match.flags}), which seeding does not preserve.`,
      );
    }

    const actions: RuleAction[] = [];
    if (rule.category)
      actions.push({ op: "set", field: "category", value: rule.category });
    if (rule.flow) actions.push({ op: "set", field: "flow", value: rule.flow });
    if (rule.merchant) actions.push({ op: "name-payee", value: rule.merchant });

    if (actions.length === 0) {
      throw new Error(`Rule "${rule.id}" would do nothing.`);
    }

    create.push({
      seededId: rule.id,
      name: nameOf(rule.id),
      sortKey: keys[index],
      conditions: [
        {
          field: "merchant",
          op: "matches",
          value: { source: rule.match.source, flags: "" },
        },
      ],
      actions,
      notes: SEED_NOTES[rule.id] ?? "",
    });
  });

  return { create, skipped };
}

export function isEmptySeedPlan(plan: SeedPlan): boolean {
  return plan.create.length === 0;
}
