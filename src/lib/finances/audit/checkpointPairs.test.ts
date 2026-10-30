import { describe, expect, it } from "vitest";
import { latestSide, pairCheckpointRows } from "./checkpointPairs";

type Row = { id: string; cents: number };
const keyOf = (row: Row) => row.id;

describe("pairCheckpointRows", () => {
  it("matches by key and marks added and removed rows by the missing side", () => {
    const pairs = pairCheckpointRows(
      [
        { id: "kept", cents: 1 },
        { id: "removed", cents: 2 },
      ],
      [
        { id: "added", cents: 3 },
        { id: "kept", cents: 4 },
      ],
      keyOf,
    );

    expect(pairs).toEqual([
      {
        key: "kept",
        pair: {
          kind: "kept",
          before: { id: "kept", cents: 1 },
          after: { id: "kept", cents: 4 },
        },
      },
      {
        key: "removed",
        pair: { kind: "removed", before: { id: "removed", cents: 2 }, after: null },
      },
      {
        key: "added",
        pair: { kind: "added", before: null, after: { id: "added", cents: 3 } },
      },
    ]);
  });
});

describe("latestSide", () => {
  it("names a surviving row by its after side and a removed row by its before side", () => {
    const [kept, removed] = pairCheckpointRows(
      [
        { id: "kept", cents: 1 },
        { id: "removed", cents: 2 },
      ],
      [{ id: "kept", cents: 4 }],
      keyOf,
    );

    expect(latestSide(kept.pair).cents).toBe(4);
    expect(latestSide(removed.pair).cents).toBe(2);
  });
});
