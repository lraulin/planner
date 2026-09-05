import { describe, expect, it } from "vitest";
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from "@/lib/settings/grid";
import { buildGridTemplate, FILLER_TRACK, resizedColumnWidth } from "./template";

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
