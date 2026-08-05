import { describe, expect, it } from "vitest";
import {
  contextOptions,
  EMPTY_NOTE_FILTER,
  isEmptyNoteFilter,
  notePassesFilter,
  type NoteFilter,
} from "./filter";
import { deriveNotes } from "./derive";
import type { NoteNode, NoteRow } from "./types";

function note(overrides: Partial<NoteRow> & { id?: string } = {}): NoteNode {
  const row: NoteRow = {
    id: overrides.id ?? "n1",
    parentId: null,
    sortKey: "a",
    title: "",
    subject: "General",
    body: "",
    noteDate: null,
    flag: "none",
    contexts: [],
    collapsed: false,
    depth: 0,
    nodeId: null,
    contactId: null,
    nodeName: null,
    nodeType: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
  return deriveNotes([row])[0];
}

function filter(overrides: Partial<NoteFilter> = {}): NoteFilter {
  return { ...EMPTY_NOTE_FILTER, ...overrides };
}

describe("isEmptyNoteFilter", () => {
  it("treats an untouched filter as empty", () => {
    expect(isEmptyNoteFilter(EMPTY_NOTE_FILTER)).toBe(true);
  });

  it("is not fooled by whitespace-only search text", () => {
    expect(isEmptyNoteFilter(filter({ search: "   " }))).toBe(true);
  });

  it("is not empty once a criterion is set", () => {
    expect(isEmptyNoteFilter(filter({ search: "x" }))).toBe(false);
    expect(isEmptyNoteFilter(filter({ subjects: ["Work"] }))).toBe(false);
    expect(isEmptyNoteFilter(filter({ contexts: ["@home"] }))).toBe(false);
  });
});

describe("notePassesFilter — no criteria", () => {
  it("keeps everything under either match mode", () => {
    // An untouched filter must never hide rows; that reads as data loss.
    expect(notePassesFilter(note(), EMPTY_NOTE_FILTER)).toBe(true);
    expect(notePassesFilter(note(), filter({ matchMode: "any" }))).toBe(true);
  });
});

describe("notePassesFilter — text search", () => {
  const subject = note({
    title: "Migration plan",
    body: "We should re-suggest the Flask change to the lead dev.",
  });

  it("searches the body, not only the title", () => {
    // This is the whole point of the search: the body is what no column can show you.
    expect(notePassesFilter(subject, filter({ search: "Flask" }))).toBe(true);
  });

  it("is case insensitive", () => {
    expect(notePassesFilter(subject, filter({ search: "FLASK" }))).toBe(true);
    expect(notePassesFilter(subject, filter({ search: "migration" }))).toBe(true);
  });

  it("requires every term under All", () => {
    expect(
      notePassesFilter(
        subject,
        filter({ search: "Flask migration", searchMode: "all" }),
      ),
    ).toBe(true);
    expect(
      notePassesFilter(subject, filter({ search: "Flask python", searchMode: "all" })),
    ).toBe(false);
  });

  it("requires only one term under Any", () => {
    // Same two terms as the failing All case above — the modes must genuinely differ.
    expect(
      notePassesFilter(subject, filter({ search: "Flask python", searchMode: "any" })),
    ).toBe(true);
    expect(
      notePassesFilter(subject, filter({ search: "django python", searchMode: "any" })),
    ).toBe(false);
  });

  it("honours the in-title and in-notes checkboxes", () => {
    expect(
      notePassesFilter(
        subject,
        filter({ search: "Flask", searchInTitle: true, searchInBody: false }),
      ),
    ).toBe(false);

    expect(
      notePassesFilter(
        subject,
        filter({ search: "Migration", searchInTitle: false, searchInBody: true }),
      ),
    ).toBe(false);
  });

  it("reaches the subject, contexts, and linked record under other text fields", () => {
    const tagged = note({
      title: "Untitled",
      subject: "Renovation",
      contexts: ["@calls"],
      nodeName: "Kitchen rebuild",
    });
    const withOthers = filter({
      searchInTitle: false,
      searchInBody: false,
      searchInOtherFields: true,
    });

    expect(notePassesFilter(tagged, { ...withOthers, search: "renovation" })).toBe(
      true,
    );
    expect(notePassesFilter(tagged, { ...withOthers, search: "@calls" })).toBe(true);
    expect(notePassesFilter(tagged, { ...withOthers, search: "kitchen" })).toBe(true);
    expect(notePassesFilter(tagged, { ...withOthers, search: "bathroom" })).toBe(false);
  });

  it("matches nothing when every search target is unticked", () => {
    // Keeping everything here would look like the search box was ignored.
    expect(
      notePassesFilter(
        subject,
        filter({
          search: "Flask",
          searchInTitle: false,
          searchInBody: false,
          searchInOtherFields: false,
        }),
      ),
    ).toBe(false);
  });
});

describe("notePassesFilter — subject", () => {
  const work = note({ subject: "Work" });

  it("keeps a note whose subject is listed", () => {
    expect(notePassesFilter(work, filter({ subjects: ["Work"] }))).toBe(true);
    expect(notePassesFilter(work, filter({ subjects: ["Home"] }))).toBe(false);
  });

  it("matches any of several subjects", () => {
    expect(
      notePassesFilter(
        work,
        filter({ subjects: ["Home", "Work"], subjectMode: "any" }),
      ),
    ).toBe(true);
  });

  it("ignores case and surrounding spaces", () => {
    expect(notePassesFilter(work, filter({ subjects: ["  work  "] }))).toBe(true);
  });
});

describe("notePassesFilter — contexts", () => {
  const tagged = note({ contexts: ["Todo", "Work"] });

  it("keeps a note carrying any of the wanted contexts", () => {
    expect(
      notePassesFilter(
        tagged,
        filter({ contexts: ["Work", "Errands"], contextMode: "any" }),
      ),
    ).toBe(true);
  });

  it("requires every wanted context under All", () => {
    // Unlike Subject, a note has many contexts, so All is genuinely useful here.
    expect(
      notePassesFilter(
        tagged,
        filter({ contexts: ["Todo", "Work"], contextMode: "all" }),
      ),
    ).toBe(true);
    expect(
      notePassesFilter(
        tagged,
        filter({ contexts: ["Todo", "Errands"], contextMode: "all" }),
      ),
    ).toBe(false);
  });
});

describe("notePassesFilter — combining criteria", () => {
  const subject = note({ title: "Budget", subject: "Work", contexts: ["Todo"] });

  it("requires every criterion under Match All", () => {
    expect(
      notePassesFilter(
        subject,
        filter({ search: "Budget", subjects: ["Home"], matchMode: "all" }),
      ),
    ).toBe(false);
  });

  it("requires only one criterion under Match Any", () => {
    // Same inputs as the Match All case above, so the toggle is proven to do something.
    expect(
      notePassesFilter(
        subject,
        filter({ search: "Budget", subjects: ["Home"], matchMode: "any" }),
      ),
    ).toBe(true);
  });

  it("ignores criteria that were left blank", () => {
    // An empty Subject list must not count as a failed criterion under Match All.
    expect(
      notePassesFilter(subject, filter({ search: "Budget", matchMode: "all" })),
    ).toBe(true);
  });
});

describe("contextOptions", () => {
  it("collects distinct contexts, sorted, ignoring blanks", () => {
    const notes = [
      note({ id: "a", contexts: ["Work", "Todo"] }),
      note({ id: "b", contexts: ["Todo", "  "] }),
      note({ id: "c", contexts: ["Admin"] }),
    ];

    expect(contextOptions(notes)).toEqual(["Admin", "Todo", "Work"]);
  });

  it("returns nothing when no note carries a context", () => {
    expect(contextOptions([note()])).toEqual([]);
  });
});
