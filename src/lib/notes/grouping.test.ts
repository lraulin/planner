import { describe, expect, it } from "vitest";
import { fromDateKey } from "@/lib/schedule/geometry";
import type { NoteNode } from "./types";
import {
  asNoteGroupBy,
  formatNoteDate,
  groupNotes,
  noteContextsLabel,
  noteDatePart,
  noteGroupPart,
  NOTE_GROUP_BY_VALUES,
  type NoteGroupBy,
} from "./grouping";

function row(id: string, dateKey: string | null, overrides: Partial<NoteNode> = {}) {
  const note = {
    id,
    title: id,
    subject: "General",
    contexts: [],
    flag: "none",
    nodeName: null,
    contactName: null,
    noteDate: dateKey ? fromDateKey(dateKey) : null,
    ...overrides,
  } as NoteNode;
  return { id, note, depth: 0 };
}

function shape(dimensions: NoteGroupBy[]) {
  return groupNotes(
    [
      row("older", "2025-12-31"),
      row("newer", "2026-08-07"),
      row("same-day", "2026-08-07"),
      row("undated", null),
    ],
    dimensions,
  ).map((entry) =>
    entry.kind === "group"
      ? `${entry.depth}:${entry.label} (${entry.count})`
      : `note:${entry.node.title}`,
  );
}

function rowShape(rows: ReturnType<typeof row>[], dimensions: NoteGroupBy[]) {
  return groupNotes(rows, dimensions).map((entry) =>
    entry.kind === "group"
      ? `${entry.depth}:${entry.label} (${entry.count})`
      : `note:${entry.node.title}`,
  );
}

describe("note grouping", () => {
  it("builds a counted Year → Month → Day outline newest first", () => {
    expect(shape(["year", "month", "day"])).toEqual([
      "0:2026 (2)",
      "1:August (2)",
      "2:7 (2)",
      "note:newer",
      "note:same-day",
      "0:2025 (1)",
      "1:December (1)",
      "2:31 (1)",
      "note:older",
      "0:(No Year) (1)",
      "1:(No Month) (1)",
      "2:(No Day) (1)",
      "note:undated",
    ]);
  });

  it("keeps the chosen note order within one leaf day", () => {
    const rows = [row("second", "2026-08-07"), row("first", "2026-08-07")];
    const grouped = groupNotes(rows, ["day"]);
    expect(
      grouped.flatMap((entry) => (entry.kind === "node" ? [entry.id] : [])),
    ).toEqual(["second", "first"]);
  });

  it("reads stored calendar keys instead of process-local date parts", () => {
    const augustFirst = fromDateKey("2026-08-01");
    expect(noteDatePart(augustFirst, "year")).toMatchObject({ key: "2026" });
    expect(noteDatePart(augustFirst, "month")).toMatchObject({
      key: "08",
      label: "August",
    });
    expect(noteDatePart(augustFirst, "day")).toMatchObject({ key: "01", label: "1" });
  });

  it("groups categorical columns alphabetically and puts empty buckets last", () => {
    const first = row("first", null, {
      subject: "Work",
      contexts: ["Desk", "Deep"],
      flag: "blue",
    });
    const second = row("second", null, {
      subject: "Work",
      contexts: ["Deep", "Desk"],
      flag: "done",
    });
    const empty = row("empty", null, { subject: "" });

    expect(rowShape([second, empty, first], ["subject", "contexts", "flag"])).toEqual([
      "0:Work (2)",
      "1:Deep, Desk (2)",
      "2:Blue (1)",
      "note:first",
      "2:Done (1)",
      "note:second",
      "0:(No Subject) (1)",
      "1:(No Contexts) (1)",
      "2:(No Flag) (1)",
      "note:empty",
    ]);
  });

  it("groups exact dates newest first and undated notes last", () => {
    const grouped = rowShape(
      [row("older", "2025-12-31"), row("newer", "2026-08-07"), row("none", null)],
      ["date"],
    );

    expect(grouped).toEqual([
      `0:${formatNoteDate(fromDateKey("2026-08-07"))} (1)`,
      "note:newer",
      `0:${formatNoteDate(fromDateKey("2025-12-31"))} (1)`,
      "note:older",
      "0:(No Date) (1)",
      "note:none",
    ]);
  });

  it("threads the user's exact-date format into group labels", () => {
    const grouped = groupNotes([row("dated", "2026-08-07")], ["date"], "MMMM D, YYYY");

    expect(grouped[0]).toMatchObject({
      kind: "group",
      label: "August 7, 2026",
    });
  });

  it("derives every non-calendar bucket from the value shown by its column", () => {
    const note = row("bucket", "2026-08-07", {
      subject: " Work ",
      contexts: ["Desk", "Deep", "Desk"],
      flag: "blue",
      nodeName: "Big Project",
      contactName: "Ignored Contact",
    }).note;

    expect(noteGroupPart(note, "subject")).toMatchObject({
      key: "Work",
      label: "Work",
    });
    expect(noteGroupPart(note, "contexts")).toMatchObject({
      key: "Deep, Desk",
      label: "Deep, Desk",
    });
    expect(noteContextsLabel(note.contexts)).toBe("Deep, Desk");
    expect(noteGroupPart(note, "flag")).toMatchObject({ key: "blue", label: "Blue" });
    expect(noteGroupPart(note, "linked")).toMatchObject({
      key: "Big Project",
      label: "Big Project",
    });
  });

  it("encodes free-text keys so nested group ids cannot collide", () => {
    const grouped = groupNotes(
      [
        row("first", null, {
          subject: "a|contexts:b",
          contexts: ["c"],
        }),
        row("second", null, {
          subject: "a",
          contexts: ["b|contexts:c"],
        }),
      ],
      ["subject", "contexts"],
    );
    const groupIds = grouped.flatMap((entry) =>
      entry.kind === "group" ? [entry.id] : [],
    );

    expect(new Set(groupIds).size).toBe(groupIds.length);
    expect(groupIds.some((id) => id.includes("%7C"))).toBe(true);
  });

  it("drops retired, duplicate, and non-Notes dimensions", () => {
    expect(
      asNoteGroupBy(["subject", "state", "subject", "contexts", "flag", "date"]),
    ).toEqual(["subject", "contexts", "flag"]);
  });

  it("offers each Notes column that forms a useful repeatable bucket", () => {
    expect(NOTE_GROUP_BY_VALUES).toEqual([
      "subject",
      "contexts",
      "flag",
      "date",
      "year",
      "month",
      "day",
      "linked",
    ]);
  });
});
