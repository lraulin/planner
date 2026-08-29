import { describe, expect, it } from "vitest";
import {
  parseBankBrowserSnapshot,
  parseBankDate,
  PLANNER_BANK_SNAPSHOT_HEADER,
  type BankBrowserSnapshotV1,
} from "./bankSnapshot";

function text(body: BankBrowserSnapshotV1): string {
  return `${PLANNER_BANK_SNAPSHOT_HEADER}\n${JSON.stringify(body, null, 2)}\n`;
}

const complete = {
  currentCycle: true,
  posted: true,
  pending: true,
  filtered: false,
  searched: false,
} as const;

const chase: BankBrowserSnapshotV1 = {
  version: 1,
  source: "chase",
  capturedAt: "2026-08-29T12:42:00.000-04:00",
  accountLast4: "9910",
  balanceKind: "posted_only",
  currentBalance: "$370.80",
  completeness: complete,
  posted: [
    ["Aug 27, 2026", "CVS", "$22.84"],
    ["Aug 27, 2026", "AMAZON MKTPL", "$19.25"],
    ["Aug 26, 2026", "SIMPLISAFE", "$34.97"],
    ["Aug 26, 2026", "CHIPOTLE", "$16.91"],
    ["Aug 25, 2026", "GROCERY", "$45.00"],
    ["Aug 25, 2026", "CAFE", "$12.00"],
    ["Aug 24, 2026", "PARKING", "$20.00"],
    ["Aug 24, 2026", "PHARMACY", "$20.95"],
  ].map(([date, description, amount]) => ({
    transactionDate: date,
    postedDate: date,
    description,
    category: "Shopping",
    amount,
  })),
  pending: [
    {
      transactionDate: "Aug 29, 2026",
      postedDate: null,
      description: "SHEETZ",
      category: "",
      amount: "$35.85",
    },
    {
      transactionDate: "08/29/2026",
      postedDate: null,
      description: "AMAZON MKTPL",
      category: "",
      amount: "$48.86",
    },
  ],
};

describe("parseBankBrowserSnapshot", () => {
  it("parses the Chase regression fixture as a complete posted-plus-pending card view", () => {
    const result = parseBankBrowserSnapshot(text(chase));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.currentBalanceCents).toBe(-37080);
    expect(result.snapshot.posted).toHaveLength(8);
    expect(result.snapshot.posted.reduce((sum, row) => sum + row.amountCents, 0)).toBe(
      -19192,
    );
    expect(result.snapshot.pending.reduce((sum, row) => sum + row.amountCents, 0)).toBe(
      -8471,
    );
    expect(result.snapshot.posted[0].postedDate).toBe("2026-08-27");
  });

  it("keeps Capital One purchase/post dates and negates a displayed negative payment", () => {
    const result = parseBankBrowserSnapshot(
      text({
        ...chase,
        source: "capitalone",
        accountLast4: "3448",
        currentBalance: "$43.77",
        posted: [
          {
            transactionDate: "Wed, Aug 26, 2026",
            postedDate: "Thu, Aug 27, 2026",
            description: "CAPITAL ONE MOBILE PYMT",
            category: "Payment",
            amount: "-$657.62",
          },
        ],
        pending: [
          {
            transactionDate: "Fri, Aug 28, 2026",
            postedDate: null,
            description: "CAFE",
            category: "Dining",
            amount: "$12.71",
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.currentBalanceCents).toBe(-4377);
    expect(result.snapshot.posted[0]).toMatchObject({
      transactionDate: "2026-08-26",
      postedDate: "2026-08-27",
      amountCents: 65762,
    });
    expect(result.snapshot.pending[0].amountCents).toBe(-1271);
  });

  it("accepts complete empty posted and pending sections", () => {
    const result = parseBankBrowserSnapshot(
      text({ ...chase, currentBalance: "$0.00", posted: [], pending: [] }),
    );
    expect(result.ok).toBe(true);
  });

  it("occurrence-counts equal duplicate charges", () => {
    const duplicate = chase.posted[0];
    const result = parseBankBrowserSnapshot(
      text({ ...chase, posted: [duplicate, duplicate] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.posted[0].externalId).not.toBe(
      result.snapshot.posted[1].externalId,
    );
  });

  it("tells an old pending-only capture to update the userscript", () => {
    const result = parseBankBrowserSnapshot("# planner-pending v1\n# account=9910\n");
    expect(result).toEqual({
      ok: false,
      error:
        "That paste came from the old pending-only userscript. Update the Chase and Capital One userscripts, copy a complete bank snapshot, and paste again.",
    });
  });

  it.each([
    [{ ...complete, filtered: true }, "filters and search"],
    [{ ...complete, searched: true }, "filters and search"],
    [{ ...complete, posted: false }, "complete current-cycle"],
    [{ ...complete, pending: false }, "complete current-cycle"],
  ])("refuses incomplete page state %#", (completeness, message) => {
    const result = parseBankBrowserSnapshot(
      text({ ...chase, completeness } as BankBrowserSnapshotV1),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(message);
  });

  it("refuses unrelated fields so exact evidence cannot retain page secrets", () => {
    const body = { ...chase, cookie: "secret" };
    const result = parseBankBrowserSnapshot(
      `${PLANNER_BANK_SNAPSHOT_HEADER}\n${JSON.stringify(body)}`,
    );
    expect(result.ok).toBe(false);
  });

  it("refuses unrelated completeness evidence too", () => {
    const body = {
      ...chase,
      completeness: { ...complete, pageHtml: "secret" },
    };
    const result = parseBankBrowserSnapshot(
      `${PLANNER_BANK_SNAPSHOT_HEADER}\n${JSON.stringify(body)}`,
    );
    expect(result.ok).toBe(false);
  });
});

describe("parseBankDate", () => {
  it.each([
    ["2026-08-29", "2026-08-29"],
    ["Sat, Aug 29, 2026", "2026-08-29"],
    ["Aug 29, 2026", "2026-08-29"],
    ["08/29/2026", "2026-08-29"],
    ["Feb 30, 2026", null],
  ])("parses %s without turning a bank day into an instant", (raw, expected) => {
    expect(parseBankDate(raw)).toBe(expected);
  });
});
