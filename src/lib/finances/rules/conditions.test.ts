import { describe, expect, it } from "vitest";
import { CLASSIFY_RULES } from "../classify/rules";
import {
  compileStoredRegex,
  conditionMatches,
  parseRuleConditions,
  regexRisk,
  toStoredConditions,
  type RuleRowInput,
} from "./conditions";

const ROW: RuleRowInput = {
  merchant: "WM SUPERCENTER",
  description: "WM SUPERCENTER #1981",
  payeeId: "11111111-1111-4111-8111-111111111111",
  accountId: "22222222-2222-4222-8222-222222222222",
  amountCents: -8412,
  transactionDate: "2026-02-02",
};

function only(raw: unknown) {
  const parsed = parseRuleConditions([raw]);
  expect(parsed).not.toBeNull();
  return parsed![0];
}

describe("compileStoredRegex", () => {
  it("rejects the g flag, because .test() with g is stateful across rows", () => {
    /*
     * The bug this prevents: a global regex advances `lastIndex` on every `.test()` and
     * resumes there next time. Compiled once and run down 7,030 rows it answers yes, no,
     * yes, no — right in an editor that tries one string, wrong in the register. Compiling
     * per row would hide it at the cost of the compile step's entire reason for existing.
     */
    const built = compileStoredRegex({ source: "^WALMART", flags: "g" });
    expect(built).toMatchObject({ error: expect.stringContaining('"i"') });
  });

  it("rejects the y flag for the same reason", () => {
    expect(compileStoredRegex({ source: "^WALMART", flags: "y" })).toHaveProperty("error");
  });

  it("allows the i flag, which is what raw bank descriptions need", () => {
    expect(compileStoredRegex({ source: "github", flags: "i" })).toHaveProperty("regex");
  });

  it("reports an unparseable pattern instead of throwing during a pass", () => {
    // A malformed pattern reaching the matcher would throw once per row, on every page that
    // classifies anything. It has to fail where it is written.
    expect(compileStoredRegex({ source: "(unclosed", flags: "" })).toHaveProperty("error");
  });

  it("rejects a pattern longer than the cap", () => {
    expect(
      compileStoredRegex({ source: "A".repeat(201), flags: "" }),
    ).toHaveProperty("error");
  });

  it("rejects an empty pattern, which would claim every row", () => {
    expect(compileStoredRegex({ source: "", flags: "" })).toHaveProperty("error");
  });
});

describe("regexRisk", () => {
  it("rejects a quantifier nested inside a quantified group", () => {
    // `(a+)+b` against a failing 40-character input is 2^40 steps, and the input comes from a
    // bank feed rather than from whoever wrote the pattern.
    expect(regexRisk("(a+)+b")).not.toBeNull();
    expect(regexRisk("(\\w+\\s?)*$")).not.toBeNull();
  });

  it("rejects a repeated alternation whose branches are the same", () => {
    expect(regexRisk("(a|a)*")).not.toBeNull();
  });

  it("accepts every pattern in the corpus this engine has to seed", () => {
    /*
     * The screen is deliberately conservative, which means it can refuse a pattern that was
     * never dangerous. Running it over all 65 real rules is what keeps "conservative" from
     * becoming "rejects the migration": if this fails, the heuristic is wrong, not the rule.
     */
    for (const rule of CLASSIFY_RULES) {
      expect(regexRisk(rule.match.source), rule.id).toBeNull();
    }
  });

  it("accepts every corpus pattern through the full compile, flags included", () => {
    for (const rule of CLASSIFY_RULES) {
      const built = compileStoredRegex({
        source: rule.match.source,
        flags: rule.match.flags,
      });
      expect(built, rule.id).toHaveProperty("regex");
    }
  });
});

describe("parseRuleConditions", () => {
  it("rejects an empty list, because a rule with no conditions claims everything", () => {
    expect(parseRuleConditions([])).toBeNull();
  });

  it("rejects the whole list when one entry is bad", () => {
    // All-or-nothing, like the schedule parse. A partially applied rule claims a different
    // set of rows than the one written down, and does it silently.
    expect(
      parseRuleConditions([
        { field: "merchant", op: "is", value: "COSTCO" },
        { field: "merchant", op: "nonsense", value: "COSTCO" },
      ]),
    ).toBeNull();
  });

  it("rejects an empty needle for is, contains and startsWith", () => {
    for (const op of ["is", "contains", "startsWith"]) {
      expect(parseRuleConditions([{ field: "merchant", op, value: "" }]), op).toBeNull();
    }
  });

  it("rejects a non-integer amount and a payee that is not a uuid", () => {
    expect(parseRuleConditions([{ field: "amount", op: "is", value: 12.5 }])).toBeNull();
    expect(parseRuleConditions([{ field: "payee", op: "is", value: "walmart" }])).toBeNull();
  });

  it("rejects a date that is not a calendar day", () => {
    expect(
      parseRuleConditions([{ field: "date", op: "gte", value: "2026-2-2" }]),
    ).toBeNull();
  });

  it("rejects an unknown field", () => {
    expect(parseRuleConditions([{ field: "memo", op: "is", value: "x" }])).toBeNull();
  });

  it("keeps the stored shape recoverable, regex and all", () => {
    const stored = [{ field: "merchant", op: "matches", value: { source: "^ALDI", flags: "" } }];
    expect(toStoredConditions(parseRuleConditions(stored)!)).toEqual(stored);
  });
});

