import { describe, expect, it } from "vitest";
import { candidateReading } from "./mismatchCandidate";

const START = "2026-09-01";

describe("candidateReading", () => {
  // The bank is $19.04 lower than the register expects (mismatch −1904).
  it("names a register row since start that the bank does not count", () => {
    // A +$19.04 refund the bank never made would leave the register $19.04 high.
    expect(
      candidateReading(-1_904, START, {
        transactionDate: "2026-11-20",
        amountCents: 1_904,
      }),
    ).toBe("extra-since-start");
  });

  it("names a duplicate charge when the bank is higher than the register", () => {
    // A charge entered twice leaves the register $19.04 low, so the bank reads +1904 over it.
    expect(
      candidateReading(1_904, START, {
        transactionDate: "2026-11-20",
        amountCents: -1_904,
      }),
    ).toBe("extra-since-start");
  });

  it("names a row dated before start with the gap's own sign", () => {
    // In the balance, but walked out of "rows since start" by its date.
    expect(
      candidateReading(-1_904, START, {
        transactionDate: "2026-08-31",
        amountCents: -1_904,
      }),
    ).toBe("dated-before-start");
  });

  it("does not offer the copy of what is missing as its cause", () => {
    // The bank has a −$19.04 charge the register lacks; a −$19.04 row already in the
    // register since start is the sibling, not the culprit.
    expect(
      candidateReading(-1_904, START, {
        transactionDate: "2026-11-20",
        amountCents: -1_904,
      }),
    ).toBeNull();
    expect(
      candidateReading(-1_904, START, {
        transactionDate: "2026-08-31",
        amountCents: 1_904,
      }),
    ).toBeNull();
  });

  it("treats the first of the start month as since start", () => {
    expect(
      candidateReading(-500, START, { transactionDate: START, amountCents: 500 }),
    ).toBe("extra-since-start");
  });

  it("finds nothing for an account that matches", () => {
    expect(
      candidateReading(0, START, { transactionDate: START, amountCents: 0 }),
    ).toBeNull();
  });
});
