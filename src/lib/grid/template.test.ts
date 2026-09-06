import { describe, expect, it } from "vitest";
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from "@/lib/settings/grid";
import {
  buildGridTemplate,
  FILLER_TRACK,
  nameColumnOffset,
  resizedColumnWidth,
} from "./template";

const COLUMNS = [
  { id: "name", width: "18rem" },
  { id: "group", width: "10rem" },
  { id: "amount", width: "8rem" },
];

describe("buildGridTemplate", () => {
  it("ends every template with the filler and nothing else elastic", () => {
    const template = buildGridTemplate(COLUMNS);

    expect(template).toBe(`18rem 10rem 8rem ${FILLER_TRACK}`);
    // The whole point: slack lives at the end, so a drag can only take it from the end.
    expect(template.slice(0, template.length - FILLER_TRACK.length)).not.toContain(
      "fr",
    );
  });

  it("collapses a flexible declaration to its floor rather than letting it take slack", () => {
    const template = buildGridTemplate([
      { id: "name", width: "minmax(12rem,1fr)" },
      { id: "where", width: "minmax( 8rem , 0.8fr )" },
    ]);

    expect(template).toBe(`12rem 8rem ${FILLER_TRACK}`);
  });

  it("lets a stored override win, as pixels", () => {
    expect(buildGridTemplate(COLUMNS, { group: 260 })).toBe(
      `18rem 260px 8rem ${FILLER_TRACK}`,
    );
  });

  it("ignores overrides for columns that are not shown", () => {
    expect(buildGridTemplate(COLUMNS, { notes: 400 })).toBe(
      `18rem 10rem 8rem ${FILLER_TRACK}`,
    );
  });

  it("has a filler even with no columns, so an empty grid still fills its width", () => {
    expect(buildGridTemplate([])).toBe(FILLER_TRACK);
  });
});

describe("resizedColumnWidth", () => {
  it("adds the whole distance travelled to the width at pointer-down", () => {
    expect(resizedColumnWidth(160, 100)).toBe(260);
    expect(resizedColumnWidth(160, -60)).toBe(100);
  });

  it("clamps rather than letting a drag past the edge invert or swallow a column", () => {
    expect(resizedColumnWidth(160, -1000)).toBe(MIN_COLUMN_WIDTH);
    expect(resizedColumnWidth(160, 100_000)).toBe(MAX_COLUMN_WIDTH);
  });

  it("rounds, so a fractional measured width does not persist a fractional override", () => {
    expect(resizedColumnWidth(160.4, 20.2)).toBe(181);
  });
});

describe("nameColumnOffset", () => {
  const TREE = [
    { id: "state", width: "4rem" },
    { id: "pri", width: "3rem" },
    { id: "name", width: "30rem" },
    { id: "deadline", width: "8rem" },
  ];

  it("adds the handle, every track before the name, and a gap after each", () => {
    expect(nameColumnOffset(TREE, "1.75rem", "0.75rem")).toBe(
      "calc(1.75rem + 0.75rem + 4rem + 0.75rem + 3rem + 0.75rem)",
    );
  });

  it("counts a resized column at the width it is actually drawn", () => {
    // The bug this closes: the offset read declared widths only, so resizing any column
    // before the name left the tree drop line pointing at the wrong depth.
    expect(nameColumnOffset(TREE, "1.75rem", "0.75rem", { pri: 120 })).toBe(
      "calc(1.75rem + 0.75rem + 4rem + 0.75rem + 120px + 0.75rem)",
    );
  });

  it("ignores an override for a column after the name, which cannot move it", () => {
    expect(nameColumnOffset(TREE, "1.75rem", "0.75rem", { deadline: 400 })).toBe(
      nameColumnOffset(TREE, "1.75rem", "0.75rem"),
    );
  });

  it("stops at the name column, so nothing after it is added in", () => {
    expect(
      nameColumnOffset([{ id: "name", width: "30rem" }], "1.75rem", "0.75rem"),
    ).toBe("calc(1.75rem + 0.75rem)");
  });

  it("measures from the row edge rather than guessing at a track it cannot add", () => {
    expect(
      nameColumnOffset(
        [{ id: "odd", width: "fit-content" }, ...TREE],
        "1.75rem",
        "0.75rem",
      ),
    ).toBe("calc(1.75rem + 0.75rem)");
  });
});
