import { describe, expect, it } from "vitest";
import { buildGroupRows, type GroupPart } from "./groupRows";

type Row = { id: string; letter: string | null; number: number };

type Dimension = "letter" | "number";

function part(row: Row, dimension: Dimension): GroupPart | null {
  if (dimension === "letter") {
    return row.letter === null
      ? null
      : { key: row.letter, label: row.letter, sort: row.letter };
  }
  return { key: String(row.number), label: `#${row.number}`, sort: row.number };
}

function group(rows: readonly Row[], dimensions: readonly Dimension[]) {
  return buildGroupRows<Row, Row, Dimension>(rows, {
    dimensions,
    partOf: part,
    emptyLabel: (dimension) => `(No ${dimension})`,
    comparePart: (left, right) =>
      typeof left.sort === "number" && typeof right.sort === "number"
        ? left.sort - right.sort
        : String(left.sort).localeCompare(String(right.sort)),
    toGridRow: (row) => ({ kind: "node", id: row.id, node: row, depth: 0 }),
  });
}

/** What the grid would show, one line per row: `label (count)` or the node id. */
function shape(rows: ReturnType<typeof group>): string[] {
  return rows.map((row) =>
    row.kind === "group"
      ? `${"  ".repeat(row.depth)}${row.label} (${row.count})`
      : `${"  ".repeat(row.depth)}${row.id}`,
  );
}

const a1: Row = { id: "a1", letter: "a", number: 1 };
const a2: Row = { id: "a2", letter: "a", number: 2 };
const b1: Row = { id: "b1", letter: "b", number: 1 };
const none1: Row = { id: "none1", letter: null, number: 1 };

describe("buildGroupRows", () => {
  it("emits the rows unchanged when nothing is grouped", () => {
    expect(shape(group([b1, a1], []))).toEqual(["b1", "a1"]);
  });

  it("gathers rows under one header per bucket, in bucket order", () => {
    expect(shape(group([b1, a2, a1], ["letter"]))).toEqual([
      "a (2)",
      "a2",
      "a1",
      "b (1)",
      "b1",
    ]);
  });

  it("counts nested rows at every level", () => {
    expect(shape(group([a1, a2, b1], ["letter", "number"]))).toEqual([
      "a (2)",
      "  #1 (1)",
      "a1",
      "  #2 (1)",
      "a2",
      "b (1)",
      "  #1 (1)",
      "b1",
    ]);
  });

  it("gives a nested header an id carrying the whole path above it", () => {
    const ids = group([a1, b1], ["letter", "number"])
      .filter((row) => row.kind === "group")
      .map((row) => row.id);
    // Collapsing `a → #1` must not collapse `b → #1`.
    expect(ids).toEqual([
      "group:letter:a",
      "group:letter:a|number:1",
      "group:letter:b",
      "group:letter:b|number:1",
    ]);
  });

  it("files rows with no value under the empty label, last", () => {
    expect(shape(group([none1, b1], ["letter"]))).toEqual([
      "b (1)",
      "b1",
      "(No letter) (1)",
      "none1",
    ]);
  });

  it("keeps the incoming order inside a bucket when there is no tiebreak", () => {
    expect(shape(group([a2, a1], ["letter"]))).toEqual(["a (2)", "a2", "a1"]);
  });

  it("orders rows inside a bucket by the tiebreak when given one", () => {
    const rows = buildGroupRows<Row, Row, Dimension>([a2, a1], {
      dimensions: ["letter"],
      partOf: part,
      emptyLabel: () => "(none)",
      comparePart: (left, right) => String(left.sort).localeCompare(String(right.sort)),
      toGridRow: (row) => ({ kind: "node", id: row.id, node: row, depth: 0 }),
      tiebreak: (left, right) => left.number - right.number,
    });
    expect(shape(rows)).toEqual(["a (2)", "a1", "a2"]);
  });

  it("reopens a header when a bucket recurs under a different parent", () => {
    // The same `#1` bucket appears twice; the second must be its own header rather than
    // absorbing rows into the first.
    const rows = group([a1, b1], ["number", "letter"]);
    expect(shape(rows)).toEqual(["#1 (2)", "  a (1)", "a1", "  b (1)", "b1"]);
  });
});
