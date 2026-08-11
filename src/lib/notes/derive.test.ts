import { describe, expect, it } from "vitest";
import { deriveNotes } from "./derive";
import type { NoteRow } from "./types";

function note(partial: Partial<NoteRow> & Pick<NoteRow, "id" | "title">): NoteRow {
  return {
    parentId: null,
    sortKey: "a0",
    depth: 0,
    body: "",
    subject: "",
    noteDate: null,
    flag: "none",
    contexts: [],
    nodeId: null,
    nodeName: null,
    nodeType: null,
    contactId: null,
    collapsed: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...partial,
  };
}

describe("deriveNotes", () => {
  it("counts children and marks hasChildren", () => {
    const rows = [
      note({ id: "p", title: "Parent" }),
      note({ id: "c1", title: "Child", parentId: "p", depth: 1 }),
      note({ id: "c2", title: "Other", parentId: "p", depth: 1 }),
      note({ id: "leaf", title: "Alone" }),
    ];
    const derived = deriveNotes(rows);
    expect(derived.find((n) => n.id === "p")).toMatchObject({
      childCount: 2,
      hasChildren: true,
      hidden: false,
    });
    expect(derived.find((n) => n.id === "leaf")).toMatchObject({
      childCount: 0,
      hasChildren: false,
    });
  });

  it("hides rows under a collapsed ancestor, not only the direct parent", () => {
    // Parents precede children (depth-first). Collapse the root and the grandchild
    // must hide even when its own parent is expanded.
    const rows = [
      note({ id: "root", title: "Root", collapsed: true }),
      note({ id: "mid", title: "Mid", parentId: "root", depth: 1, collapsed: false }),
      note({ id: "leaf", title: "Leaf", parentId: "mid", depth: 2 }),
    ];
    const byId = new Map(deriveNotes(rows).map((n) => [n.id, n]));
    expect(byId.get("root")!.hidden).toBe(false);
    expect(byId.get("mid")!.hidden).toBe(true);
    expect(byId.get("leaf")!.hidden).toBe(true);
  });

  it("shows children when every ancestor is expanded", () => {
    const rows = [
      note({ id: "root", title: "Root", collapsed: false }),
      note({ id: "mid", title: "Mid", parentId: "root", depth: 1, collapsed: false }),
      note({ id: "leaf", title: "Leaf", parentId: "mid", depth: 2 }),
    ];
    expect(deriveNotes(rows).every((n) => !n.hidden)).toBe(true);
  });
});
