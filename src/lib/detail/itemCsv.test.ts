import { describe, expect, it } from "vitest";
import type { NodeItem } from "@/db/schema";
import { fromDateKey, toDateKey } from "@/lib/schedule/geometry";
import {
  itemsToCsv,
  parseItemsCsv,
  resolveContactCsvRows,
  type ItemCsvField,
} from "./itemCsv";

const BENEFIT_FIELDS: ItemCsvField[] = [
  { key: "priority", label: "Priority", kind: "priority" },
  { key: "title", label: "Title", kind: "text" },
  { key: "description", label: "Description", kind: "textarea" },
  { key: "received", label: "Received", kind: "check" },
];

const PROGRESS_FIELDS: ItemCsvField[] = [
  { key: "entryDate", label: "Date", kind: "date" },
  { key: "score", label: "Score", kind: "number" },
  { key: "comments", label: "Comments", kind: "textarea" },
];

function item(overrides: Partial<NodeItem> & Pick<NodeItem, "id">): NodeItem {
  return {
    userId: "u",
    nodeId: "n",
    kind: "benefit",
    sortKey: overrides.id,
    priorityLetter: null,
    priorityRank: null,
    title: "",
    description: "",
    criteria: "",
    stakeholders: "",
    itemType: null,
    stake: "",
    severity: null,
    probability: null,
    detection: "",
    prevention: "",
    mitigation: "",
    advantages: "",
    disadvantages: "",
    decision: "",
    idealCandidate: "",
    candidates: "",
    filled: false,
    filledBy: "",
    association: "",
    contact: "",
    contactId: null,
    source: "",
    resolution: "",
    resolved: false,
    url: "",
    purpose: "",
    strategy: "",
    people: "",
    completed: false,
    received: false,
    conditions: "",
    awarded: false,
    reason: "",
    active: true,
    category: "",
    question: "",
    target: "",
    assignedTo: "",
    entryDate: null,
    score: null,
    comments: "",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe("itemsToCsv / parseItemsCsv", () => {
  it("round-trips priority, title, description, and check", () => {
    const rows = [
      item({
        id: "1",
        priorityLetter: "A",
        priorityRank: 1,
        title: "Freedom",
        description: "More time",
        received: true,
      }),
      item({
        id: "2",
        priorityLetter: "B",
        priorityRank: null,
        title: "Has, comma",
        description: 'Says "hi"',
        received: false,
      }),
    ];

    const csv = itemsToCsv(BENEFIT_FIELDS, rows);
    expect(csv.startsWith("Priority,Title,Description,Received\n")).toBe(true);

    const parsed = parseItemsCsv(BENEFIT_FIELDS, csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      {
        priorityLetter: "A",
        priorityRank: 1,
        title: "Freedom",
        description: "More time",
        received: true,
      },
      {
        priorityLetter: "B",
        priorityRank: null,
        title: "Has, comma",
        description: 'Says "hi"',
        received: false,
      },
    ]);
  });

  it("exports a header-only template when the list is empty", () => {
    expect(itemsToCsv(BENEFIT_FIELDS, [])).toBe(
      "Priority,Title,Description,Received\n",
    );
  });

  it("round-trips multi-line descriptions", () => {
    const csv = itemsToCsv(BENEFIT_FIELDS, [
      item({
        id: "1",
        title: "Line break",
        description: "first\nsecond",
      }),
    ]);
    const parsed = parseItemsCsv(BENEFIT_FIELDS, csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.description).toBe("first\nsecond");
  });

  it("accepts Pri and Yes/No aliases", () => {
    const parsed = parseItemsCsv(
      BENEFIT_FIELDS,
      "Pri,Title,Received\nA2,Ship it,yes\n",
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      {
        priorityLetter: "A",
        priorityRank: 2,
        title: "Ship it",
        received: true,
      },
    ]);
  });

  it("parses progress dates and scores", () => {
    const csv = itemsToCsv(PROGRESS_FIELDS, [
      item({
        id: "1",
        kind: "progress_entry",
        entryDate: fromDateKey("2026-08-01"),
        score: 8,
        comments: "Solid week",
      }),
    ]);
    const parsed = parseItemsCsv(PROGRESS_FIELDS, csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    const entryDate = parsed.rows[0]?.entryDate;
    expect(entryDate).toBeInstanceOf(Date);
    if (!(entryDate instanceof Date)) throw new Error("expected date");
    expect(toDateKey(entryDate)).toBe("2026-08-01");
    expect(parsed.rows[0]?.score).toBe(8);
    expect(parsed.rows[0]?.comments).toBe("Solid week");
  });

  it("reports invalid priority without importing that row", () => {
    const parsed = parseItemsCsv(BENEFIT_FIELDS, "Priority,Title\nZ9,Bad\nA1,Good\n");
    expect(parsed.rows).toEqual([
      { priorityLetter: "A", priorityRank: 1, title: "Good" },
    ]);
    expect(parsed.errors).toEqual([
      { row: 2, message: 'Invalid priority "Z9" (use A1, B, …).' },
    ]);
  });

  it("exports a contact's display name, not their id", () => {
    const fields: ItemCsvField[] = [
      { key: "contactId", label: "Name", kind: "contact" },
      { key: "association", label: "Association", kind: "text" },
    ];
    const csv = itemsToCsv(
      fields,
      [
        item({
          id: "1",
          kind: "contact",
          contactId: "c-ada",
          association: "Sponsor",
        }),
      ],
      new Map([["c-ada", "Ada King"]]),
    );
    expect(csv).toBe("Name,Association\nAda King,Sponsor\n");
  });

  it("resolves imported names to contact ids and rejects unknowns", () => {
    const fields: ItemCsvField[] = [
      { key: "contactId", label: "Name", kind: "contact" },
      { key: "association", label: "Association", kind: "text" },
    ];
    const parsed = parseItemsCsv(
      fields,
      "Name,Association\nAda King,Sponsor\nNobody,Friend\n",
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      { contactName: "Ada King", association: "Sponsor" },
      { contactName: "Nobody", association: "Friend" },
    ]);

    const resolved = resolveContactCsvRows(parsed.rows, [
      { id: "c-ada", displayName: "Ada King" },
    ]);
    expect(resolved.rows).toEqual([{ association: "Sponsor", contactId: "c-ada" }]);
    expect(resolved.errors).toEqual([
      { row: 3, message: 'No contact named "Nobody".' },
    ]);
  });

  it("errors when the header matches nothing", () => {
    const parsed = parseItemsCsv(BENEFIT_FIELDS, "Foo,Bar\n1,2\n");
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors[0]?.message).toMatch(/Header must include/);
  });
});
