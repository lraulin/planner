import type { Shelf } from "./shelving";
import type { OutlineNode } from "./types";

/**
 * The outline as it crosses from the server to the browser.
 *
 * `OutlineNode` has 63 fields, and serialised as keyed objects an empty task is ~1.3 kB, of
 * which ~70% is the field names repeated on every row (measured in
 * `agent-os/specs/2026-10-13-1158-outline-payload-packing/`). A page of 600 nodes was
 * ~800 kB of RSC, and every inline edit sent it again. So the rows cross **packed** — column
 * by column, names once, a value equal to its column's default not written — and the
 * browser rebuilds the same `OutlineNode` objects. Nothing downstream of `unpackOutline`
 * knows the transport exists.
 *
 * Pure: no React, no database. The server packs (`src/app/**`), a client component unpacks
 * once per payload (`useOutline`).
 *
 * ## Properties this holds, each pinned by `wire.test.ts`
 *
 * - **Lossless.** `unpackOutline(packOutline(nodes))` deep-equals `nodes`. A `Date` comes
 *   back as a `Date` of the same instant — it travels as epoch milliseconds, so a calendar
 *   day (UTC noon, `development/dates.md`) is carried unchanged and never re-encoded.
 * - **Self-describing.** The column list is in the payload. A tab left open across a deploy
 *   cannot misalign columns the way a positional layout would; a column this bundle does not
 *   know is skipped, not misread.
 * - **Exhaustive at compile time.** `COLUMNS` is a `Record<keyof OutlineNode, …>`, so a
 *   field added to `OutlineRow` / `OutlineNode` that the codec has not been taught fails the
 *   typecheck instead of silently arriving as `undefined`.
 */

export type OutlineKey = keyof OutlineNode;

/**
 * One column's values: dense (`[v0, v1, …]`, one per row) when most rows differ from the
 * column's default, sparse (`{ i, v }`, only the rows that differ) otherwise.
 */
export type WireColumn = unknown[] | { i: number[]; v: unknown[] };

export type OutlineWire<K extends OutlineKey = OutlineKey> = {
  /** Row count — what every column is read against. */
  n: number;
  /** Column names, written once; `v[j]` holds the values of column `c[j]`. */
  c: K[];
  v: WireColumn[];
};

// -- column catalogue --------------------------------------------------------------------

/**
 * How one field is stored. `fallback` is the value that is *not written* in a sparse column;
 * it is chosen as the most common value, so the common row costs nothing.
 *
 * Which kind a field gets follows from its type, and `ColumnOf` rejects a mismatch at
 * compile time (a `Date` field declared `scalar` would not typecheck).
 */
type ColumnOf<V> = [V] extends [Date | null]
  ? { kind: "date"; fallback: V }
  : [V] extends [string[] | null]
    ? { kind: "list" }
    : [V] extends [Shelf | null]
      ? { kind: "shelf" }
      : [V] extends [string | number | boolean | null]
        ? { kind: "scalar"; fallback: V }
        : never;

type Column =
  | { kind: "scalar"; fallback: string | number | boolean | null }
  | { kind: "date"; fallback: Date | null }
  | { kind: "list" }
  | { kind: "shelf" };

const EPOCH = new Date(0);

