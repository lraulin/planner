import { describe, expect, it } from "vitest";
import { fingerprint, fingerprintAll } from "./fingerprint";
import type { ParsedTransaction } from "./types";

const ACCOUNT = "11111111-1111-1111-1111-111111111111";

function txn(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
  return {
    transactionDate: "2026-07-01",
    postedDate: "2026-07-02",
    description: "SBARRO",
    amountCents: -659,
    sourceCategory: "Dining",
    memo: "",
    balanceAfterCents: null,
    ...overrides,
  };
}

describe("fingerprintAll", () => {
  it("keeps two byte-identical rows apart instead of collapsing them", () => {
    // The real Capital One export contains this exact pair. A key over
    // date+description+amount alone would give both rows the same id, the second insert
    // would be swallowed by the unique index, and a transaction would silently not exist.
    const ids = fingerprintAll(ACCOUNT, [txn(), txn()]);
    expect(ids[0]).not.toBe(ids[1]);
    expect(new Set(ids).size).toBe(2);
  });

  it("regenerates the same ids for the same file, so a re-import skips everything", () => {
    const file = [txn(), txn(), txn({ description: "POTBELLY", amountCents: -2455 })];
    expect(fingerprintAll(ACCOUNT, file)).toEqual(fingerprintAll(ACCOUNT, file));
  });

  it("numbers repeats independently per identity", () => {
    const rows = [
      txn(),
      txn({ description: "POTBELLY" }),
      txn(),
      txn({ description: "POTBELLY" }),
    ];
    const ids = fingerprintAll(ACCOUNT, rows);
    // SBARRO#0, POTBELLY#0, SBARRO#1, POTBELLY#1 — four distinct ids.
    expect(new Set(ids).size).toBe(4);
    // The first SBARRO is ordinal 0 whether or not other merchants sit between them.
    expect(ids[0]).toBe(fingerprint(ACCOUNT, txn(), 0));
    expect(ids[2]).toBe(fingerprint(ACCOUNT, txn(), 1));
  });

  it("separates rows that differ only in one identity field", () => {
    const base = fingerprintAll(ACCOUNT, [txn()])[0];
    const cases = [
      txn({ transactionDate: "2026-07-02" }),
      txn({ postedDate: "2026-07-03" }),
      txn({ description: "SBARRO PIZZA" }),
      txn({ amountCents: -660 }),
    ];
    for (const variant of cases) {
      expect(fingerprintAll(ACCOUNT, [variant])[0]).not.toBe(base);
    }
  });

  it("scopes the identity to the account", () => {
    const other = "22222222-2222-2222-2222-222222222222";
    expect(fingerprintAll(ACCOUNT, [txn()])[0]).not.toBe(
      fingerprintAll(other, [txn()])[0],
    );
  });

  it("ignores the fields banks revise after the fact", () => {
    // Restated balance, recategorised merchant, memo edited at the bank — none of these
    // make an already-imported transaction new.
    const base = fingerprintAll(ACCOUNT, [txn()])[0];
    expect(fingerprintAll(ACCOUNT, [txn({ balanceAfterCents: 12345 })])[0]).toBe(base);
    expect(fingerprintAll(ACCOUNT, [txn({ sourceCategory: "Restaurants" })])[0]).toBe(
      base,
    );
    expect(fingerprintAll(ACCOUNT, [txn({ memo: "lunch with Dad" })])[0]).toBe(base);
  });

  it("does not confuse a missing posted date with an empty one", () => {
    expect(fingerprintAll(ACCOUNT, [txn({ postedDate: null })])[0]).toBe(
      fingerprintAll(ACCOUNT, [txn({ postedDate: null })])[0],
    );
    expect(fingerprintAll(ACCOUNT, [txn({ postedDate: null })])[0]).not.toBe(
      fingerprintAll(ACCOUNT, [txn()])[0],
    );
  });

  it("returns one id per row, in input order", () => {
    const rows = [txn(), txn({ description: "A" }), txn({ description: "B" })];
    expect(fingerprintAll(ACCOUNT, rows)).toHaveLength(3);
    expect(fingerprintAll(ACCOUNT, [])).toEqual([]);
  });
});
