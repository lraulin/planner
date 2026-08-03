import { describe, expect, it } from "vitest";
import {
  applyDateFilter,
  applyNextActionFilter,
  buildChooserItems,
  chooserRows,
  chooserView,
  CHOOSER_VIEWS,
  defaultSettings,
  isChooserCandidate,
  DEFAULT_STATES,
} from "./views";
import type { ChooserItem, ChooserSettings, ChooserViewId } from "./types";
import { nodeStateEnum } from "@/db/schema";
import { fromDateKey, shiftDateKey } from "@/lib/schedule/geometry";
import { derive } from "@/lib/tree/derive";
import { row } from "@/lib/tree/fixtures";
import type { OutlineRow } from "@/lib/tree/types";

const TODAY = "2026-07-28";

/** Calendar day `days` from TODAY — UTC-noon encoding. */
function dayOut(days: number): Date {
  return fromDateKey(shiftDateKey(TODAY, days));
}

/** Stored calendar day for a `YYYY-MM-DD` key. */
function localDay(key: string): Date {
  return fromDateKey(key);
}

function build(
  rows: OutlineRow[],
  viewId: ChooserViewId = "best-overall",
  overrides: Partial<ChooserSettings> = {},
): ChooserItem[] {
  return buildChooserItems(derive(rows), {
    today: TODAY,
    viewId,
    settings: { ...defaultSettings(viewId), ...overrides },
  });
}

function names(items: ChooserItem[]): string[] {
  return items.map((item) => item.node.name);
}

