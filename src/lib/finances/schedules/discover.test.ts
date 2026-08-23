import { describe, expect, it } from "vitest";
import { getRank, matchSchedules, type DiscoverTx } from "./discover";

const PAYEE_A = "11111111-1111-4111-8111-111111111111";
const PAYEE_B = "22222222-2222-4222-8222-222222222222";

function tx(overrides: Partial<DiscoverTx> = {}): DiscoverTx {
  return {
    id: "t1",
    accountId: "acct",
    date: "2026-06-15",
    amountCents: -1599,
    payeeId: PAYEE_A,
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
        {
          date: "2026-05-15",
          transactions: [tx({ id: "b", date: "2026-05-16", merchant: "Netflix.com" })],
        },
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
            transactions: [
              tx({
                id: "b",
                date: "2026-05-15",
                payeeId: PAYEE_B,
                merchant: "Hulu",
              }),
            ],
          },
          { date: "2026-06-15", transactions: [tx({ id: "c", date: "2026-06-15" })] },
        ],
        config,
      ),
    ).toEqual([]);
  });
});
