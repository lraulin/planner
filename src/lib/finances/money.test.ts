import { describe, expect, it } from "vitest";
import {
  centsToNumericString,
  formatUsd,
  formatUsdCompact,
  formatUsdWhole,
  numericStringToCents,
  parseAmountCents,
  sumCents,
} from "./money";

describe("parseAmountCents", () => {
  it("reads the amount shapes these four exports actually contain", () => {
    expect(parseAmountCents("-10.59")).toBe(-1059);
    expect(parseAmountCents("481.20")).toBe(48120);
    expect(parseAmountCents("1429.66")).toBe(142966);
    // 360 Checking writes whole amounts without decimals.
    expect(parseAmountCents("200")).toBe(20000);
    // ...and trims trailing zeroes on tenths.
    expect(parseAmountCents("0.1")).toBe(10);
  });

  it("accepts separators, symbols and accounting negatives", () => {
    expect(parseAmountCents("$1,429.66")).toBe(142966);
    expect(parseAmountCents("+5.00")).toBe(500);
    expect(parseAmountCents("(12.34)")).toBe(-1234);
    expect(parseAmountCents("  7.50  ")).toBe(750);
  });

  it("returns null for blank and for junk, so the caller can tell them apart from zero", () => {
    // Capital One leaves one of Debit/Credit empty on every single row, so blank is
    // normal input and must not read as $0.00.
    expect(parseAmountCents("")).toBeNull();
    expect(parseAmountCents("   ")).toBeNull();
    expect(parseAmountCents("pending")).toBeNull();
    expect(parseAmountCents("1.2.3")).toBeNull();
    expect(parseAmountCents("--5")).toBeNull();
    expect(parseAmountCents("0")).toBe(0);
  });

  it("keeps sub-cent input from silently truncating downward", () => {
    expect(parseAmountCents("0.595")).toBe(60);
    expect(parseAmountCents("0.594")).toBe(59);
  });
});

describe("centsToNumericString", () => {
  it("pads to two decimals and keeps the sign outside", () => {
    expect(centsToNumericString(-1059)).toBe("-10.59");
    expect(centsToNumericString(48120)).toBe("481.20");
    expect(centsToNumericString(10)).toBe("0.10");
    expect(centsToNumericString(0)).toBe("0.00");
    expect(centsToNumericString(-5)).toBe("-0.05");
  });

  it("round-trips through parseAmountCents", () => {
    for (const cents of [-142966, -1059, -5, 0, 10, 48120, 999999999]) {
      expect(parseAmountCents(centsToNumericString(cents))).toBe(cents);
    }
  });
});

describe("numericStringToCents", () => {
  it("reads what a numeric column hands back, including null", () => {
    // Drizzle returns numeric(14,2) as a string, always with both decimals.
    expect(numericStringToCents("-10.59")).toBe(-1059);
    expect(numericStringToCents("0.00")).toBe(0);
    expect(numericStringToCents(null)).toBeNull();
  });
});

describe("formatUsd", () => {
  it("puts the minus outside the dollar sign", () => {
    // formatMoney in src/lib/tree/format.ts renders this as "$-10.59"; a register is half
    // negative rows, so the sign has to lead.
    expect(formatUsd(-1059)).toBe("-$10.59");
    expect(formatUsd(48120)).toBe("$481.20");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(-142966)).toBe("-$1,429.66");
  });

  it("renders nothing for a missing amount", () => {
    expect(formatUsd(null)).toBe("");
  });
});

describe("formatUsdWhole", () => {
  it("rounds to dollars, because a range to the cent argues with itself", () => {
    expect(formatUsdWhole(15000)).toBe("$150");
    expect(formatUsdWhole(53995)).toBe("$540");
    expect(formatUsdWhole(-33583)).toBe("-$336");
  });
});

describe("sumCents", () => {
  it("totals without float drift", () => {
    // The same addition in dollars gives 0.30000000000000004.
    expect(sumCents([10, 20])).toBe(30);
    const pennies = Array.from({ length: 1000 }, () => 1);
    expect(sumCents(pennies)).toBe(1000);
    expect(sumCents([])).toBe(0);
    expect(sumCents([-1059, 48120, -142966])).toBe(-95905);
  });
});

describe("formatUsdCompact", () => {
  it("drops the cents an axis label cannot use", () => {
    expect(formatUsdCompact(45012)).toBe("$450");
    expect(formatUsdCompact(0)).toBe("$0");
  });

  it("abbreviates thousands, losing the decimal once it stops mattering", () => {
    expect(formatUsdCompact(210000)).toBe("$2.1k");
    expect(formatUsdCompact(1234567)).toBe("$12k");
  });

  it("keeps the sign outside the symbol, like the register does", () => {
    expect(formatUsdCompact(-210000)).toBe("-$2.1k");
  });
});
