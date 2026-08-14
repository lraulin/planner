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

  it("skips a statement mash whose leftover is a domain or city the CSV does not have", () => {
    const existing = [
      {
        transactionDate: "2026-01-16",
        amountCents: -6360,
        description: "CURSOR, AI POWERED IDE",
      },
      {
        transactionDate: "2026-07-19",
        amountCents: -6000,
        description: "APORIA",
      },
      {
        transactionDate: "2026-02-05",
        amountCents: -746,
        description: "WAWA 592",
      },
      {
        transactionDate: "2026-01-14",
        amountCents: -994,
        description: "PAYPAL *PADDLE.NET",
      },
      {
        transactionDate: "2026-01-01",
        amountCents: -2597,
        description: "PANDA EXPRESS # 3006 P",
      },
      {
        transactionDate: "2026-04-13",
        amountCents: -953,
        description: "ONEBOOKSHEL",
      },
    ];
    const incoming = [
      row("2026-01-16", "CURSOR, AI POWERED IDECURSOR.COM", -6360),
      row("2026-07-19", "APORIA ESSEX", -6000),
      row("2026-02-05", "WAWA 592CALIFORNIAMD", -746),
      row("2026-01-14", "PAYPAL *PADDLE.NET35314369001", -994),
      row("2026-01-01", "PANDA EXPRESS # 3006", -2597),
      row("2026-04-13", "ONEBOOKSHEL7064490777NV", -953),
    ];
    expect(selectNewTransactions(existing, incoming)).toEqual({
      keep: [],
      skipCount: 6,
    });
  });

  it("treats case and extra spaces as the same merchant", () => {
    const existing = [
      {
        transactionDate: "2026-07-09",
        amountCents: -1059,
        description: "WL *Steam Purchase",
      },
      {
        transactionDate: "2026-06-27",
        amountCents: -438,
        description: "AGENT FEE   8900933845227",
      },
    ];
    const incoming = [
      row("2026-07-09", "WL *STEAM PURCHASE", -1059),
      row("2026-06-27", "AGENT FEE 8900933845227", -438),
    ];
    expect(selectNewTransactions(existing, incoming)).toEqual({
      keep: [],
      skipCount: 2,
    });
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
