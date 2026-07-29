import { describe, expect, it } from "vitest";
import { sliceNotes, subjectOptions } from "./slice";
import { deriveNotes } from "./derive";
import type { NoteNode, NoteRow } from "./types";

/**
 * Notes are built through `deriveNotes` so `hasChildren` and `hidden` are computed the same
 * way the loader computes them — a fixture that sets them by hand would drift from reality.
 * Rows are declared in depth-first order, as the query returns them.
 */
function tree(
  entries: {
    id: string;
    parentId?: string | null;
    title?: string;
    subject?: string;
    date?: string | null;
    collapsed?: boolean;
  }[],
): NoteNode[] {
  const rows: NoteRow[] = entries.map((entry) => ({
    id: entry.id,
    parentId: entry.parentId ?? null,
    sortKey: "a",
    title: entry.title ?? entry.id,
    subject: entry.subject ?? "General",
    body: "",
    noteDate:
      entry.date === undefined
        ? new Date("2026-01-01")
        : entry.date
          ? new Date(entry.date)
          : null,
    flag: "none",
    contexts: [],
    collapsed: entry.collapsed ?? false,
    depth: 0,
    nodeId: null,
    nodeName: null,
    nodeType: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  }));
  return deriveNotes(rows);
}

/** Rows as "depth:title", which is what the grid actually draws. */
function shape(rows: ReturnType<typeof sliceNotes>): string[] {
  return rows.map((row) => `${row.depth}:${row.note.title}`);
}

describe("sliceNotes — nesting", () => {
  const notes = tree([
    { id: "a", title: "Alpha" },
    { id: "a1", parentId: "a", title: "Alpha one" },
    { id: "a1x", parentId: "a1", title: "Alpha deep" },
    { id: "b", title: "Bravo" },
  ]);

  it("indents children under their parent", () => {
    expect(shape(sliceNotes(notes, { mode: "nested", sort: "manual" }))).toEqual([
      "0:Alpha",
      "1:Alpha one",
      "2:Alpha deep",
      "0:Bravo",
    ]);
  });

  it("flattens every note to depth 0 in flat mode", () => {
    expect(shape(sliceNotes(notes, { mode: "flat", sort: "manual" }))).toEqual([
      "0:Alpha",
      "0:Alpha one",
      "0:Alpha deep",
      "0:Bravo",
    ]);
  });
});

describe("sliceNotes — collapse", () => {
  const notes = tree([
    { id: "a", title: "Alpha", collapsed: true },
    { id: "a1", parentId: "a", title: "Alpha one" },
    { id: "a1x", parentId: "a1", title: "Alpha deep" },
    { id: "b", title: "Bravo" },
  ]);

  it("hides the whole subtree of a collapsed note, not just its children", () => {
    expect(shape(sliceNotes(notes, { mode: "nested", sort: "manual" }))).toEqual([
      "0:Alpha",
      "0:Bravo",
    ]);
  });

  it("ignores collapse in flat mode", () => {
    // There is no visible hierarchy to collapse, so honouring the flag would silently drop
    // rows for a reason nothing on screen explains.
    expect(shape(sliceNotes(notes, { mode: "flat", sort: "manual" }))).toEqual([
      "0:Alpha",
      "0:Alpha one",
      "0:Alpha deep",
      "0:Bravo",
    ]);
  });
});

