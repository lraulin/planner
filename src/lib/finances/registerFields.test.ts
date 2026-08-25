import { describe, expect, it } from "vitest";
import { registerFields } from "./registerFields";

describe("registerFields — amount filter kind", () => {
  it("filters Amount and Balance as numbers, not formatted text", () => {
    // A text kind offers contains / starts-with on "$100.00", so "greater than 50"
    // is not even an operator. Number is the kind Custom criteria uses for > / <.
    expect(registerFields.amount.filterKind).toBe("number");
    expect(registerFields.balance.filterKind).toBe("number");
  });
});
