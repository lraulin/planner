import { describe, expect, it } from "vitest";
import { compileRules, type StoredRule } from "./compile";
import type { RuleRowInput } from "./conditions";
import { applyRules, matchRules } from "./match";

const ROW: RuleRowInput = {
  merchant: "METLIFE PET INSURANCE",
  description: "METLIFE PET INSURANCE PMT",
  payeeId: "11111111-1111-4111-8111-111111111111",
  accountId: "22222222-2222-4222-8222-222222222222",
  amountCents: -4500,
  transactionDate: "2026-02-02",
};

const PETS = "33333333-3333-4333-8333-333333333333";
const INSURANCE_ID = "44444444-4444-4444-8444-444444444444";
const GROCERIES = "55555555-5555-4555-8555-555555555555";

function rule(
  id: string,
  sortKey: string,
  source: string,
  category: string,
  extra: Partial<StoredRule> = {},
): StoredRule {
  return {
    id,
    name: id,
    sortKey,
    enabled: true,
    conditions: [{ field: "merchant", op: "matches", value: { source, flags: "" } }],
    actions: [{ op: "set", field: "category", value: category }],
    ...extra,
  };
}

/**
 * A specific rule above a general one that would otherwise swallow it.
 *
 * Synthetic: the 65 seeded rules do not actually overlap on any real merchant (see
 * `seed.test.ts`), so the ordering behaviour has to be exercised with a pair built for it
 * rather than borrowed from the corpus.
 */
const PET = rule("specific", "a1", "^METLIFE PET", PETS);
const INSURANCE = rule("general", "a2", "^METLIFE", INSURANCE_ID);

describe("matchRules", () => {
  it("returns every matching rule in visible order", () => {
    const { rules } = compileRules([PET, INSURANCE]);
    expect(matchRules(rules, ROW).map((entry) => entry.id)).toEqual([
      "specific",
      "general",
    ]);
  });

  it("swapping their sort keys swaps the answer", () => {
    /*
     * This is the test that makes the ordering claim falsifiable. Without it, the first test
     * would still pass under an engine that ignored `sortKey` entirely and happened to try
     * the rules in insertion order.
     */
    const { rules } = compileRules([
      { ...PET, sortKey: "a2" },
      { ...INSURANCE, sortKey: "a1" },
    ]);
    expect(matchRules(rules, ROW).map((entry) => entry.id)).toEqual([
      "general",
      "specific",
    ]);
  });

  it("orders by sort key regardless of the order rows arrive in", () => {
    const { rules } = compileRules([INSURANCE, PET]);
    expect(rules.map((entry) => entry.id)).toEqual(["specific", "general"]);
  });

  it("never fires a disabled rule", () => {
    const { rules } = compileRules([{ ...PET, enabled: false }, INSURANCE]);
    expect(matchRules(rules, ROW).map((entry) => entry.id)).toEqual(["general"]);
  });

  it("requires every condition on a rule to hold", () => {
    // Conditions are ANDed. An "or" within a field is oneOf; across fields it is two rules.
    const { rules } = compileRules([
      {
        ...PET,
        conditions: [
          {
            field: "merchant",
            op: "matches",
            value: { source: "^METLIFE", flags: "" },
          },
          { field: "amount", op: "lt", value: -10000 },
        ],
      },
    ]);
    expect(matchRules(rules, ROW)).toEqual([]);
  });

  it("returns null when nothing claims the row", () => {
    const { rules } = compileRules([rule("costco", "a1", "^COSTCO", GROCERIES)]);
    expect(matchRules(rules, ROW)).toEqual([]);
  });

  it("gives the same answer for the same row twice", () => {
    // Compiled rules are reused across 7,000 rows; any state carried between calls would show
    // up here as an alternating answer.
    const { rules } = compileRules([PET, INSURANCE]);
    expect(matchRules(rules, ROW).map((entry) => entry.id)).toEqual([
      "specific",
      "general",
    ]);
    expect(matchRules(rules, ROW).map((entry) => entry.id)).toEqual([
      "specific",
      "general",
    ]);
  });
});

