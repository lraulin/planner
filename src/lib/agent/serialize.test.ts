import { describe, expect, it } from "vitest";
import type { NoteNode } from "@/lib/notes/types";
import { noteSearchSummary } from "./serialize";

function note(body: string): NoteNode {
  return {
    id: "n1",
    parentId: null,
    sortKey: "a0",
    title: "T",
    subject: "General",
    body,
    noteDate: null,
    flag: "none",
    contexts: [],
    collapsed: false,
    depth: 0,
    nodeId: null,
    nodeName: null,
    nodeType: null,
    contactId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    childCount: 0,
    hasChildren: false,
    hidden: false,
  };
}

describe("noteSearchSummary", () => {
  it("skips fenced code instead of previewing the fence markers", () => {
    // The old character-delete strip left "```ts" in agent search hits; the Notes grid
    // already used noteSnippet, so search and the UI disagreed about what the note said.
    const body = "```ts\nconst x = 1;\n```\n\nThe fix is to inline it.";
    expect(noteSearchSummary(note(body)).snippet).toBe("The fix is to inline it.");
  });
});