describe("isChooserCandidate", () => {
  const nodes = derive([
    row({ id: "area", type: "result_area", name: "Area", sortKey: "a" }),
    row({ id: "goal", type: "goal", parentId: "area", name: "Goal", sortKey: "a" }),
    row({
      id: "parent",
      type: "project",
      parentId: "goal",
      name: "Parent",
      sortKey: "a",
    }),
    row({
      id: "leaf-task",
      type: "task",
      parentId: "parent",
      name: "Leaf",
      sortKey: "a",
    }),
    row({
      id: "empty",
      type: "project",
      parentId: "goal",
      name: "Empty",
      sortKey: "b",
    }),
  ]);
  const byId = new Map(nodes.map((node) => [node.id, node]));

  it("takes leaf tasks and task-less projects only", () => {
    expect(isChooserCandidate(byId.get("leaf-task")!, DEFAULT_STATES)).toBe(true);
    expect(isChooserCandidate(byId.get("empty")!, DEFAULT_STATES)).toBe(true);
    // A project with work under it is not itself a choice — its children are.
    expect(isChooserCandidate(byId.get("parent")!, DEFAULT_STATES)).toBe(false);
    expect(isChooserCandidate(byId.get("goal")!, DEFAULT_STATES)).toBe(false);
    expect(isChooserCandidate(byId.get("area")!, DEFAULT_STATES)).toBe(false);
  });

  it("drops finished work and hides deferred work unless asked", () => {
    const [done] = derive([row({ id: "d", type: "task", state: "completed" })]);
    const [cancelled] = derive([row({ id: "c", type: "task", state: "cancelled" })]);
    const [deferred] = derive([row({ id: "p", type: "task", state: "postponed" })]);

    expect(isChooserCandidate(done, DEFAULT_STATES)).toBe(false);
    expect(isChooserCandidate(cancelled, DEFAULT_STATES)).toBe(false);
    expect(isChooserCandidate(deferred, DEFAULT_STATES)).toBe(false);
    expect(isChooserCandidate(deferred, [...DEFAULT_STATES, "postponed"])).toBe(true);
  });

  it("hides a task shelved to a future date, and offers it once the shelf expires", () => {
    // How a repeating routine stays off the list between cycles without pretending to have
    // a deadline. The date is the *expiry* of the postponed state, so the state carries it.
    const shelvedRow = (key: string) =>
      derive([
        row({
          id: "t",
          type: "task",
          state: "postponed",
          deferredDate: localDay(key),
        }),
      ])[0];

    expect(
      isChooserCandidate(shelvedRow("2026-03-09"), DEFAULT_STATES, "2026-03-08"),
    ).toBe(false);
    // Due today counts as due — not hidden for the rest of the day it came back. Note that
    // nothing wrote to the row to expire it; the state is derived on read.
    expect(
      isChooserCandidate(shelvedRow("2026-03-08"), DEFAULT_STATES, "2026-03-08"),
    ).toBe(true);
    expect(
      isChooserCandidate(shelvedRow("2026-03-01"), DEFAULT_STATES, "2026-03-08"),
    ).toBe(true);
  });

  it("shelves a whole subtree from an ancestor, latest date winning", () => {
    // The case that started this: "Pay Taxes" is a project known a year out. Deferring it
    // has to take its tasks with it, and a task shelved further out keeps its own date.
    const tree = (opts: { parentUntil: string | null; childUntil?: string }) =>
      derive([
        row({
          id: "p",
          type: "project",
          state: "postponed",
          deferredDate: opts.parentUntil ? localDay(opts.parentUntil) : null,
        }),
        row({
          id: "t",
          type: "task",
          parentId: "p",
          depth: 1,
          state: opts.childUntil ? "postponed" : "not_started",
          deferredDate: opts.childUntil ? localDay(opts.childUntil) : null,
        }),
      ]);

    const child = (nodes: ReturnType<typeof derive>) =>
      nodes.find((n) => n.id === "t")!;

    // Inherited: the task carries no date of its own.
    expect(
      isChooserCandidate(
        child(tree({ parentUntil: "2027-02-15" })),
        DEFAULT_STATES,
        "2026-03-08",
      ),
    ).toBe(false);

    // The parent's shelf has expired, so the task is available again.
    expect(
      isChooserCandidate(
        child(tree({ parentUntil: "2026-03-01" })),
        DEFAULT_STATES,
        "2026-03-08",
      ),
    ).toBe(true);

    // The child is shelved further out than its parent — its own date wins.
    expect(
      isChooserCandidate(
        child(tree({ parentUntil: "2026-03-01", childUntil: "2027-01-01" })),
        DEFAULT_STATES,
        "2026-03-08",
      ),
    ).toBe(false);

    // An indefinite shelf up the chain outranks any dated one below it.
    expect(
      isChooserCandidate(
        child(tree({ parentUntil: null, childUntil: "2026-03-01" })),
        DEFAULT_STATES,
        "2026-03-08",
      ),
    ).toBe(false);
  });

  it("keeps a zero-effort next-action reminder task", () => {
    // Manual §7.2.5 — not scheduled, but still something you can pick. Achieve's own
    // Task Chooser screenshot shows one.
    const [reminder] = derive([
      row({ id: "r", type: "task", effortMinutes: 0, effortLeftMinutes: 0 }),
    ]);
    expect(isChooserCandidate(reminder, DEFAULT_STATES)).toBe(true);
  });
});

