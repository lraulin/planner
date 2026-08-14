import { describe, expect, it } from "vitest";
import {
  dateKeyOrNull,
  moneyOrNull,
  patchText,
  requireDateKey,
  requireOrderedDates,
} from "./fields";

describe("dateKeyOrNull", () => {
  it("keeps a well-formed key", () => {
    expect(dateKeyOrNull("2026-08-13", "Start date")).toBe("2026-08-13");
  });

  it("treats blank and absent alike as cleared", () => {
    expect(dateKeyOrNull("", "Start date")).toBeNull();
    expect(dateKeyOrNull("   ", "Start date")).toBeNull();
    expect(dateKeyOrNull(null, "Start date")).toBeNull();
    expect(dateKeyOrNull(undefined, "Start date")).toBeNull();
  });

  it("rejects anything that is not a date key", () => {
    expect(() => dateKeyOrNull("8/13/2026", "Start date")).toThrow(
      "Start date must be a date.",
    );
    expect(() => dateKeyOrNull("2026-8-13", "Start date")).toThrow();
  });
});

describe("requireDateKey", () => {
  it("rejects a missing date with the field's own name", () => {
    expect(() => requireDateKey("", "Date")).toThrow("Date is required.");
  });
});

describe("requireOrderedDates", () => {
  const labels = { start: "Start date", end: "End date" };

  it("accepts an open-ended span", () => {
    expect(() => requireOrderedDates("2020-01-01", null, labels)).not.toThrow();
    expect(() => requireOrderedDates(null, "2020-01-01", labels)).not.toThrow();
    expect(() => requireOrderedDates(null, null, labels)).not.toThrow();
  });

  it("accepts a same-day span", () => {
    expect(() => requireOrderedDates("2020-01-01", "2020-01-01", labels)).not.toThrow();
  });

  it("rejects an inversion in our words, not Postgres's", () => {
    // The CHECK constraint would also catch this, but its message is written by the database
    // and security.md forbids showing one of those to the user.
    expect(() => requireOrderedDates("2020-06-01", "2020-01-01", labels)).toThrow(
      "End date cannot be before start date.",
    );
  });
});

describe("moneyOrNull", () => {
  it("keeps the amount as the string numeric round-trips exactly", () => {
    // Never parsed to a float on the way through — that is how cents go missing.
    expect(moneyOrNull("1200", "Rent")).toBe("1200");
    expect(moneyOrNull("1234.56", "Rent")).toBe("1234.56");
  });

  it("accepts what a person types into a money field", () => {
    expect(moneyOrNull("$1,850.00", "Rent")).toBe("1850.00");
    expect(moneyOrNull("  1850 ", "Rent")).toBe("1850");
  });

  it("keeps absent and blank alike as cleared", () => {
    expect(moneyOrNull(null, "Rent")).toBeNull();
    expect(moneyOrNull(undefined, "Rent")).toBeNull();
    expect(moneyOrNull("", "Rent")).toBeNull();
  });

  it("rejects a negative amount, a third decimal, and text", () => {
    expect(() => moneyOrNull("-1", "Rent")).toThrow(
      "Rent must be a non-negative amount.",
    );
    expect(() => moneyOrNull("18.505", "Rent")).toThrow();
    expect(() => moneyOrNull("a lot", "Rent")).toThrow();
  });
});

describe("patchText", () => {
  it("copies only the fields that were supplied", () => {
    // The case this exists for: saving one drawer tab must not blank the fields on the others.
    const patch: Record<string, unknown> = {};
    patchText(patch, { employer: "Acme", jobTitle: undefined }, [
      "employer",
      "jobTitle",
      "duties",
    ] as const);
    expect(patch).toEqual({ employer: "Acme" });
  });

  it("treats an explicit empty string as a value, not as absent", () => {
    const patch: Record<string, unknown> = {};
    patchText(patch, { employer: "" }, ["employer"] as const);
    expect(patch).toEqual({ employer: "" });
  });
});
