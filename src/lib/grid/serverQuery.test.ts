import { describe, expect, it } from "vitest";
import { optionsFilter } from "./customFilter";
import {
  parseBlockOffset,
  parseServerGridQuery,
  sliceBlock,
  type ServerGridFields,
} from "./serverQuery";

const FIELDS: ServerGridFields = {
  ids: new Set(["date", "amount", "notes"]),
  defaultVisible: ["date", "amount"],
  sortable: (id) => id !== "notes",
};

describe("parseBlockOffset", () => {
  it("snaps to 100-row boundaries", () => {
    expect(parseBlockOffset(0)).toBe(0);
    expect(parseBlockOffset(99)).toBe(0);
    expect(parseBlockOffset(100)).toBe(100);
    expect(parseBlockOffset(-4)).toBe(0);
    expect(parseBlockOffset("150")).toBe(100);
  });
});

describe("sliceBlock", () => {
  it("preserves requested id order and skips unknown ids", () => {
    const rows = [{ id: "a" }, { id: "b" }];
    expect(sliceBlock(rows, ["b", "missing", "a"], 0).map((row) => row.id)).toEqual([
      "b",
      "a",
    ]);
  });
});

describe("parseServerGridQuery", () => {
  it("drops fields the grid does not define, everywhere they can appear", () => {
    const parsed = parseServerGridQuery(
      {
        filters: { rogue: optionsFilter(["x"]), notes: optionsFilter(["x"]) },
        visibleColumnIds: ["rogue", "amount"],
        sorts: [{ columnId: "rogue", direction: "asc" }],
      },
      FIELDS,
    );
    expect(Object.keys(parsed.filters)).toEqual(["notes"]);
    expect(parsed.visibleColumnIds).toEqual(["amount"]);
    expect(parsed.sorts).toEqual([]);
  });

  it("will not sort by a hidden or unsortable column", () => {
    const parsed = parseServerGridQuery(
      {
        visibleColumnIds: ["amount", "notes"],
        sorts: [
          { columnId: "date", direction: "asc" },
          { columnId: "notes", direction: "asc" },
          { columnId: "amount", direction: "asc" },
        ],
      },
      FIELDS,
    );
    expect(parsed.sorts).toEqual([{ columnId: "amount", direction: "asc" }]);
  });

  it("tells an absent sort from a deliberately empty one", () => {
    expect(parseServerGridQuery({}, FIELDS).sorts).toEqual([
      { columnId: "date", direction: "desc" },
    ]);
    expect(parseServerGridQuery({ sorts: [] }, FIELDS).sorts).toEqual([]);
  });
});