describe("buildChooserItems", () => {
  it("orders by descending score", () => {
    const items = build([
      row({ id: "a", type: "task", name: "low", priorityLetter: "C", sortKey: "a" }),
      row({ id: "b", type: "task", name: "high", priorityLetter: "A", sortKey: "b" }),
      row({ id: "c", type: "task", name: "mid", priorityLetter: "B", sortKey: "c" }),
    ]);
    expect(names(items)).toEqual(["high", "mid", "low"]);
  });

  it("lifts every task under a project when the project gains a deadline", () => {
    // The behaviour the whole feature rests on: urgency propagates down the tree.
    const withoutDeadline = build([
      row({ id: "p1", type: "project", name: "P1", sortKey: "a" }),
      row({
        id: "t1",
        type: "task",
        parentId: "p1",
        name: "urgent-task",
        sortKey: "a",
      }),
      row({ id: "t2", type: "task", name: "loose-task", sortKey: "b" }),
    ]);
    expect(names(withoutDeadline)).toEqual(["loose-task", "urgent-task"]);

    const withDeadline = build([
      row({
        id: "p1",
        type: "project",
        name: "P1",
        deadline: dayOut(-1),
        sortKey: "a",
      }),
      row({
        id: "t1",
        type: "task",
        parentId: "p1",
        name: "urgent-task",
        sortKey: "a",
      }),
      row({ id: "t2", type: "task", name: "loose-task", sortKey: "b" }),
    ]);
    expect(names(withDeadline)).toEqual(["urgent-task", "loose-task"]);
  });

  it("carries the ancestor path as a breadcrumb", () => {
    const items = build([
      row({ id: "area", type: "result_area", name: "Work", sortKey: "a" }),
      row({ id: "p", type: "project", parentId: "area", name: "ACME", sortKey: "a" }),
      row({ id: "t", type: "task", parentId: "p", name: "Call", sortKey: "a" }),
    ]);
    expect(items[0].breadcrumb).toEqual(["Work", "ACME"]);
    expect(items[0].projectId).toBe("p");
  });

  it("inherits importance from the nearest result area", () => {
    const important = build([
      row({ id: "area", type: "result_area", importance: 100, sortKey: "a" }),
      row({ id: "t", type: "task", parentId: "area", name: "t", sortKey: "a" }),
    ]);
    const ignored = build([
      row({ id: "area", type: "result_area", importance: 0, sortKey: "a" }),
      row({ id: "t", type: "task", parentId: "area", name: "t", sortKey: "a" }),
    ]);
    expect(important[0].score).toBeGreaterThan(ignored[0].score);
  });

  it("breaks score ties on the tighter deadline, then the name", () => {
    const items = build([
      row({ id: "a", type: "task", name: "zeta", sortKey: "a" }),
      row({ id: "b", type: "task", name: "alpha", sortKey: "b" }),
    ]);
    expect(names(items)).toEqual(["alpha", "zeta"]);
  });
});

describe("views", () => {
  it("gives every view a distinct id and a settings default", () => {
    const ids = CHOOSER_VIEWS.map((view) => view.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const view of CHOOSER_VIEWS) {
      expect(defaultSettings(view.id).weights).toEqual(view.weights);
    }
  });

  it("falls back to Best Overall for an id it does not know", () => {
    expect(chooserView("nonsense" as ChooserViewId).id).toBe("best-overall");
  });

  it("Deadlines keeps only work with a deadline in its chain", () => {
    const items = build(
      [
        row({ id: "p", type: "project", name: "P", deadline: dayOut(5), sortKey: "a" }),
        row({ id: "t1", type: "task", parentId: "p", name: "inherits", sortKey: "a" }),
        row({ id: "t2", type: "task", name: "no-deadline", sortKey: "b" }),
        row({ id: "t3", type: "task", name: "own", deadline: dayOut(2), sortKey: "c" }),
      ],
      "deadlines",
    );
    expect(names(items).sort()).toEqual(["inherits", "own"]);
  });

  it("Urgent lets a merely-due-soon D outrank a calm A1, where Best Overall does not", () => {
    // An *overdue* item already outranks a calm A1 under the default weights (see
    // score.test.ts) — that is deliberate. What separates Urgent is that a deadline still
    // days away is enough to do it.
    const rows = [
      row({
        id: "a",
        type: "task",
        name: "calm-A1",
        priorityLetter: "A",
        priorityRank: 1,
        sortKey: "a",
      }),
      row({
        id: "b",
        type: "task",
        name: "due-soon-D",
        priorityLetter: "D",
        deadline: dayOut(5),
        sortKey: "b",
      }),
    ];
    expect(names(build(rows, "best-overall"))[0]).toBe("calm-A1");
    expect(names(build(rows, "urgent"))[0]).toBe("due-soon-D");
  });

  it("To-do List shows everything available, since it is where you rank it", () => {
    // Deliberately unfiltered beyond state: you cannot drag a task into your A list if
    // the view hides it until it is already urgent.
    const items = build(
      [
        row({ id: "a", type: "task", name: "focused", focus: true, sortKey: "a" }),
        row({
          id: "b",
          type: "task",
          name: "started",
          state: "in_progress",
          sortKey: "b",
        }),
        row({ id: "e", type: "task", name: "someday", sortKey: "e" }),
        row({
          id: "f",
          type: "task",
          name: "far-off",
          deadline: dayOut(20),
          sortKey: "f",
        }),
      ],
      "todo-list",
    );
    expect(names(items).sort()).toEqual(["far-off", "focused", "someday", "started"]);
  });
});

