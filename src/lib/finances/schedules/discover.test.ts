import { describe, expect, it } from "vitest";
import { getRank, matchSchedules, type DiscoverTx } from "./discover";

function tx(overrides: Partial<DiscoverTx> = {}): DiscoverTx {
  return {
    id: "t1",
    accountId: "acct",
    date: "2026-06-15",
    amountCents: -1599,
    merchant: "NETFLIX",
    scheduleId: null,
    transferGroupId: null,
    ...overrides,
  };
}

describe("getRank", () => {
  it("is 1 for an exact day and halves for each day off", () => {
    expect(getRank("2026-08-15", "2026-08-15")).toBe(1);
    expect(getRank("2026-08-15", "2026-08-16")).toBe(0.5);
    expect(getRank("2026-08-15", "2026-08-17")).toBeCloseTo(1 / 3);
  });
});

describe("matchSchedules", () => {
  it("proposes a merchant that hits every sampled occurrence within threshold", () => {
    const config = { frequency: "monthly" as const, start: "2026-04-15" };
    const proposals = matchSchedules(
      [
        { date: "2026-04-15", transactions: [tx({ id: "a", date: "2026-04-15" })] },
        { date: "2026-05-15", transactions: [tx({ id: "b", date: "2026-05-16" })] },
        { date: "2026-06-15", transactions: [tx({ id: "c", date: "2026-06-15" })] },
      ],
      config,
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.merchant).toBe("NETFLIX");
    expect(proposals[0]?.exactDate).toBe(false);
  });

  it("rejects a candidate that misses one occurrence", () => {
    const config = { frequency: "monthly" as const, start: "2026-04-15" };
    expect(
      matchSchedules(
        [
          { date: "2026-04-15", transactions: [tx({ id: "a", date: "2026-04-15" })] },
          {
            date: "2026-05-15",
            transactions: [tx({ id: "b", date: "2026-05-15", merchant: "HULU" })],
          },
          { date: "2026-06-15", transactions: [tx({ id: "c", date: "2026-06-15" })] },
        ],
        config,
      ),
    ).toEqual([]);
  });
});
