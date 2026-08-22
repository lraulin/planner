import { describe, expect, it } from "vitest";
import { assignmentBreakdown } from "./assignment";
import type { AvailableToSpend, SetAside } from "./available";

function available(over: Partial<AvailableToSpend> = {}): AvailableToSpend {
  const spendableCents = over.spendableCents ?? 0;
  const pendingCents = over.pendingCents ?? 0;
  const cardDebtCents = over.cardDebtCents ?? 0;
  const setAsideCents = over.setAsideCents ?? 0;
  const recurringSpendCents = over.recurringSpendCents ?? 0;
  const totalCents =
    over.totalCents ??
    spendableCents + pendingCents + cardDebtCents - setAsideCents - recurringSpendCents;
  return {
    totalCents,
    spendableCents,
    pendingCents,
    cardDebtCents,
    setAsideCents,
    recurringSpendCents,
    terms: [
      { label: "Checking & cash", cents: spendableCents },
      { label: "Pending", cents: pendingCents },
      { label: "Card balances", cents: cardDebtCents },
      { label: "Set aside for bills", cents: -setAsideCents },
      { label: "Recurring spend", cents: -recurringSpendCents },
    ],
  };
}

function aside(name: string, heldCents: number): SetAside {
  return {
    name,
    expectedCents: heldCents,
    perPaycheckCents: Math.round(heldCents / 2),
    heldCents,
    fullyFunded: true,
    periodStartKey: "2026-07-31",
    nextDueKey: "2026-08-31",
  };
}

describe("assignmentBreakdown", () => {
  it("overflows checking by the shortfall when available is negative", () => {
    // The live 2026-08-21 reading: leftover after commitments was ~$700/period, available
    // was -$1,125, because rent's full $2,100 was reserved and cards were unpaid.
    const rent = aside("Rent", 210_000);
    const gas = aside("Gas (Taylor)", 45_694);
    const other = aside("Electricity (Smeco)", 17_794);
    const setAsides = [rent, gas, other];
    const setAsideCents = setAsides.reduce(
      (total, entry) => total + entry.heldCents,
      0,
    );
    const result = assignmentBreakdown(
      available({
        spendableCents: 335_503,
        pendingCents: -40_073,
        cardDebtCents: -61_834,
        setAsideCents,
        recurringSpendCents: 29_820,
      }),
      setAsides,
    );

    expect(result.leftoverCents).toBe(0);
    expect(result.shortfallCents).toBe(result.claimCents - result.checkingCents);
    expect(result.scaleCents).toBe(result.claimCents);
    expect(result.segments.find((segment) => segment.label === "Rent")?.cents).toBe(
      210_000,
    );
    expect(
      result.segments.find((segment) => segment.label === "Other bills")?.cents,
    ).toBe(setAsideCents - 210_000);
    expect(result.segments.find((segment) => segment.role === "shortfall")?.cents).toBe(
      result.shortfallCents,
    );
  });

  it("fills leftover inside checking when available is positive", () => {
    const result = assignmentBreakdown(
      available({
        spendableCents: 100_000,
        setAsideCents: 40_000,
        totalCents: 60_000,
      }),
    );

    expect(result.leftoverCents).toBe(60_000);
    expect(result.shortfallCents).toBe(0);
    expect(result.scaleCents).toBe(100_000);
    expect(result.segments.find((segment) => segment.role === "leftover")?.cents).toBe(
      60_000,
    );
  });

  it("keeps bills as one segment when no single hold is 40% of the pile", () => {
    const result = assignmentBreakdown(
      available({ spendableCents: 100_000, setAsideCents: 10_000 }),
      [aside("Claude", 1060), aside("Spotify", 795), aside("YouTube", 742)],
    );

    expect(result.segments.map((segment) => segment.label)).toContain(
      "Set aside for bills",
    );
    expect(result.segments.map((segment) => segment.label)).not.toContain("Claude");
  });

  it("omits zero claim terms so a bar of empty segments cannot appear", () => {
    const result = assignmentBreakdown(available({ spendableCents: 50_000 }));
    expect(result.segments.map((segment) => segment.role)).toEqual([
      "source",
      "leftover",
    ]);
  });
});
