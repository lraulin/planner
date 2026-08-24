import { describe, expect, it } from "vitest";
import { parseRuleActions, REFUSED_ACTION_OPS, summarizeActions } from "./actions";

const GROCERIES = "11111111-1111-4111-8111-111111111111";
const DINING = "22222222-2222-4222-8222-222222222222";

describe("parseRuleActions", () => {
  it("rejects a rule with no actions, which would do nothing", () => {
    expect(parseRuleActions([])).toHaveProperty("error");
  });

  it("refuses every Actual op this app does not implement, by name", () => {
    // Named rather than merely unhandled, so the message says what happened and a reader can
    // see the omission was a decision.
    for (const op of REFUSED_ACTION_OPS) {
      const parsed = parseRuleActions([{ op, value: 1 }]);
      expect(parsed, op).toMatchObject({ error: expect.stringContaining(op) });
    }
  });

  it("accepts category UUIDs and rejects labels", () => {
    expect(
      parseRuleActions([{ op: "set", field: "category", value: "Restaurants" }]),
    ).toHaveProperty("error");
    expect(
      parseRuleActions([{ op: "set", field: "category", value: DINING }]),
    ).toMatchObject({ actions: [{ value: DINING }] });
  });

  it("rejects a category on a flow that carries none", () => {
    // `carriesCategory` in reclassify.ts drops the category of any movement row. Accepting
    // this pair would silently discard half the rule at plan time.
    expect(
      parseRuleActions([
        { op: "set", field: "flow", value: "internal_transfer" },
        { op: "set", field: "category", value: DINING },
      ]),
    ).toMatchObject({ error: expect.stringContaining("internal_transfer") });
  });

  it("accepts a category alongside a flow that does carry one", () => {
    expect(
      parseRuleActions([
        { op: "set", field: "flow", value: "interest_fee" },
        { op: "set", field: "category", value: GROCERIES },
      ]),
    ).toHaveProperty("actions");
  });

  it("accepts a flow-only rule, which is what paypal-outbound is", () => {
    expect(
      parseRuleActions([{ op: "set", field: "flow", value: "spend" }]),
    ).toMatchObject({ actions: [{ field: "flow", value: "spend" }] });
  });

  it("rejects name-payee on a rule that matches by payee", () => {
    // Circular: naming happens when a payee is minted, and a payee condition can only match a
    // row that already has one. The rule could never fire its own action.
    expect(
      parseRuleActions([{ op: "name-payee", value: "Walmart" }], {
        hasPayeeCondition: true,
      }),
    ).toHaveProperty("error");
    expect(
      parseRuleActions([{ op: "name-payee", value: "Walmart" }], {
        hasPayeeCondition: false,
      }),
    ).toHaveProperty("actions");
  });

  it("rejects an empty payee name", () => {
    expect(parseRuleActions([{ op: "name-payee", value: "   " }])).toHaveProperty(
      "error",
    );
  });

  it("rejects setting the same thing twice", () => {
    // Two categories on one rule has no defensible answer, and picking the last silently
    // would make the order of a list the user cannot see into decide the outcome.
    expect(
      parseRuleActions([
        { op: "set", field: "category", value: DINING },
        { op: "set", field: "category", value: GROCERIES },
      ]),
    ).toHaveProperty("error");
  });

  it("rejects setting a field that is not category or flow", () => {
    expect(
      parseRuleActions([{ op: "set", field: "payee", value: "someone" }]),
    ).toHaveProperty("error");
  });

  it("rejects an unknown flow", () => {
    expect(
      parseRuleActions([{ op: "set", field: "flow", value: "vanished" }]),
    ).toHaveProperty("error");
  });
});

describe("summarizeActions", () => {
  it("reads as a sentence fragment for a grid cell", () => {
    expect(
      summarizeActions([
        { op: "set", field: "category", value: GROCERIES },
        { op: "add-tag", value: "groceries" },
        { op: "name-payee", value: "Walmart" },
      ]),
    ).toBe(`category = ${GROCERIES}, add #groceries, call it Walmart`);
  });
});
