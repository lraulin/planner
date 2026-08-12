import { describe, expect, it } from "vitest";
import { selectNewTransactions } from "./matchExisting";
import type { ParsedTransaction } from "./types";

function row(
  date: string,
  description: string,
  amountCents: number,
): ParsedTransaction {
  return {
    transactionDate: date,
    postedDate: null,
    description,
    amountCents,
    sourceCategory: "",
    memo: "",
    balanceAfterCents: null,
  };
}

describe("selectNewTransactions", () => {
  it("skips a statement row the CSV already stored (posted date ignored)", () => {
    const existing = [
      {
        transactionDate: "2026-07-15",
        amountCents: -1795,
        description: "AMAZON MKTPL*0W88L1N43",
      },
    ];
    const incoming = [row("2026-07-15", "AMAZON MKTPL*0W88L1N43", -1795)];
    expect(selectNewTransactions(existing, incoming)).toEqual({
      keep: [],
      skipCount: 1,
    });
  });

  it("keeps a same-day same-amount row with a different merchant token", () => {
    const existing = [
      {
        transactionDate: "2026-07-15",
        amountCents: -1795,
        description: "AMAZON MKTPL*0W88L1N43",
      },
    ];
    const incoming = [row("2026-07-15", "AMAZON MKTPL*HJ06X8Q13", -1795)];
    expect(selectNewTransactions(existing, incoming).keep).toHaveLength(1);
  });

  it("keeps both identical rows when none exist yet, and only the extra on re-import", () => {
    const twin = row("2026-07-01", "SBARRO", -659);
    const first = selectNewTransactions([], [twin, twin]);
    expect(first.keep).toHaveLength(2);
    expect(first.skipCount).toBe(0);

    const existing = [
      { transactionDate: "2026-07-01", amountCents: -659, description: "SBARRO" },
    ];
    const second = selectNewTransactions(existing, [twin, twin]);
    expect(second.keep).toHaveLength(1);
    expect(second.skipCount).toBe(1);
  });
});
