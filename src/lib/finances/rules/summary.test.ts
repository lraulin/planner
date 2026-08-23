import { describe, expect, it } from "vitest";
import { summarizeConditions } from "./summary";

describe("summarizeConditions", () => {
  it("joins conditions with and, because they are ANDed", () => {
    // Reading as "or" would misdescribe every multi-condition rule in the opposite direction.
    expect(
      summarizeConditions([
        { field: "merchant", op: "matches", value: { source: "^COSTCO", flags: "" } },
        { field: "amount", op: "lt", value: -5000 },
      ]),
    ).toBe("merchant matches /^COSTCO/ and amount < -$50.00");
  });

  it("resolves a payee id to its name", () => {
    expect(
      summarizeConditions([{ field: "payee", op: "is", value: "abc" }], {
        abc: "Costco Wholesale",
      }),
    ).toBe("payee is Costco Wholesale");
  });

  it("falls back to the id when the name is missing rather than showing nothing", () => {
    expect(summarizeConditions([{ field: "payee", op: "is", value: "abc" }])).toBe(
      "payee is abc",
    );
  });

  it("renders amounts as signed money", () => {
    expect(summarizeConditions([{ field: "amount", op: "is", value: -1234 }])).toBe(
      "amount is -$12.34",
    );
    expect(
      summarizeConditions([
        { field: "amount", op: "isbetween", value: { num1: -5000, num2: -1000 } },
      ]),
    ).toBe("amount is between -$50.00 and -$10.00");
  });

  it("describes a blob the parser would reject, instead of throwing", () => {
    /*
     * The whole reason this reads the raw stored value: a rule that fails to compile still has
     * to render, because the grid is where someone goes to fix it. Throwing here would take
     * out the page that shows the problem.
     */
    expect(summarizeConditions("not an array")).toBe("nothing");
    expect(summarizeConditions([])).toBe("nothing");
    expect(summarizeConditions([{ field: "merchant" }])).toBe("merchant ? …");
    expect(summarizeConditions([null])).toBe("…");
  });

  it("lists a oneOf, resolving each id", () => {
    expect(
      summarizeConditions([{ field: "payee", op: "oneOf", value: ["a", "b"] }], {
        a: "Aldi",
        b: "Lidl",
      }),
    ).toBe("payee is one of Aldi, Lidl");
  });
});