const COLUMNS: { readonly [K in OutlineKey]: ColumnOf<OutlineNode[K]> } = {
  id: { kind: "scalar", fallback: "" },
  parentId: { kind: "scalar", fallback: null },
  type: { kind: "scalar", fallback: "task" },
  name: { kind: "scalar", fallback: "" },
  sortKey: { kind: "scalar", fallback: "" },
  priorityLetter: { kind: "scalar", fallback: null },
  priorityRank: { kind: "scalar", fallback: null },
  tcPriorityLetter: { kind: "scalar", fallback: null },
  tcPriorityRank: { kind: "scalar", fallback: null },
  state: { kind: "scalar", fallback: "not_started" },
  deadline: { kind: "date", fallback: null },
  focus: { kind: "scalar", fallback: false },
  collapsed: { kind: "scalar", fallback: false },
  notes: { kind: "scalar", fallback: "" },
  isInbox: { kind: "scalar", fallback: false },
  completedAt: { kind: "date", fallback: null },
  dateCompleted: { kind: "date", fallback: null },
  createdAt: { kind: "date", fallback: EPOCH },
  updatedAt: { kind: "date", fallback: EPOCH },
  depth: { kind: "scalar", fallback: 0 },
  effortMinutes: { kind: "scalar", fallback: null },
  effortLeftMinutes: { kind: "scalar", fallback: null },
  actualEffortMinutes: { kind: "scalar", fallback: 0 },
  percentComplete: { kind: "scalar", fallback: 0 },
  contexts: { kind: "list" },
  actualStartDate: { kind: "date", fallback: null },
  description: { kind: "scalar", fallback: "" },
  effortDriven: { kind: "scalar", fallback: true },
  leadTimeMinutes: { kind: "scalar", fallback: null },
  deadlineLeadTimeMinutes: { kind: "scalar", fallback: null },
  place: { kind: "scalar", fallback: "" },
  expectedCost: { kind: "scalar", fallback: null },
  costLow: { kind: "scalar", fallback: null },
  costHigh: { kind: "scalar", fallback: null },
  costToDate: { kind: "scalar", fallback: null },
  color: { kind: "scalar", fallback: null },
  category: { kind: "scalar", fallback: null },
  importance: { kind: "scalar", fallback: null },
  targetStart: { kind: "date", fallback: null },
  targetEnd: { kind: "date", fallback: null },
  deferredDate: { kind: "date", fallback: null },
  recurrenceFrequency: { kind: "scalar", fallback: "none" },
  purpose: { kind: "scalar", fallback: "" },
  assignedTo: { kind: "scalar", fallback: "" },
  definition: { kind: "scalar", fallback: "" },
  range: { kind: "scalar", fallback: "" },
  isDream: { kind: "scalar", fallback: false },
  contactId: { kind: "scalar", fallback: null },
  lapLetter: { kind: "scalar", fallback: null },
  lapRank: { kind: "scalar", fallback: null },
  resultAreaName: { kind: "scalar", fallback: null },
  projectPriorityLetter: { kind: "scalar", fallback: null },
  projectPriorityRank: { kind: "scalar", fallback: null },
  effectiveCategory: { kind: "scalar", fallback: null },
  effortRollupMinutes: { kind: "scalar", fallback: null },
  effortLeftRollupMinutes: { kind: "scalar", fallback: null },
  actualEffortRollupMinutes: { kind: "scalar", fallback: 0 },
  percentCompleteRollup: { kind: "scalar", fallback: 0 },
  childCount: { kind: "scalar", fallback: 0 },
  hasChildren: { kind: "scalar", fallback: false },
  hasActiveChildren: { kind: "scalar", fallback: false },
  hidden: { kind: "scalar", fallback: false },
  shelf: { kind: "shelf" },
};

/** Every column the codec knows, in the order a full payload carries them. */
export const OUTLINE_KEYS = Object.keys(COLUMNS) as OutlineKey[];

// -- one value ---------------------------------------------------------------------------

function isFallback(column: Column, value: unknown): boolean {
  switch (column.kind) {
    case "scalar":
      return value === column.fallback;
    case "date":
      if (column.fallback === null || value === null) return value === column.fallback;
      return (value as Date).getTime() === column.fallback.getTime();
    case "list":
      return Array.isArray(value) && value.length === 0;
    case "shelf":
      return value === null;
  }
}

/** What goes on the wire. A `Date` is its epoch milliseconds, not an ISO string or `$D…`. */
function encode(column: Column, value: unknown): unknown {
  switch (column.kind) {
    case "scalar":
      return value;
    case "date":
      return value === null ? null : (value as Date).getTime();
    case "list":
      return value;
    case "shelf": {
      if (value === null) return null;
      const shelf = value as Shelf;
      return [shelf.until === null ? null : shelf.until.getTime(), shelf.sourceId];
    }
  }
}