describe("applyNextActionFilter", () => {
  const rows = [
    row({ id: "p", type: "project", name: "P", sortKey: "a" }),
    // Topmost in the project, but the lower-scoring of the two.
    row({
      id: "t1",
      type: "task",
      parentId: "p",
      name: "topmost",
      priorityLetter: "C",
      sortKey: "a",
    }),
    row({
      id: "t2",
      type: "task",
      parentId: "p",
      name: "best",
      priorityLetter: "A",
      sortKey: "b",
    }),
    row({ id: "loose", type: "task", name: "loose", priorityLetter: "B" }),
  ];

  it("keeps the project's highest outline-priority item(s), not outline order", () => {
    // "topmost" is C but first in the tree; "best" is A — next action is priority order.
    const items = build(rows, "next-action", {
      onlyNextAction: true,
      useTaskPriorityOrder: true,
    });
    expect(names(items).sort()).toEqual(["best", "loose"]);
  });

  it("keeps every task that shares the top priority under a project", () => {
    const multi = [
      row({ id: "p", type: "project", name: "P", sortKey: "a" }),
      row({
        id: "a1",
        type: "task",
        parentId: "p",
        name: "first-A1",
        priorityLetter: "A",
        priorityRank: 1,
        sortKey: "a",
      }),
      row({
        id: "a1b",
        type: "task",
        parentId: "p",
        name: "second-A1",
        priorityLetter: "A",
        priorityRank: 1,
        sortKey: "b",
      }),
      row({
        id: "a2",
        type: "task",
        parentId: "p",
        name: "A2",
        priorityLetter: "A",
        priorityRank: 2,
        sortKey: "c",
      }),
    ];
    const items = build(multi, "next-action", {
      onlyNextAction: true,
      useTaskPriorityOrder: true,
    });
    expect(names(items).sort()).toEqual(["first-A1", "second-A1"]);
  });

  it("keeps the project's highest-scoring item when priority order is off", () => {
    const items = build(rows, "next-action", {
      onlyNextAction: true,
      useTaskPriorityOrder: false,
    });
    expect(names(items).sort()).toEqual(["best", "loose"]);
  });

  it("never drops work that has no project ancestor", () => {
    // Since the hierarchy relaxation, a task need not live under a project at all;
    // collapsing per project must not silently swallow loose work.
    const items = build(rows, "next-action", { onlyNextAction: true });
    expect(names(items)).toContain("loose");
  });

  it("leaves one item per project untouched", () => {
    const items = build(
      [
        row({ id: "p1", type: "project", name: "P1", sortKey: "a" }),
        row({ id: "a", type: "task", parentId: "p1", name: "a", sortKey: "a" }),
        row({ id: "p2", type: "project", name: "P2", sortKey: "b" }),
        row({ id: "b", type: "task", parentId: "p2", name: "b", sortKey: "a" }),
      ],
      "next-action",
      { onlyNextAction: true },
    );
    expect(names(items).sort()).toEqual(["a", "b"]);
  });

  it("preserves chooser order", () => {
    const items = build(rows, "next-action", {
      onlyNextAction: true,
      useTaskPriorityOrder: true,
    });
    // "best" is A, "loose" is B — score order among the survivors.
    expect(names(items)).toEqual(["best", "loose"]);
  });

  it("treats a parent whose children are all completed as a leaf", () => {
    // Achieve: include items with no children or only completed children.
    const tree = [
      row({ id: "p", type: "project", name: "Done kids", sortKey: "a" }),
      row({
        id: "t",
        type: "task",
        parentId: "p",
        name: "Finished",
        state: "completed",
        sortKey: "a",
      }),
    ];
    const items = build(tree, "best-overall", {
      states: ["not_started", "in_progress", "completed"],
    });
    // Project is now a chooser candidate; completed child can appear if states allow.
    expect(names(items)).toContain("Done kids");
  });

  it("is a no-op on an empty list", () => {
    expect(applyNextActionFilter([], { useTaskPriorityOrder: true })).toEqual([]);
  });
});

