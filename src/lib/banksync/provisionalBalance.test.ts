import { describe, expect, it } from "vitest";
import {
  PROVISIONAL_BALANCE_HOLD_MS,
  shouldKeepProvisionalBalance,
} from "./provisionalBalance";

const advancedAt = new Date("2026-08-18T16:00:00Z");
const now = advancedAt.getTime() + 60_000;

describe("shouldKeepProvisionalBalance", () => {
  it("holds a recent provisional headline against a different SimpleFIN number", () => {
    expect(
      shouldKeepProvisionalBalance(
        { balanceCents: -43946, provisionalBalanceAsOf: advancedAt },
        { balanceCents: -5978 },
        now,
      ),
    ).toBe(true);
  });

  it("lets SimpleFIN through once it matches, or once the hold expires", () => {
    expect(
      shouldKeepProvisionalBalance(
        { balanceCents: -43946, provisionalBalanceAsOf: advancedAt },
        { balanceCents: -43946 },
        now,
      ),
    ).toBe(false);

    expect(
      shouldKeepProvisionalBalance(
        { balanceCents: -43946, provisionalBalanceAsOf: advancedAt },
        { balanceCents: -5978 },
        advancedAt.getTime() + PROVISIONAL_BALANCE_HOLD_MS,
      ),
    ).toBe(false);

    expect(
      shouldKeepProvisionalBalance(
        { balanceCents: -43946, provisionalBalanceAsOf: null },
        { balanceCents: -5978 },
        now,
      ),
    ).toBe(false);
  });
});
