import { describe, expect, it } from "vitest";
import { derive } from "./derive";
import { row } from "./fixtures";
import { OUTLINE_KEYS, packOutline, unpackOutline } from "./wire";
import type { OutlineNode } from "./types";

/** A tree touching every node type, a shelf, an inherited priority and a rollup. */
function tree(): OutlineNode[] {
  return derive([
    row({
      id: "ra",
      type: "result_area",
      name: "Health",
      priorityLetter: "A",
      priorityRank: 1,
      color: "#2e7d32",
      category: "Personal",
      importance: 80,
    }),
    row({
      id: "goal",
      type: "goal",
      parentId: "ra",
      depth: 1,
      isDream: true,
      definition: "Done",
    }),
    row({
      id: "proj",
      type: "project",
      parentId: "ra",
      depth: 1,
      purpose: "Because",
      assignedTo: "Sam",
    }),
    row({
      id: "t1",
      type: "task",
      parentId: "proj",
      depth: 2,
      effortMinutes: 60,
      effortLeftMinutes: 30,
      contexts: ["@home", "@phone"],
      deadline: new Date("2026-10-31T12:00:00.000Z"),
    }),
    row({
      id: "t2",
      type: "task",
      parentId: "proj",
      depth: 2,
      state: "postponed",
      deferredDate: new Date("2026-12-01T12:00:00.000Z"),
    }),
    row({ id: "t3", type: "task", parentId: "t2", depth: 3, state: "completed" }),
  ]);
}

/** Every field set to something other than what a fresh task has. */
const FULL: OutlineNode = {
  id: "11111111-2222-3333-4444-555555555555",
  parentId: "66666666-7777-8888-9999-000000000000",
  type: "project",
  name: "Everything filled in",
  sortKey: "Vz",
  priorityLetter: "B",
  priorityRank: 3,
  tcPriorityLetter: "C",
  tcPriorityRank: 2,
  state: "in_progress",
  deadline: new Date("2026-08-01T12:00:00.000Z"),
  focus: true,
  collapsed: true,
  notes: "a note",
  isInbox: true,
  completedAt: new Date("2026-07-01T15:30:12.345Z"),
  dateCompleted: new Date("2026-07-01T12:00:00.000Z"),
  createdAt: new Date("2026-01-02T03:04:05.678Z"),
  updatedAt: new Date("2026-02-03T04:05:06.789Z"),
  depth: 4,
  effortMinutes: 90,
  effortLeftMinutes: 45,
  actualEffortMinutes: 15,
  percentComplete: 50,
  contexts: ["@home"],
  actualStartDate: new Date("2026-06-01T12:00:00.000Z"),
  description: "desc",
  effortDriven: false,
  leadTimeMinutes: 10,
  deadlineLeadTimeMinutes: 20,
  place: "Office",
  expectedCost: 100.5,
  costLow: 90,
  costHigh: 120,
  costToDate: 33.25,
  color: "#fff",
  category: "Work",
  importance: 70,
  targetStart: new Date("2026-09-01T12:00:00.000Z"),
  targetEnd: new Date("2026-09-30T12:00:00.000Z"),
  deferredDate: new Date("2026-10-15T12:00:00.000Z"),
  recurrenceFrequency: "weekly",
  purpose: "purpose",
  assignedTo: "Alex",
  definition: "definition",
  range: "range",
  isDream: true,
  contactId: "contact-1",
  lapLetter: "A",
  lapRank: 9,
  resultAreaName: "Health",
  projectPriorityLetter: "D",
  projectPriorityRank: 4,
  effectiveCategory: "Personal",
  effortRollupMinutes: 200,
  effortLeftRollupMinutes: 100,
  actualEffortRollupMinutes: 30,
  percentCompleteRollup: 42,
  childCount: 5,
  hasChildren: true,
  hasActiveChildren: true,
  hidden: true,
  shelf: { until: new Date("2026-11-01T12:00:00.000Z"), sourceId: "ancestor" },
};

describe("outline wire — round trip", () => {
  it("returns a derived tree unchanged", () => {
    const nodes = tree();
    expect(unpackOutline(packOutline(nodes))).toEqual(nodes);
  });

  it("returns a row with every field populated unchanged", () => {
    expect(unpackOutline(packOutline([FULL, FULL]))).toEqual([FULL, FULL]);
  });

  it("covers every OutlineNode field in the fully populated fixture", () => {
    // A field added to the type without a value here would make the round trip above
    // vacuous for that field (`undefined` on both sides).
    expect(Object.keys(FULL).sort()).toEqual([...OUTLINE_KEYS].sort());
  });

  it("returns rows that are all at their defaults unchanged", () => {
    const nodes = derive([
      row({ id: "a", type: "task" }),
      row({ id: "b", type: "task" }),
    ]);
    expect(unpackOutline(packOutline(nodes))).toEqual(nodes);
  });

  it("returns an empty outline unchanged", () => {
    expect(unpackOutline(packOutline([]))).toEqual([]);
  });

  it("keeps a mix of default and non-default rows in the same column in order", () => {
    // One row in four differs: the sparse path, with indexes that are not contiguous.
    const nodes = derive(
      Array.from({ length: 8 }, (_, i) =>
        row({
          id: `n${i}`,
          type: "task",
          notes: i === 2 || i === 5 ? `note ${i}` : "",
        }),
      ),
    );
    expect(unpackOutline(packOutline(nodes)).map((n) => n.notes)).toEqual(
      nodes.map((n) => n.notes),
    );
  });
});

