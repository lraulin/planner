import { describe, expect, it } from "vitest";

import {
  assertCents,
  parseTemplates,
  parseTemplatesOrThrow,
  summarize,
  type Template,
} from "./types";

const simple: Template = {
  id: "t1",
  directive: "template",
  type: "simple",
  priority: 0,
  monthlyCents: 5000,
};

describe("parseTemplates", () => {
  it("round-trips a valid list", () => {
    expect(parseTemplates([simple])).toEqual([simple]);
  });

  it("returns null for garbage rather than passing it to the math", () => {
    expect(parseTemplates("nope")).toBeNull();
    expect(parseTemplates([{ type: "simple" }])).toBeNull();
    expect(parseTemplates([{ ...simple, monthlyCents: 12.5 }])).toBeNull();
    expect(
      parseTemplates([
        { ...simple, id: "t1" },
        { ...simple, id: "t1" },
      ]),
    ).toBeNull();
  });

  it("rejects a simple line with neither monthly nor limit", () => {
    expect(
      parseTemplates([
        { id: "t1", directive: "template", type: "simple", priority: 0 },
      ]),
    ).toBeNull();
  });

  it("throws on write of invalid JSONB", () => {
    expect(() => parseTemplatesOrThrow({ not: "a list" })).toThrow(
      "Those templates are not valid.",
    );
  });
});

describe("assertCents", () => {
  it("throws on a non-integer", () => {
    expect(() => assertCents(1.5, "amount")).toThrow(
      "amount must be integer cents, got 1.5",
    );
  });
});

describe("summarize", () => {
  it("names each type in one line", () => {
    expect(summarize(simple)).toBe("$50.00/mo");
    expect(
      summarize({
        id: "t2",
        directive: "template",
        type: "simple",
        priority: 0,
        limit: { amountCents: 15000, hold: false },
      }),
    ).toBe("up to $150.00");
    expect(
      summarize({
        id: "t4",
        directive: "template",
        type: "by",
        priority: 0,
        amountCents: 1_000_000,
        month: "2026-12",
      }),
    ).toBe("$10,000.00 by December 2026");
    expect(
      summarize({
        id: "t5",
        directive: "template",
        type: "remainder",
        priority: null,
        weight: 1,
      }),
    ).toBe("remainder");
  });
});