describe("applyDateFilter", () => {
  const items = build([
    row({ id: "a", type: "task", name: "overdue", deadline: dayOut(-3), sortKey: "a" }),
    row({ id: "b", type: "task", name: "today", deadline: dayOut(0), sortKey: "b" }),
    row({
      id: "c",
      type: "task",
      name: "next-week",
      deadline: dayOut(6),
      sortKey: "c",
    }),
    row({
      id: "d",
      type: "task",
      name: "next-month",
      deadline: dayOut(25),
      sortKey: "d",
    }),
    row({
      id: "e",
      type: "task",
      name: "slipped",
      targetEnd: dayOut(-2),
      sortKey: "e",
    }),
    row({
      id: "f",
      type: "task",
      name: "future-start",
      targetStart: dayOut(40),
      sortKey: "f",
    }),
    row({
      id: "g",
      type: "task",
      name: "in-progress",
      state: "in_progress",
      sortKey: "g",
    }),
  ]);

  function filtered(filter: Parameters<typeof applyDateFilter>[1]): string[] {
    return names(applyDateFilter(items, filter, TODAY)).sort();
  }

  it("passes everything through for None and Group By Deadline", () => {
    expect(applyDateFilter(items, "none", TODAY)).toHaveLength(items.length);
    expect(applyDateFilter(items, "group-by-deadline", TODAY)).toHaveLength(
      items.length,
    );
  });

  it("Overdue takes only past deadlines", () => {
    expect(filtered("overdue")).toEqual(["overdue"]);
  });

  it("Behind Schedule takes a past deadline or a past target end", () => {
    expect(filtered("behind")).toEqual(["overdue", "slipped"]);
  });

  it("Due Soon reaches a week out", () => {
    expect(filtered("due-soon")).toEqual(["next-week", "overdue", "slipped", "today"]);
  });

  it("the Next N Days bands widen as N grows", () => {
    const seven = filtered("next-7");
    const fourteen = filtered("next-14");
    const thirty = filtered("next-30");

    expect(seven.length).toBeLessThanOrEqual(fourteen.length);
    expect(fourteen.length).toBeLessThanOrEqual(thirty.length);
    // Only the 25-day deadline sits between the 14- and 30-day bands.
    expect(thirty).toContain("next-month");
    expect(fourteen).not.toContain("next-month");
    // A start date 40 days out is outside all three.
    expect(thirty).not.toContain("future-start");
  });

  it("Current takes started work and work with no start date established", () => {
    const current = filtered("current");
    expect(current).toContain("in-progress");
    // No target start set at all counts as available now, per the manual.
    expect(current).toContain("overdue");
    // A start date still in the future does not.
    expect(current).not.toContain("future-start");
  });

  it("never changes a surviving item's score", () => {
    // The manual is explicit that the date filter is display-only.
    const before = new Map(items.map((item) => [item.node.id, item.score]));
    for (const filter of [
      "current",
      "overdue",
      "behind",
      "due-soon",
      "next-7",
    ] as const) {
      for (const item of applyDateFilter(items, filter, TODAY)) {
        expect(item.score).toBe(before.get(item.node.id));
      }
    }
  });
});

describe("chooserRows", () => {
  const items = build([
    row({ id: "a", type: "task", name: "overdue", deadline: dayOut(-3), sortKey: "a" }),
    row({ id: "b", type: "task", name: "today", deadline: dayOut(0), sortKey: "b" }),
    row({ id: "c", type: "task", name: "later", deadline: dayOut(40), sortKey: "c" }),
    row({ id: "d", type: "task", name: "undated", sortKey: "d" }),
  ]);

  it("emits a flat node list when not grouping", () => {
    const rows = chooserRows(items, "none", TODAY);
    expect(rows).toHaveLength(items.length);
    expect(rows.every((r) => r.kind === "node")).toBe(true);
  });

  it("groups by deadline band, most urgent first, skipping empty bands", () => {
    const rows = chooserRows(items, "group-by-deadline", TODAY);
    const groups = rows.filter((r) => r.kind === "group");

    expect(groups.map((g) => (g.kind === "group" ? g.label : ""))).toEqual([
      "Overdue",
      "Today",
      "Later",
      "No Deadline",
    ]);
    // Every item still appears exactly once.
    expect(rows.filter((r) => r.kind === "node")).toHaveLength(items.length);
    for (const group of groups) {
      if (group.kind === "group") expect(group.count).toBe(1);
    }
  });
});