describe("applyRules", () => {
  it("reports the category, the flow, the name and which rule decided", () => {
    const { rules } = compileRules([
      {
        ...PET,
        actions: [
          { op: "set", field: "category", value: PETS },
          { op: "set", field: "flow", value: "spend" },
          { op: "name-payee", value: "MetLife Pet" },
        ],
      },
    ]);

    expect(applyRules(rules, ROW)).toEqual({
      category: PETS,
      flow: "spend",
      payeeName: "MetLife Pet",
      tags: [],
      ruleIds: ["specific"],
      categoryRuleId: "specific",
      flowRuleId: "specific",
      payeeRuleId: "specific",
      ruleId: "specific",
    });
  });

  it("leaves untouched what the winning rule does not set", () => {
    // A flow-only rule must not blank a category the caller would otherwise take from
    // elsewhere; nulls here mean "this rule said nothing", not "make it nothing".
    const { rules } = compileRules([
      { ...PET, actions: [{ op: "set", field: "flow", value: "spend" }] },
    ]);
    expect(applyRules(rules, ROW)).toMatchObject({
      category: null,
      flow: "spend",
      payeeName: null,
    });
  });

  it("says nothing at all when no rule matched", () => {
    const { rules } = compileRules([rule("costco", "a1", "^COSTCO", GROCERIES)]);
    expect(applyRules(rules, ROW)).toEqual({
      category: null,
      flow: null,
      payeeName: null,
      tags: [],
      ruleIds: [],
      categoryRuleId: null,
      flowRuleId: null,
      payeeRuleId: null,
      ruleId: null,
    });
  });

  it("composes fields and lets the later match override the same field", () => {
    const { rules } = compileRules([
      {
        ...PET,
        sortKey: "a1",
        actions: [{ op: "set", field: "flow", value: "spend" }],
      },
      { ...INSURANCE, sortKey: "a2" },
    ]);
    expect(applyRules(rules, ROW)).toMatchObject({
      category: INSURANCE_ID,
      flow: "spend",
      ruleIds: ["specific", "general"],
      categoryRuleId: "general",
    });
  });
});

describe("compileRules", () => {
  it("drops a rule whose conditions cannot be read, and says which", () => {
    // JSONB guarantees no shape. A bad row must not throw on every page that classifies a
    // transaction — it must be reported so someone can fix it.
    const { rules, problems } = compileRules([
      { ...PET, conditions: "not an array" },
      INSURANCE,
    ]);

    expect(rules.map((entry) => entry.id)).toEqual(["general"]);
    expect(problems).toEqual([
      {
        id: "specific",
        name: "specific",
        reason: expect.stringContaining("conditions"),
      },
    ]);
  });

  it("drops a rule whose actions are invalid, with the reason a person can act on", () => {
    const { rules, problems } = compileRules([
      { ...PET, actions: [{ op: "set", field: "category", value: "Restaurants" }] },
    ]);
    expect(rules).toEqual([]);
    expect(problems[0].reason).toBeTruthy();
  });

  it("does not validate a disabled rule, so a broken one can be switched off", () => {
    // Otherwise the only way out of a bad row would be deleting it, losing whatever the rule
    // was trying to say.
    const { rules, problems } = compileRules([
      { ...PET, enabled: false, conditions: "not an array" },
    ]);
    expect(rules).toEqual([]);
    expect(problems).toEqual([]);
  });

  it("breaks a sort-key tie deterministically rather than by arrival order", () => {
    // The unique index makes a tie impossible in the database; this keeps the pure function
    // total anyway, so a test fixture or a bad import cannot make the order depend on a query
    // plan.
    const a = compileRules([rule("b", "a1", "^B", PETS), rule("a", "a1", "^A", PETS)]);
    const b = compileRules([rule("a", "a1", "^A", PETS), rule("b", "a1", "^B", PETS)]);
    expect(a.rules.map((entry) => entry.id)).toEqual(b.rules.map((entry) => entry.id));
  });
});
