import { describe, expect, it } from "vitest";
import { fromDateKey } from "@/lib/schedule/geometry";
import type { NoteNode } from "./types";
import { asNoteGroupBy, groupNotes, noteDatePart, type NoteGroupBy } from "./grouping";

function row(id: string, dateKey: string | null) {
  const note = {
    id,
    title: id,
    noteDate: dateKey ? fromDateKey(dateKey) : null,
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

describe("note calendar grouping", () => {
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

  it("drops retired, duplicate, and non-Notes dimensions", () => {
    expect(asNoteGroupBy(["year", "state", "year", "month", "day", "pivot"])).toEqual([
      "year",
      "month",
      "day",
    ]);
  });
});
