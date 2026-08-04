import { describe, expect, it } from "vitest";
import {
  formatCompactDate,
  formatEffort,
  formatMoney,
  formatPriority,
  parseEffort,
  parsePriority,
} from "./format";

describe("formatCompactDate", () => {
  it("formats a calendar day without a year", () => {
    expect(formatCompactDate("2026-09-12")).toBe("12 Sep");
    expect(formatCompactDate("2026-01-01")).toBe("1 Jan");
    expect(formatCompactDate("2026-12-31")).toBe("31 Dec");
  });

  it("adds a two-digit year only when it is not the current one", () => {
    expect(formatCompactDate("2026-09-12", 2026)).toBe("12 Sep");
    expect(formatCompactDate("2027-09-12", 2026)).toBe("12 Sep 27");
    expect(formatCompactDate("2025-03-04", 2026)).toBe("4 Mar 25");
  });

  it("reads the string as written, with no timezone shift", () => {
    // The bug this guards: parsing into a Date and formatting locally turns a UTC midnight
    // deadline into the previous day for anyone west of Greenwich.
    expect(formatCompactDate("2026-01-01")).toBe("1 Jan");
    expect(formatCompactDate("2026-06-30")).toBe("30 Jun");
  });

  it("returns empty for anything it cannot read", () => {
    expect(formatCompactDate(null)).toBe("");
    expect(formatCompactDate(undefined)).toBe("");
    expect(formatCompactDate("")).toBe("");
    expect(formatCompactDate("not-a-date")).toBe("");
    expect(formatCompactDate("2026-09-12T00:00:00Z")).toBe("");
    expect(formatCompactDate("2026-13-01")).toBe("");
  });
});

describe("formatEffort", () => {
  it("formats the way Achieve does", () => {
    expect(formatEffort(45)).toBe("45 min");
    expect(formatEffort(120)).toBe("2 h");
    expect(formatEffort(225)).toBe("3:45 h");
    expect(formatEffort(60)).toBe("1 h");
    expect(formatEffort(1440)).toBe("3 d");
    expect(formatEffort(480)).toBe("1 d");
  });

  it("renders nothing for no estimate", () => {
    expect(formatEffort(null)).toBe("");
    expect(formatEffort(0)).toBe("");
  });
});

describe("formatMoney", () => {
  it("renders modeled costs as stable dollar amounts", () => {
    expect(formatMoney(12)).toBe("$12.00");
    expect(formatMoney(1234.5)).toBe("$1,234.50");
    expect(formatMoney(null)).toBe("");
  });
});

describe("parseEffort", () => {
  it("reads back everything formatEffort emits", () => {
    for (const minutes of [15, 45, 60, 90, 120, 225, 480, 960, 1440]) {
      expect(parseEffort(formatEffort(minutes))).toBe(minutes);
    }
  });

  it("accepts the shorthand someone would type", () => {
    expect(parseEffort("45")).toBe(45);
    expect(parseEffort("45m")).toBe(45);
    expect(parseEffort("45 min")).toBe(45);
    expect(parseEffort("2h")).toBe(120);
    expect(parseEffort("2 hr")).toBe(120);
    expect(parseEffort("3:45")).toBe(225);
    expect(parseEffort("1d")).toBe(480);
    expect(parseEffort("2 days")).toBe(960);
  });

  it("counts a day as eight hours, not twenty-four", () => {
    expect(parseEffort("1 d")).toBe(480);
  });

  it("accepts fractions of an hour", () => {
    expect(parseEffort("1.5h")).toBe(90);
    expect(parseEffort("0.5 d")).toBe(240);
  });

  it("ignores surrounding whitespace and case", () => {
    expect(parseEffort("  2H  ")).toBe(120);
    expect(parseEffort("45 MIN")).toBe(45);
  });

  it("clears the value on empty input", () => {
    expect(parseEffort("")).toBeNull();
    expect(parseEffort("   ")).toBeNull();
  });

  it("reports unrecognised input rather than clearing it", () => {
    expect(parseEffort("soon")).toBeUndefined();
    expect(parseEffort("2 weeks")).toBeUndefined();
    expect(parseEffort("-3h")).toBeUndefined();
    expect(parseEffort("3:75")).toBeUndefined();
    expect(parseEffort("h")).toBeUndefined();
  });
});

describe("formatPriority", () => {
  it("combines letter and rank", () => {
    expect(formatPriority("A", 1)).toBe("A1");
    expect(formatPriority("B", null)).toBe("B");
    expect(formatPriority(null, null)).toBe("");
  });
});

describe("parsePriority", () => {
  it("reads back everything formatPriority emits", () => {
    for (const [letter, rank] of [
      ["A", 1],
      ["B", null],
      ["C", 12],
      ["D", null],
    ] as const) {
      expect(parsePriority(formatPriority(letter, rank))).toEqual({ letter, rank });
    }
  });

  it("accepts lowercase and whitespace", () => {
    expect(parsePriority(" a1 ")).toEqual({ letter: "A", rank: 1 });
  });

  it("maps Achieve's aa shortcut to A1", () => {
    // Release log 1.1.10: "Use 'aa' as a shortcut for typing priority a1".
    expect(parsePriority("aa")).toEqual({ letter: "A", rank: 1 });
    expect(parsePriority("AA")).toEqual({ letter: "A", rank: 1 });
    expect(parsePriority(" aa ")).toEqual({ letter: "A", rank: 1 });
    // Not generalized — only aa is documented.
    expect(parsePriority("bb")).toBeUndefined();
  });

  it("clears the priority on empty input", () => {
    expect(parsePriority("")).toEqual({ letter: null, rank: null });
  });

  it("reports unrecognised input rather than clearing it", () => {
    expect(parsePriority("E")).toBeUndefined();
    expect(parsePriority("A123")).toBeUndefined();
    expect(parsePriority("1A")).toBeUndefined();
  });
});