describe("outline wire — values that are easy to get subtly wrong", () => {
  it("returns Dates as Dates of the same instant", () => {
    const [back] = unpackOutline(packOutline([FULL]));
    expect(back.deadline).toBeInstanceOf(Date);
    expect(back.deadline?.getTime()).toBe(FULL.deadline?.getTime());
    // Milliseconds survive: createdAt/updatedAt are real instants, not calendar days.
    expect(back.completedAt?.getTime()).toBe(FULL.completedAt?.getTime());
    expect(back.createdAt).toBeInstanceOf(Date);
    expect(back.createdAt.getTime()).toBe(FULL.createdAt.getTime());
  });

  it("returns a date column's own default instant, not a missing value", () => {
    // createdAt's wire default is the epoch; a row that really was created then must still
    // come back as a Date, and so must every other row.
    const nodes = derive([
      row({ id: "a", type: "task", createdAt: new Date(0) }),
      row({ id: "b", type: "task" }),
    ]);
    const back = unpackOutline(packOutline(nodes));
    expect(back[0].createdAt).toEqual(new Date(0));
    expect(back[1].createdAt).toEqual(nodes[1].createdAt);
  });

  it("keeps null in a column whose default is an empty list", () => {
    // `contexts` is `string[] | null`; an empty list is the unwritten value, so null is a
    // value that differs from it and has to be written.
    const withNull: OutlineNode = { ...FULL, id: "n", contexts: null };
    const withEmpty: OutlineNode = { ...FULL, id: "e", contexts: [] };
    const back = unpackOutline(packOutline([withNull, withEmpty, withNull, withEmpty]));
    expect(back.map((n) => n.contexts)).toEqual([null, [], null, []]);
  });

  it("gives every row its own list, not one shared empty array", () => {
    const nodes = derive([
      row({ id: "a", type: "task" }),
      row({ id: "b", type: "task" }),
    ]);
    const [first, second] = unpackOutline(packOutline(nodes));
    first.contexts?.push("@home");
    expect(second.contexts).toEqual([]);
  });

  it("keeps a shelf with no end date distinct from no shelf", () => {
    const indefinite: OutlineNode = { ...FULL, shelf: { until: null, sourceId: "x" } };
    const none: OutlineNode = { ...FULL, shelf: null };
    const back = unpackOutline(packOutline([indefinite, none]));
    expect(back[0].shelf).toEqual({ until: null, sourceId: "x" });
    expect(back[1].shelf).toBeNull();
  });

  it("keeps false and 0 distinct from null where null is the default", () => {
    const nodes: OutlineNode[] = [
      { ...FULL, id: "zero", effortMinutes: 0, effortDriven: false, importance: 0 },
      {
        ...FULL,
        id: "null",
        effortMinutes: null,
        effortDriven: null,
        importance: null,
      },
      { ...FULL, id: "zero2", effortMinutes: 0, effortDriven: false, importance: 0 },
    ];
    expect(unpackOutline(packOutline(nodes))).toEqual(nodes);
  });
});

describe("outline wire — column projection", () => {
  it("returns exactly the requested keys", () => {
    const nodes = tree();
    const back = unpackOutline(packOutline(nodes, ["id", "name", "type"]));
    expect(back).toEqual(nodes.map((n) => ({ id: n.id, name: n.name, type: n.type })));
    for (const node of back)
      expect(Object.keys(node).sort()).toEqual(["id", "name", "type"]);
  });

  it("is smaller than the full payload", () => {
    const nodes = tree();
    const full = JSON.stringify(packOutline(nodes)).length;
    const slim = JSON.stringify(packOutline(nodes, ["id", "name"])).length;
    expect(slim).toBeLessThan(full / 4);
  });
});

describe("outline wire — self-description", () => {
  it("reads column names from the payload, in the payload's order", () => {
    const nodes = tree();
    const wire = packOutline(nodes, ["name", "id"]);
    const back = unpackOutline(wire);
    expect(Object.keys(back[0])).toEqual(["name", "id"]);
  });

  it("skips a column it does not know instead of misreading its neighbours", () => {
    const wire = packOutline(tree(), ["id", "name"]);
    // A newer server's payload, as an older bundle sees it: an unknown column in the middle.
    const skewed = {
      n: wire.n,
      c: ["id", "someFutureColumn", "name"],
      v: [wire.v[0], wire.v[1], wire.v[1]],
    } as unknown as typeof wire;
    // `name` is the third column here; the second must not shift it.
    const back = unpackOutline(skewed) as unknown as Record<string, unknown>[];
    expect(back[0]).toEqual({ id: "ra", name: "Health" });
    expect("someFutureColumn" in back[0]).toBe(false);
  });
});

describe("outline wire — size tripwire", () => {
  it("packs near-empty nodes to a small fraction of their keyed size", () => {
    // This is what the wire exists for: an empty task serialised as a keyed object is
    // ~1.3 kB, of which ~70% is field names. A regression to keyed rows (or to a layout that
    // repeats names per row) lands near that and fails here.
    const nodes = derive(
      Array.from({ length: 200 }, (_, i) =>
        row({
          id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
          type: "task",
          parentId: "00000000-0000-4000-8000-ffffffffffff",
          name: `Task ${i}`,
          sortKey: "V",
          depth: 2,
        }),
      ),
    );
    const keyed = JSON.stringify(nodes).length / nodes.length;
    const packed = JSON.stringify(packOutline(nodes)).length / nodes.length;

    expect(keyed).toBeGreaterThan(1000);
    expect(packed).toBeLessThan(160);
  });
});
