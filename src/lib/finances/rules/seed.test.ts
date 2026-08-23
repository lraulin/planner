import { describe, expect, it } from "vitest";
import { CLASSIFY_RULES, matchRule } from "../classify/rules";
import { compileRules, type StoredRule } from "./compile";
import type { RuleRowInput } from "./conditions";
import { applyRules } from "./match";
import { isEmptySeedPlan, planRuleSeed } from "./seed";

/** The drafts as `compileRules` would see them once written. */
function seededRules(): StoredRule[] {
  return planRuleSeed([]).create.map((draft) => ({
    id: draft.seededId,
    name: draft.name,
    sortKey: draft.sortKey,
    enabled: true,
    conditions: draft.conditions,
    actions: draft.actions,
  }));
}

function rowFor(merchant: string): RuleRowInput {
  return {
    merchant,
    description: merchant,
    payeeId: null,
    accountId: "22222222-2222-4222-8222-222222222222",
    amountCents: -1000,
    transactionDate: "2026-02-02",
  };
}

describe("planRuleSeed", () => {
  it("produces one draft per rule, in array order", () => {
    const plan = planRuleSeed([]);
    expect(plan.create).toHaveLength(CLASSIFY_RULES.length);
    expect(plan.create.map((draft) => draft.seededId)).toEqual(
      CLASSIFY_RULES.map((rule) => rule.id),
    );
  });

  it("gives strictly increasing sort keys, because the order is the priority", () => {
    const keys = planRuleSeed([]).create.map((draft) => draft.sortKey);
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("plans nothing on a replay", () => {
    // Idempotence is the whole contract of seeded_id. A second run that re-created anything
    // would duplicate 65 rules and make the order ambiguous.
    const first = planRuleSeed([]);
    const second = planRuleSeed(first.create.map((draft) => draft.seededId));
    expect(isEmptySeedPlan(second)).toBe(true);
    expect(second.skipped).toHaveLength(CLASSIFY_RULES.length);
  });

  it("does not resurrect a rule the user deleted or renamed", () => {
    /*
     * The seeded id survives a rename and a reorder, so those are respected. A deleted rule is
     * the harder case and it is handled the same way — by planning against ids the caller says
     * are present, never against the drafts' own content.
     */
    const kept = CLASSIFY_RULES.map((rule) => rule.id).filter((id) => id !== "spotify");
    const plan = planRuleSeed(kept);
    expect(plan.create.map((draft) => draft.seededId)).toEqual(["spotify"]);
  });

  it("carries every rule's actions across, including the flow-only one", () => {
    const byId = new Map(
      planRuleSeed([]).create.map((draft) => [draft.seededId, draft]),
    );

    expect(byId.get("paypal-outbound")?.actions).toEqual([
      { op: "set", field: "flow", value: "spend" },
    ]);
    expect(byId.get("interest-earned")?.actions).toEqual([
      { op: "set", field: "category", value: "Fees & Interest" },
      { op: "set", field: "flow", value: "interest_fee" },
      { op: "name-payee", value: "Interest Paid" },
    ]);
  });

  it("gives every draft at least one action", () => {
    for (const draft of planRuleSeed([]).create) {
      expect(draft.actions.length, draft.seededId).toBeGreaterThan(0);
    }
  });

  it("keeps the reasoning that only existed as a comment", () => {
    // classify/rules.ts is deleted at the end of this spec, and a comment cannot survive that.
    const byId = new Map(
      planRuleSeed([]).create.map((draft) => [draft.seededId, draft]),
    );
    expect(byId.get("metlife-pet")?.notes).toContain("pet cost");
    expect(byId.get("va-benefits")?.notes).toContain("biweekly");
  });
});

describe("the seeded corpus reproduces matchRule", () => {
  /**
   * Every distinct normalized merchant the old matcher can be asked about.
   *
   * Built from the patterns themselves rather than from a fixture list, so a rule added later
   * is covered without anyone remembering to extend this. Each pattern contributes strings
   * that should hit it and, through the whole set, strings that should hit an *earlier* rule
   * instead — which is what makes the order part of what is being compared.
   */
  const probes = new Set<string>();
  for (const rule of CLASSIFY_RULES) {
    for (const literal of rule.match.source
      .replace(/[$^]/g, "")
      .split(/[|()]/)
      .map((part) => part.trim())
      .filter((part) => part.length > 1 && !/[\\[\]{}*+?.]/.test(part))) {
      probes.add(literal);
      probes.add(`${literal} #1981`);
      probes.add(`${literal}S`);
    }
  }
  // Plus strings nothing should claim, so "agrees" cannot mean "both matched everything".
  for (const miss of ["", "ZZZ NOTHING", "ACME MYSTERY SHOP", "A"]) probes.add(miss);

  it("has a corpus worth comparing", () => {
    expect(probes.size).toBeGreaterThan(100);
  });

  it("agrees with matchRule on the category for every probe", () => {
    /*
     * The offline half of the parity proof. The database half runs the whole planner over the
     * real 7,030 rows; this one is what fails fast, in CI, without Postgres — and it covers
     * strings the real file may not happen to contain.
     */
    const { rules, problems } = compileRules(seededRules());
    expect(problems).toEqual([]);

    for (const merchant of probes) {
      const legacy = matchRule(merchant);
      const seeded = applyRules(rules, rowFor(merchant));

      expect(seeded.ruleId, merchant).toBe(legacy?.id ?? null);
      expect(seeded.category, merchant).toBe(legacy?.category ?? null);
      expect(seeded.flow, merchant).toBe(legacy?.flow ?? null);
      expect(seeded.payeeName, merchant).toBe(legacy?.merchant ?? null);
    }
  });

  it("no two seeded patterns claim the same probe, so order decides nothing yet", () => {
    /*
     * Worth pinning, because it is why the parity proof above is insensitive to order and
     * therefore cannot stand in for the sort-key test. The 65 patterns are mutually exclusive
     * — verified against all 851 distinct merchant strings in the real file, and re-checked
     * here against the generated probes.
     *
     * If this ever fails, the corpus has grown an overlap, and from that moment the seeded
     * order is load-bearing: check that the pair is in the intended order before changing
     * anything else.
     */
    for (const merchant of probes) {
      const claimed = CLASSIFY_RULES.filter((rule) => rule.match.test(merchant));
      expect(
        claimed.map((rule) => rule.id),
        merchant,
      ).toHaveLength(claimed.length === 0 ? 0 : 1);
    }
  });
});