describe("conditionMatches", () => {
  it("tests a merchant pattern against the normalized string, not the raw description", () => {
    /*
     * The single most consequential distinction in this module. `^GITHUB` must claim
     * `PAYPAL *GITHUB INC`, whose normalized merchant is `GITHUB` and whose raw description
     * begins with the processor stamp. Wiring `merchant` to the raw text would silently stop
     * every anchored pattern in the seeded corpus from claiming a processor row.
     */
    const paypal: RuleRowInput = {
      ...ROW,
      merchant: "GITHUB",
      description: "PAYPAL *GITHUB INC",
    };
    const merchantRule = only({
      field: "merchant",
      op: "matches",
      value: { source: "^GITHUB", flags: "" },
    });
    const descriptionRule = only({
      field: "description",
      op: "matches",
      value: { source: "^GITHUB", flags: "" },
    });

    expect(conditionMatches(merchantRule, paypal)).toBe(true);
    expect(conditionMatches(descriptionRule, paypal)).toBe(false);
  });

  it("gives the same answer when one compiled condition is tested twice", () => {
    // The lastIndex tripwire, belt and braces: even with the g flag refused at parse, a
    // compiled rule reused across rows must be stateless.
    const condition = only({
      field: "merchant",
      op: "matches",
      value: { source: "SUPERCENTER", flags: "" },
    });
    expect(conditionMatches(condition, ROW)).toBe(true);
    expect(conditionMatches(condition, ROW)).toBe(true);
    expect(conditionMatches(condition, ROW)).toBe(true);
  });

  it("compares amounts as signed cents, positive being money in", () => {
    // `lt -5000` claims a $60 charge and not a $60 deposit. Reading the amount as a magnitude
    // would make every rule about spending also claim its refund.
    const under = only({ field: "amount", op: "lt", value: -5000 });
    expect(conditionMatches(under, { ...ROW, amountCents: -6000 })).toBe(true);
    expect(conditionMatches(under, { ...ROW, amountCents: 6000 })).toBe(false);
  });

  it("treats gte and lte as inclusive and gt and lt as exclusive", () => {
    expect(conditionMatches(only({ field: "amount", op: "gte", value: -8412 }), ROW)).toBe(
      true,
    );
    expect(conditionMatches(only({ field: "amount", op: "gt", value: -8412 }), ROW)).toBe(
      false,
    );
    expect(conditionMatches(only({ field: "amount", op: "lte", value: -8412 }), ROW)).toBe(
      true,
    );
    expect(conditionMatches(only({ field: "amount", op: "lt", value: -8412 }), ROW)).toBe(
      false,
    );
  });

  it("borrows isapprox from the schedule parse rather than inventing a second tolerance", () => {
    // 7.5% of 8412 is 631, so -8000 is inside and -7000 is not.
    const approx = only({ field: "amount", op: "isapprox", value: -8412 });
    expect(conditionMatches(approx, { ...ROW, amountCents: -8000 })).toBe(true);
    expect(conditionMatches(approx, { ...ROW, amountCents: -7000 })).toBe(false);
  });

  it("compares calendar days as strings, with no timezone arithmetic", () => {
    const after = only({ field: "date", op: "gte", value: "2026-02-01" });
    expect(conditionMatches(after, ROW)).toBe(true);
    expect(conditionMatches(after, { ...ROW, transactionDate: "2026-01-31" })).toBe(false);
  });

  it("reads isbetween on dates in either order", () => {
    const backwards = only({
      field: "date",
      op: "isbetween",
      value: { date1: "2026-03-01", date2: "2026-01-01" },
    });
    expect(conditionMatches(backwards, ROW)).toBe(true);
  });

  it("never matches a payee condition on a row with no payee", () => {
    /*
     * Null is not an identity. If an unclaimed row could match a payee condition, every rule
     * naming a payee would claim the whole backlog of freshly imported rows.
     */
    const condition = only({ field: "payee", op: "is", value: ROW.payeeId! });
    expect(conditionMatches(condition, ROW)).toBe(true);
    expect(conditionMatches(condition, { ...ROW, payeeId: null })).toBe(false);
  });

  it("matches oneOf on payee and account", () => {
    expect(
      conditionMatches(only({ field: "payee", op: "oneOf", value: [ROW.payeeId!] }), ROW),
    ).toBe(true);
    expect(
      conditionMatches(
        only({ field: "account", op: "oneOf", value: [ROW.accountId] }),
        ROW,
      ),
    ).toBe(true);
  });
});
