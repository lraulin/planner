import { describe, expect, it } from "vitest";
import { JOURNAL_SUBJECT } from "@/lib/day/types";
import { REDNOTEBOOK_SUBJECT } from "@/lib/rednotebook/types";
import { fromDateKey, toDateKey } from "@/lib/schedule/geometry";
import {
  buildDiaryTree,
  isDiarySubject,
  journalEntryOnDay,
  upsertDiarySummary,
  type DiarySummary,
} from "./diaryTree";

function summary(partial: {
  id: string;
  subject?: string;
  snippet?: string;
  date?: string | null;
  createdAt?: string;
}): DiarySummary {
  return {
    id: partial.id,
    subject: partial.subject ?? JOURNAL_SUBJECT,
    snippet: partial.snippet ?? "Wrote something.",
    noteDate: partial.date ? fromDateKey(partial.date) : null,
    createdAt: new Date(partial.createdAt ?? "2026-01-01T12:00:00.000Z"),
  };
}

describe("isDiarySubject", () => {
  it("accepts Journal and Rednotebook only", () => {
    expect(isDiarySubject(JOURNAL_SUBJECT)).toBe(true);
    expect(isDiarySubject(REDNOTEBOOK_SUBJECT)).toBe(true);
    expect(isDiarySubject("General")).toBe(false);
  });
});

describe("buildDiaryTree", () => {
  it("drops undated rows, empty snippets, and non-diary subjects", () => {
    const tree = buildDiaryTree([
      summary({ id: "j", date: "2026-08-01" }),
      summary({ id: "empty", date: "2026-08-02", snippet: "   " }),
      summary({ id: "undated", date: null, snippet: "orphan" }),
      summary({ id: "other", date: "2026-08-03", subject: "General" }),
    ]);

    expect(tree.years).toHaveLength(1);
    expect(tree.years[0].months[0].entries.map((e) => e.id)).toEqual(["j"]);
    expect([...tree.markedDays]).toEqual(["2026-08-01"]);
  });

  it("keeps Aug 1 as Aug 1 through the UTC-noon encoding", () => {
    // The Aug 1 → Jul 31 regression: a local-midnight fixture would land on July 31.
    const tree = buildDiaryTree([summary({ id: "aug", date: "2026-08-01" })]);
    expect(tree.years[0].months[0].key).toBe("2026-08");
    expect(tree.years[0].months[0].entries[0].dateKey).toBe("2026-08-01");
    expect(toDateKey(fromDateKey("2026-08-01"))).toBe("2026-08-01");
  });

  it("orders newest year and month first, newest day first", () => {
    const tree = buildDiaryTree([
      summary({ id: "jan-26", date: "2026-01-15" }),
      summary({ id: "aug-26", date: "2026-08-12" }),
      summary({ id: "aug-early", date: "2026-08-01" }),
      summary({ id: "dec-25", date: "2025-12-31" }),
    ]);

    expect(tree.years.map((y) => y.key)).toEqual(["2026", "2025"]);
    expect(tree.years[0].months.map((m) => m.key)).toEqual(["2026-08", "2026-01"]);
    expect(tree.years[0].months[0].entries.map((e) => e.id)).toEqual([
      "aug-26",
      "aug-early",
    ]);
  });

  it("on one day puts Journal before Rednotebook, then oldest createdAt", () => {
    const tree = buildDiaryTree([
      summary({
        id: "rn-late",
        date: "2026-08-01",
        subject: REDNOTEBOOK_SUBJECT,
        createdAt: "2026-08-01T18:00:00.000Z",
      }),
      summary({
        id: "rn-early",
        date: "2026-08-01",
        subject: REDNOTEBOOK_SUBJECT,
        createdAt: "2026-08-01T08:00:00.000Z",
      }),
      summary({
        id: "journal",
        date: "2026-08-01",
        subject: JOURNAL_SUBJECT,
        createdAt: "2026-08-01T20:00:00.000Z",
      }),
    ]);

    expect(tree.years[0].months[0].entries.map((e) => e.id)).toEqual([
      "journal",
      "rn-early",
      "rn-late",
    ]);
  });

  it("does not invent a today leaf", () => {
    expect(buildDiaryTree([]).years).toEqual([]);
    expect(buildDiaryTree([]).markedDays.size).toBe(0);
  });
});

describe("upsertDiarySummary", () => {
  it("inserts, replaces, and drops an emptied snippet", () => {
    const first = summary({ id: "a", date: "2026-08-01", snippet: "Hello" });
    const added = upsertDiarySummary([], first);
    expect(added).toHaveLength(1);

    const updated = upsertDiarySummary(added, { ...first, snippet: "Hello again" });
    expect(updated).toHaveLength(1);
    expect(updated[0].snippet).toBe("Hello again");

    expect(upsertDiarySummary(updated, { ...first, snippet: "  " })).toEqual([]);
  });
});

describe("journalEntryOnDay", () => {
  it("finds the Journal leaf and ignores Rednotebook on the same day", () => {
    const tree = buildDiaryTree([
      summary({ id: "j", date: "2026-08-01" }),
      summary({
        id: "rn",
        date: "2026-08-01",
        subject: REDNOTEBOOK_SUBJECT,
      }),
    ]);
    expect(journalEntryOnDay(tree, "2026-08-01")?.id).toBe("j");
    expect(journalEntryOnDay(tree, "2026-08-02")).toBeNull();
  });
});