describe("To-do List — TC priority ordering", () => {
  /** Focused so every row survives the view's keep-filter; TC order is what's under test. */
  function todo(partial: Omit<Parameters<typeof row>[0], "type">) {
    return row({ ...partial, type: "task", focus: true });
  }

  it("puts hand-ranked work first, in the order it was ranked", () => {
    const items = build(
      [
        todo({ id: "a", name: "third", tcPriorityLetter: "B", tcPriorityRank: 1 }),
        todo({ id: "b", name: "first", tcPriorityLetter: "A", tcPriorityRank: 1 }),
        todo({ id: "c", name: "second", tcPriorityLetter: "A", tcPriorityRank: 2 }),
      ],
      "todo-list",
    );
    expect(names(items)).toEqual(["first", "second", "third"]);
  });

  it("ignores the score among ranked items — the order is what you dragged", () => {
    // The whole point: a D you ranked A1 stays above an A1 you never ranked.
    const items = build(
      [
        todo({
          id: "a",
          name: "hand-ranked-D",
          priorityLetter: "D",
          tcPriorityLetter: "A",
          tcPriorityRank: 1,
        }),
        todo({
          id: "b",
          name: "unranked-A1",
          priorityLetter: "A",
          priorityRank: 1,
          tcPriorityLetter: "B",
          tcPriorityRank: 1,
        }),
      ],
      "todo-list",
    );
    expect(names(items)).toEqual(["hand-ranked-D", "unranked-A1"]);
  });

  it("sinks unranked work below every ranked item, ordered by score among itself", () => {
    const items = build(
      [
        todo({ id: "a", name: "unranked-low", priorityLetter: "C" }),
        todo({ id: "b", name: "ranked", tcPriorityLetter: "D", tcPriorityRank: 1 }),
        todo({ id: "c", name: "unranked-high", priorityLetter: "A", priorityRank: 1 }),
      ],
      "todo-list",
    );
    // The D you ranked beats both, then the untriaged tail falls back to score order.
    expect(names(items)).toEqual(["ranked", "unranked-high", "unranked-low"]);
  });

  it("leaves the score views ordering by score, not TC priority", () => {
    const rows = [
      row({
        id: "a",
        type: "task",
        name: "tc-ranked-D",
        priorityLetter: "D",
        tcPriorityLetter: "A",
        tcPriorityRank: 1,
        sortKey: "a",
      }),
      row({
        id: "b",
        type: "task",
        name: "plain-A1",
        priorityLetter: "A",
        priorityRank: 1,
        sortKey: "b",
      }),
    ];
    expect(names(build(rows, "best-overall"))).toEqual(["plain-A1", "tc-ranked-D"]);
  });
});