function decode(column: Column, wire: unknown): unknown {
  switch (column.kind) {
    case "scalar":
      return wire;
    case "date":
      return wire === null ? null : new Date(wire as number);
    case "list":
      // Copied: a row's list is its own, and nothing else may share the wire's array.
      return Array.isArray(wire) ? [...(wire as string[])] : wire;
    case "shelf": {
      if (wire === null) return null;
      const [until, sourceId] = wire as [number | null, string];
      return { until: until === null ? null : new Date(until), sourceId };
    }
  }
}

/** The value a row has where a sparse column wrote nothing. A fresh list per row. */
function fallbackOf(column: Column): unknown {
  switch (column.kind) {
    case "scalar":
      return column.fallback;
    case "date":
      return column.fallback === null ? null : new Date(column.fallback.getTime());
    case "list":
      return [];
    case "shelf":
      return null;
  }
}

function encodedFallback(column: Column): unknown {
  switch (column.kind) {
    case "scalar":
      return column.fallback;
    case "date":
      return column.fallback === null ? null : column.fallback.getTime();
    case "list":
      return [];
    case "shelf":
      return null;
  }
}

// -- the codec ---------------------------------------------------------------------------

/**
 * Pack `nodes` for the browser, optionally keeping only `columns`.
 *
 * Projecting here is how a page that uses the outline as supporting data sends a slice: the
 * rows it filtered down to, and the columns its components read. Filtering rows is the
 * caller's job (it is a `.filter`, and what to keep is a per-page question); columns are
 * named here because the type of what comes out depends on them.
 */
export function packOutline(nodes: readonly OutlineNode[]): OutlineWire;
export function packOutline<K extends OutlineKey>(
  nodes: readonly OutlineNode[],
  columns: readonly K[],
): OutlineWire<K>;
export function packOutline(
  nodes: readonly OutlineNode[],
  columns: readonly OutlineKey[] = OUTLINE_KEYS,
): OutlineWire {
  const n = nodes.length;
  const v: WireColumn[] = [];

  for (const name of columns) {
    const column: Column = COLUMNS[name];
    const indexes: number[] = [];
    const values: unknown[] = [];
    for (let row = 0; row < n; row++) {
      const value: unknown = nodes[row][name];
      if (isFallback(column, value)) continue;
      indexes.push(row);
      values.push(encode(column, value));
    }

    if (indexes.length * 2 < n) {
      v.push({ i: indexes, v: values });
      continue;
    }

    // Mostly non-default: an index per value would cost more than the defaults it saves.
    const dense: unknown[] = new Array<unknown>(n).fill(encodedFallback(column));
    for (let k = 0; k < indexes.length; k++) dense[indexes[k]] = values[k];
    v.push(dense);
  }

  return { n, c: [...columns], v };
}

/**
 * Rebuild the rows. The result has exactly the columns the payload carried, in its order.
 *
 * A column this bundle does not know (a newer server than this open tab) is skipped.
 */
export function unpackOutline<K extends OutlineKey>(
  wire: OutlineWire<K>,
): Pick<OutlineNode, K>[] {
  const rows: Record<string, unknown>[] = [];
  for (let row = 0; row < wire.n; row++) rows.push({});

  wire.c.forEach((name, j) => {
    const column = (COLUMNS as Partial<Record<string, Column>>)[name];
    if (column === undefined) return;
    const stored = wire.v[j];

    if (Array.isArray(stored)) {
      for (let row = 0; row < wire.n; row++) {
        rows[row][name] = decode(column, stored[row]);
      }
      return;
    }

    for (let row = 0; row < wire.n; row++) rows[row][name] = fallbackOf(column);
    for (let k = 0; k < stored.i.length; k++) {
      rows[stored.i[k]][name] = decode(column, stored.v[k]);
    }
  });

  return rows as Pick<OutlineNode, K>[];
}
