import { describe, expect, it } from "vitest";
import { packRows, unpackRows } from "./rowTable";

type Row = {
  id: string;
  account: string;
  cents: number;
  payee: string | null;
  pending: boolean;
};

const KEYS = ["id", "account", "cents", "payee", "pending"] as const;

function sample(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `row-${i}`,
    account: i % 2 === 0 ? "Checking" : "Card",
    cents: i * 7 - 100,
    payee: i % 5 === 0 ? null : `Payee ${i % 3}`,
    pending: i % 4 === 0,
  }));
}

describe("packRows / unpackRows", () => {
  it("round-trips every value, including null, false, zero and the empty string", () => {
    const rows: Row[] = [
      ...sample(40),
      { id: "", account: "", cents: 0, payee: null, pending: false },
    ];
    expect(unpackRows(packRows(rows, KEYS))).toEqual(rows);
  });

  it("writes a repeating column once per distinct value and a unique one densely", () => {
    const table = packRows(sample(40), KEYS);
    const account = table.v[table.c.indexOf("account")];
    const id = table.v[table.c.indexOf("id")];
    expect(account).toEqual({
      d: ["Checking", "Card"],
      x: Array.from({ length: 40 }, (_, i) => i % 2),
    });
    expect(Array.isArray(id)).toBe(true);
  });

  it("keeps null and the string 'null' apart in a dictionary", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      value: i % 2 === 0 ? null : "null",
    }));
    expect(unpackRows(packRows(rows, ["value"]))).toEqual(rows);
  });

  it("carries only the named columns, and survives no rows at all", () => {
    expect(unpackRows(packRows(sample(8), ["id", "cents"]))).toEqual(
      sample(8).map(({ id, cents }) => ({ id, cents })),
    );
    expect(unpackRows(packRows([], KEYS))).toEqual([]);
  });

  it("is several times smaller than the keyed rows it replaces", () => {
    const rows = sample(2000);
    const packed = JSON.stringify(packRows(rows, KEYS)).length;
    expect(packed * 2).toBeLessThan(JSON.stringify(rows).length);
  });
});