describe("chooserRows — TC letter grouping", () => {
  const items = build(
    [
      row({
        id: "a",
        type: "task",
        name: "a1",
        focus: true,
        tcPriorityLetter: "A",
        tcPriorityRank: 1,
        sortKey: "a",
      }),
      row({
        id: "b",
        type: "task",
        name: "c1",
        focus: true,
        tcPriorityLetter: "C",
        tcPriorityRank: 1,
        sortKey: "b",
      }),
      row({ id: "c", type: "task", name: "loose", focus: true, sortKey: "c" }),
    ],
    "todo-list",
  );

  function groupLabels(rows: ReturnType<typeof chooserRows>): string[] {
    return rows.flatMap((r) => (r.kind === "group" ? [r.label] : []));
  }

  it("emits a header for every letter, including empty ones", () => {
    // The empty header is the drop target that creates the first item in a letter —
    // hiding it would make "drag it to B" impossible exactly when B is empty.
    const rows = chooserRows(items, "none", TODAY, true);
    expect(groupLabels(rows)).toEqual(["A", "B", "C", "D", "Unranked"]);
  });

  it("counts each letter and files every item exactly once", () => {
    const rows = chooserRows(items, "none", TODAY, true);
    const counts = Object.fromEntries(
      rows.flatMap((r) => (r.kind === "group" ? [[r.label, r.count]] : [])),
    );
    expect(counts).toEqual({ A: 1, B: 0, C: 1, D: 0, Unranked: 1 });
    expect(rows.filter((r) => r.kind === "node")).toHaveLength(3);
  });

  it("omits the Unranked header when everything is ranked", () => {
    const allRanked = build(
      [
        row({
          id: "a",
          type: "task",
          name: "a1",
          focus: true,
          tcPriorityLetter: "A",
          tcPriorityRank: 1,
        }),
      ],
      "todo-list",
    );
    expect(groupLabels(chooserRows(allRanked, "none", TODAY, true))).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
  });

  it("lets an explicit Group By Deadline win over letter grouping", () => {
    // Two sets of headers at once would be nonsense, and the user reached for that
    // control on purpose.
    const rows = chooserRows(items, "group-by-deadline", TODAY, true);
    expect(groupLabels(rows)).toEqual(["No Deadline"]);
  });

  it("stays flat when the view does not use TC priority", () => {
    const rows = chooserRows(items, "none", TODAY, false);
    expect(rows.every((r) => r.kind === "node")).toBe(true);
  });
});

describe("state filtering", () => {
  const everyState = nodeStateEnum.enumValues;

  it("hides completed and cancelled work by default in every view", () => {
    // The guarantee: you never have to configure your way out of seeing finished work.
    for (const view of CHOOSER_VIEWS) {
      expect(defaultSettings(view.id).states).not.toContain("completed");
      expect(defaultSettings(view.id).states).not.toContain("cancelled");
      expect(defaultSettings(view.id).states).not.toContain("postponed");
    }
  });

  it("shows only what is ticked", () => {
    const rows = everyState.map((state, index) =>
      row({ id: state, type: "task", name: state, state, sortKey: `s${index}` }),
    );

    const onlyStarted = build(rows, "best-overall", { states: ["in_progress"] });
    expect(names(onlyStarted)).toEqual(["in_progress"]);

    const two = build(rows, "best-overall", { states: ["not_started", "waiting"] });
    expect(names(two).sort()).toEqual(["not_started", "waiting"]);
  });

  it("can be configured to show completed work, rather than forbidding it", () => {
    // Off by default, but inspectable and reachable — a hidden rule you cannot see is
    // worse than a checkbox you will not tick.
    const rows = [row({ id: "c", type: "task", name: "done", state: "completed" })];
    expect(names(build(rows, "best-overall"))).toEqual([]);
    expect(names(build(rows, "best-overall", { states: ["completed"] }))).toEqual([
      "done",
    ]);
  });

  it("empties the view when nothing is ticked", () => {
    const rows = [row({ id: "a", type: "task", name: "a", sortKey: "a" })];
    expect(build(rows, "best-overall", { states: [] })).toEqual([]);
  });

  it("limits the To-do List to work that is actionable by you now", () => {
    // Waiting / delegated / should-delegate are blocked on somebody else, and proposed is
    // not committed to — none belong on the list you work down today.
    expect(defaultSettings("todo-list").states).toEqual(["not_started", "in_progress"]);
    for (const blocked of ["waiting", "delegated", "should_delegate", "proposed"]) {
      expect(defaultSettings("todo-list").states).not.toContain(blocked);
    }
  });

  it("leaves the other views showing delegated and proposed work", () => {
    for (const id of ["best-overall", "next-action", "urgent", "deadlines"] as const) {
      expect(defaultSettings(id).states).toContain("waiting");
      expect(defaultSettings(id).states).toContain("proposed");
    }
  });
});