describe("sliceNotes — sorting", () => {
  it("sorts within siblings when nested, keeping the tree intact", () => {
    // Sorting a tree globally would tear "Zulu child" away from "Zulu".
    const notes = tree([
      { id: "z", title: "Zulu" },
      { id: "z1", parentId: "z", title: "Zulu child" },
      { id: "a", title: "Alpha" },
    ]);

    expect(shape(sliceNotes(notes, { mode: "nested", sort: "title" }))).toEqual([
      "0:Alpha",
      "0:Zulu",
      "1:Zulu child",
    ]);
  });

  it("sorts across every row when flat", () => {
    const notes = tree([
      { id: "z", title: "Zulu" },
      { id: "z1", parentId: "z", title: "Zulu child" },
      { id: "a", title: "Alpha" },
    ]);

    expect(shape(sliceNotes(notes, { mode: "flat", sort: "title" }))).toEqual([
      "0:Alpha",
      "0:Zulu",
      "0:Zulu child",
    ]);
  });

  it("leaves stored order alone for manual sort", () => {
    const notes = tree([
      { id: "z", title: "Zulu" },
      { id: "a", title: "Alpha" },
    ]);

    expect(shape(sliceNotes(notes, { mode: "flat", sort: "manual" }))).toEqual([
      "0:Zulu",
      "0:Alpha",
    ]);
  });

  it("reverses on descending", () => {
    const notes = tree([
      { id: "a", title: "Alpha" },
      { id: "b", title: "Bravo" },
    ]);

    expect(
      shape(sliceNotes(notes, { mode: "flat", sort: "title", direction: "desc" })),
    ).toEqual(["0:Bravo", "0:Alpha"]);
  });

  it("sorts by date oldest first", () => {
    const notes = tree([
      { id: "b", title: "Later", date: "2026-03-01" },
      { id: "a", title: "Earlier", date: "2026-01-15" },
    ]);

    expect(shape(sliceNotes(notes, { mode: "flat", sort: "date" }))).toEqual([
      "0:Earlier",
      "0:Later",
    ]);
  });

  it("puts untitled and undated notes last rather than first", () => {
    // These sort as "" and 0, which would otherwise put every blank new note at the top of
    // the list ahead of everything real.
    const byTitle = tree([
      { id: "blank", title: "" },
      { id: "a", title: "Alpha" },
    ]);
    expect(shape(sliceNotes(byTitle, { mode: "flat", sort: "title" }))).toEqual([
      "0:Alpha",
      "0:",
    ]);

    const byDate = tree([
      { id: "undated", title: "Undated", date: null },
      { id: "dated", title: "Dated", date: "2026-01-01" },
    ]);
    expect(shape(sliceNotes(byDate, { mode: "flat", sort: "date" }))).toEqual([
      "0:Dated",
      "0:Undated",
    ]);
  });

  it("orders titles numerically, so Step 10 follows Step 9", () => {
    const notes = tree([
      { id: "c", title: "Step 10" },
      { id: "b", title: "Step 9" },
    ]);

    expect(shape(sliceNotes(notes, { mode: "flat", sort: "title" }))).toEqual([
      "0:Step 9",
      "0:Step 10",
    ]);
  });
});

describe("sliceNotes — filtering", () => {
  it("promotes a kept child onto its nearest kept ancestor", () => {
    // Filtering out the parent must not leave the child indented under nothing.
    const notes = tree([
      { id: "a", title: "Alpha" },
      { id: "a1", parentId: "a", title: "Skip me" },
      { id: "a1x", parentId: "a1", title: "Keep me" },
    ]);

    const rows = sliceNotes(notes, {
      mode: "nested",
      sort: "manual",
      keep: (note) => note.title !== "Skip me",
    });

    expect(shape(rows)).toEqual(["0:Alpha", "1:Keep me"]);
  });

  it("promotes a kept descendant to the root when no ancestor survives", () => {
    const notes = tree([
      { id: "a", title: "Skip me" },
      { id: "a1", parentId: "a", title: "Keep me" },
    ]);

    const rows = sliceNotes(notes, {
      mode: "nested",
      sort: "manual",
      keep: (note) => note.title !== "Skip me",
    });

    expect(shape(rows)).toEqual(["0:Keep me"]);
  });

  it("shows a note whose surviving parent is collapsed, once it is re-based", () => {
    // The stored `hidden` flag says this child is hidden, but its collapsed parent was
    // filtered out — so after re-basing there is nothing collapsed above it any more.
    const notes = tree([
      { id: "a", title: "Skip me", collapsed: true },
      { id: "a1", parentId: "a", title: "Keep me" },
    ]);

    const rows = sliceNotes(notes, {
      mode: "nested",
      sort: "manual",
      keep: (note) => note.title !== "Skip me",
    });

    expect(shape(rows)).toEqual(["0:Keep me"]);
  });

  it("returns nothing when everything is filtered out", () => {
    const notes = tree([{ id: "a", title: "Alpha" }]);
    expect(
      sliceNotes(notes, { mode: "nested", sort: "manual", keep: () => false }),
    ).toEqual([]);
  });
});

describe("subjectOptions", () => {
  it("always offers General, even with no notes", () => {
    expect(subjectOptions([])).toEqual(["General"]);
  });

  it("collects distinct subjects in use, sorted, without duplicating General", () => {
    const notes = tree([
      { id: "a", subject: "Work" },
      { id: "b", subject: "Work" },
      { id: "c", subject: "General" },
      { id: "d", subject: "Admin" },
    ]);

    expect(subjectOptions(notes)).toEqual(["Admin", "General", "Work"]);
  });

  it("ignores blank subjects", () => {
    const notes = tree([{ id: "a", subject: "   " }]);
    expect(subjectOptions(notes)).toEqual(["General"]);
  });
});
