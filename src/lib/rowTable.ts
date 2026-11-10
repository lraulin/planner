/**
 * Flat rows as they cross from the server to the browser: column by column, names once,
 * and a column whose values repeat written as a dictionary plus an index per row.
 *
 * The Insights page ships every classified transaction because its job is to re-slice the
 * whole history in the browser. As keyed objects that was 7,459 rows and 4.7 MB (measured in
 * `agent-os/specs/2026-10-13-1147-finance-narrow-ledger-reads/`), and almost none of it was
 * data: the field names repeat on every row, and so do the four accounts, the few hundred
 * payees and the few dozen envelopes, each as a 36-character id beside its name.
 *
 * `src/lib/tree/wire.ts` packs the outline for the same reason but differently — its rows
 * are mostly defaults, so it omits them; these rows are mostly repeats, so this names each
 * distinct value once. The two are not merged because neither encoding helps the other's
 * data.
 *
 * Pure, and lossless for the values JSON carries: `unpackRows(packRows(rows, keys))`
 * deep-equals the rows projected onto `keys`.
 */

export type Scalar = string | number | boolean | null;

/** Dense (`[v0, v1, …]`), or a dictionary `d` with one index into it per row, `x`. */
export type TableColumn = Scalar[] | { d: Scalar[]; x: number[] };

export type RowTable<K extends string = string> = {
  /** Row count — what every column is read against. */
  n: number;
  /** Column names, written once; `v[j]` holds the values of column `c[j]`. */
  c: K[];
  v: TableColumn[];
};

/**
 * A dictionary pays once its values repeat enough to cover the index it adds per row. A
 * quarter is conservative: at that ratio the average value is written a fourth as often,
 * and an index is two to four characters.
 */
const DICTIONARY_MAX_DISTINCT_RATIO = 0.25;

export function packRows<K extends string>(
  rows: readonly Readonly<Record<K, Scalar>>[],
  keys: readonly K[],
): RowTable<K> {
  const n = rows.length;
  const v = keys.map((key): TableColumn => {
    const indexOf = new Map<Scalar, number>();
    const d: Scalar[] = [];
    const x: number[] = [];
    for (const row of rows) {
      const value = row[key];
      let index = indexOf.get(value);
      if (index === undefined) {
        index = d.length;
        indexOf.set(value, index);
        d.push(value);
      }
      x.push(index);
    }
    return d.length <= n * DICTIONARY_MAX_DISTINCT_RATIO
      ? { d, x }
      : x.map((index) => d[index]);
  });
  return { n, c: [...keys], v };
}

/** Rebuild the rows: exactly the columns the table carried, in its order. */
export function unpackRows<K extends string>(table: RowTable<K>): Record<K, Scalar>[] {
  const rows: Record<string, Scalar>[] = [];
  for (let row = 0; row < table.n; row++) rows.push({});
  table.c.forEach((name, j) => {
    const stored = table.v[j];
    for (let row = 0; row < table.n; row++) {
      rows[row][name] = Array.isArray(stored) ? stored[row] : stored.d[stored.x[row]];
    }
  });
  return rows;
}
