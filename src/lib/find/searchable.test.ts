import { describe, expect, it } from "vitest";
import { fromDateKey } from "@/lib/schedule/geometry";
import type { OutlineNode } from "@/lib/tree/types";
import { makeMatcher, type Matcher } from "./matcher";
import type { FindCorpus } from "./queries";
import { searchCorpus } from "./searchable";
import {
  DEFAULT_INCLUDE_OPTIONS,
  DEFAULT_MATCH_OPTIONS,
  FIND_FIELD_CLASSES,
  FIND_RESULT_CAP,
  FIND_SOURCE_IDS,
  type FindFieldClass,
  type FindIncludeOptions,
  type FindSourceId,
} from "./types";

const TODAY = "2026-08-18";

function matcherFor(query: string): Matcher {
  const built = makeMatcher(query, DEFAULT_MATCH_OPTIONS);
  if (!built.ok) throw new Error(built.error);
  return built.match;
}

function emptyCorpus(): FindCorpus {
  return {
    outline: [],
    outlineDetails: [],
    nodeItems: [],
    notes: [],
    appointments: [],
    contacts: [],
    contactItems: [],
    resources: [],
    jobs: [],
    residences: [],
    lifeEvents: [],
    metrics: [],
    exercises: [],
    workoutSessions: [],
    sessionExercises: [],
    transactions: [],
    financeAccounts: [],
    financePayees: [],
    budgetEnvelopes: [],
  };
}

/** Only the handful of `OutlineNode` fields this module reads; the rest are inert here. */
function node(over: Partial<OutlineNode> & { id: string }): OutlineNode {
  return {
    parentId: null,
    type: "task",
    name: "",
    notes: "",
    state: "not_started",
    contexts: [],
    shelf: null,
    ...over,
  } as OutlineNode;
}

function run(
  corpus: Partial<FindCorpus>,
  query: string,
  over: {
    sources?: readonly FindSourceId[];
    fieldClasses?: readonly FindFieldClass[];
    include?: FindIncludeOptions;
    today?: string | null;
  } = {},
) {
  return searchCorpus({ ...emptyCorpus(), ...corpus }, matcherFor(query), {
    sources: over.sources ?? FIND_SOURCE_IDS,
    fieldClasses: over.fieldClasses ?? FIND_FIELD_CLASSES,
    include: over.include ?? DEFAULT_INCLUDE_OPTIONS,
    today: over.today ?? TODAY,
  });
}

describe("one result per record", () => {
  it("collapses three matching fields into one row naming all three", () => {
    // Achieve lists the same record once per matching field. This is the divergence.
    const outcome = run(
      {
        outline: [node({ id: "n1", name: "Foo plan", notes: "more foo here" })],
        outlineDetails: [{ nodeId: "n1", label: "Description", value: "foo again" }],
      },
      "foo",
    );

    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0].hits.map((hit) => hit.label)).toEqual([
      "Name",
      "Notes",
      "Description",
    ]);
  });

  it("gives a record a stable id namespaced by kind", () => {
    const outcome = run({ outline: [node({ id: "n1", name: "foo" })] }, "foo");
    expect(outcome.results[0].id).toBe("task:n1");
  });

  it("shows the first hit's snippet, which is the name when the name matched", () => {
    const outcome = run(
      { outline: [node({ id: "n1", name: "foo plan", notes: "unrelated foo" })] },
      "foo",
    );
    expect(outcome.results[0].hits[0].snippet).toBe("foo plan");
  });
});

describe("field classes", () => {
  it("skips detail text when only names are searched", () => {
    const corpus = {
      outline: [node({ id: "n1", name: "quiet", notes: "loud foo" })],
    };
    expect(run(corpus, "foo").results).toHaveLength(1);
    expect(run(corpus, "foo", { fieldClasses: ["name"] }).results).toHaveLength(0);
  });

  it("treats every field of a sub-record as sub-record text, its title included", () => {
    const corpus: Partial<FindCorpus> = {
      outline: [node({ id: "n1", name: "Project" })],
      nodeItems: [
        {
          ...blankNodeItem(),
          id: "i1",
          nodeId: "n1",
          kind: "objective",
          ownerName: "Project",
          title: "foo objective",
        },
      ],
    };
    // The title of a sub-record is not a "name" — the class asks whether to look inside
    // child lists at all, which is the question Achieve's Subrecords checkbox asked.
    expect(
      run(corpus, "foo", { fieldClasses: ["name", "detail"] }).results,
    ).toHaveLength(0);
    expect(run(corpus, "foo", { fieldClasses: ["subrecord"] }).results).toHaveLength(1);
  });
});

describe("sources", () => {
  it("ignores a record whose source is not selected", () => {
    const corpus = { notes: [noteRow("nt1", "foo")] };
    expect(run(corpus, "foo").results).toHaveLength(1);
    expect(run(corpus, "foo", { sources: ["outline"] }).results).toHaveLength(0);
  });

  it("finds a payee by display name, notes, and normalized alias", () => {
    const payee = {
      id: "payee-1",
      name: "1Password",
      notes: "Family password manager",
      aliases: ["1PASSWORDTORONTOON"],
    };

    expect(run({ financePayees: [payee] }, "1Password").results[0]).toMatchObject({
      kind: "finance_payee",
      recordId: "payee-1",
      where: "Finances ▸ Payees",
    });
    expect(run({ financePayees: [payee] }, "TORONTO").results[0]?.hits[0]?.label).toBe(
      "Aliases",
    );
    expect(
      run({ financePayees: [payee] }, "password manager").results[0]?.hits[0]?.label,
    ).toBe("Notes");
  });
});

describe("include toggles", () => {
  it("hides completed and cancelled nodes until Completed is ticked", () => {
    const corpus = {
      outline: [
        node({ id: "n1", name: "foo done", state: "completed" }),
        node({ id: "n2", name: "foo cancelled", state: "cancelled" }),
        node({ id: "n3", name: "foo open", state: "in_progress" }),
      ],
    };
    expect(run(corpus, "foo").results.map((r) => r.recordId)).toEqual(["n3"]);
    expect(
      run(corpus, "foo", {
        include: { ...DEFAULT_INCLUDE_OPTIONS, completed: true },
      }).results,
    ).toHaveLength(3);
  });

  it("never hides a Result Area, which has no state to complete", () => {
    const corpus = {
      outline: [node({ id: "ra", type: "result_area", name: "foo area", state: null })],
    };
    expect(run(corpus, "foo").results).toHaveLength(1);
  });

  it("hides a node whose shelf still holds until Shelved is ticked", () => {
    const held = node({
      id: "n1",
      name: "foo later",
      shelf: { until: fromDateKey("2026-09-01"), sourceId: "n1" },
    });
    const expired = node({
      id: "n2",
      name: "foo back",
      shelf: { until: fromDateKey("2026-08-01"), sourceId: "n2" },
    });

    // An expired shelf is not a shelf — expiry is derived, not swept.
    expect(
      run({ outline: [held, expired] }, "foo").results.map((r) => r.recordId),
    ).toEqual(["n2"]);
    expect(
      run({ outline: [held, expired] }, "foo", {
        include: { ...DEFAULT_INCLUDE_OPTIONS, shelved: true },
      }).results,
    ).toHaveLength(2);
  });

  it("hides sub-records of a hidden node along with it", () => {
    const corpus: Partial<FindCorpus> = {
      outline: [node({ id: "n1", name: "Done project", state: "completed" })],
      nodeItems: [
        {
          ...blankNodeItem(),
          id: "i1",
          nodeId: "n1",
          kind: "objective",
          ownerName: "Done project",
          title: "foo objective",
        },
      ],
    };
    expect(run(corpus, "foo").results).toHaveLength(0);
    expect(
      run(corpus, "foo", { include: { ...DEFAULT_INCLUDE_OPTIONS, completed: true } })
        .results,
    ).toHaveLength(1);
  });

  it("hides appointments before today until Shelved is ticked", () => {
    const corpus: Partial<FindCorpus> = {
      appointments: [
        appointmentRow("a1", "foo past", "2026-08-01"),
        appointmentRow("a2", "foo today", TODAY),
        appointmentRow("a3", "foo future", "2026-09-01"),
      ],
    };
    // Today's appointment counts as present, not past. Compared as a set: ranking is a
    // separate concern and sorts these by name.
    expect(
      run(corpus, "foo")
        .results.map((r) => r.recordId)
        .sort(),
    ).toEqual(["a2", "a3"]);
    expect(
      run(corpus, "foo", { include: { ...DEFAULT_INCLUDE_OPTIONS, shelved: true } })
        .results,
    ).toHaveLength(3);
  });
});

describe("where", () => {
  it("names the ancestor chain of a node, root first, under the module", () => {
    const outcome = run(
      {
        outline: [
          node({ id: "ra", type: "result_area", name: "Health", state: null }),
          node({ id: "p", type: "project", parentId: "ra", name: "Lifting" }),
          node({ id: "t", parentId: "p", name: "foo set" }),
        ],
      },
      "foo",
    );
    expect(outcome.results[0].where).toBe("Plan ▸ Health ▸ Lifting");
  });

  it("survives a parent cycle instead of looping forever", () => {
    // Not reachable through the UI, but a search has no timeout and a corrupt chain would
    // hang the request rather than return a wrong answer.
    const outcome = run(
      {
        outline: [
          node({ id: "a", parentId: "b", name: "foo" }),
          node({ id: "b", parentId: "a", name: "B" }),
        ],
      },
      "foo",
    );
    expect(outcome.results[0].where).toBe("Plan ▸ B");
  });
});

describe("naming", () => {
  it("falls back to (untitled) rather than an empty cell", () => {
    const outcome = run({ notes: [noteRow("nt1", "", "foo body")] }, "foo");
    expect(outcome.results[0].name).toBe("(untitled)");
  });

  it("labels a sub-record with what it actually is", () => {
    const outcome = run(
      {
        outline: [node({ id: "n1", name: "P" })],
        nodeItems: [
          {
            ...blankNodeItem(),
            id: "i1",
            nodeId: "n1",
            kind: "risk",
            ownerName: "P",
            title: "foo risk",
          },
        ],
      },
      "foo",
    );
    expect(outcome.results[0].typeLabel).toBe("Risk");
  });
});

describe("ranking and the cap", () => {
  it("puts name hits above detail hits above sub-record hits", () => {
    const outcome = run(
      {
        outline: [
          node({ id: "n1", name: "zzz", notes: "foo in notes" }),
          node({ id: "n2", name: "foo in name" }),
        ],
        nodeItems: [
          {
            ...blankNodeItem(),
            id: "i1",
            nodeId: "n2",
            kind: "objective",
            ownerName: "foo in name",
            title: "foo item",
          },
        ],
      },
      "foo",
    );
    expect(outcome.results.map((r) => r.recordId)).toEqual(["n2", "n1", "i1"]);
  });

  it("caps the list and says so, keeping the total", () => {
    const many = Array.from({ length: FIND_RESULT_CAP + 5 }, (_, index) =>
      noteRow(`nt${index}`, `foo ${index}`),
    );
    const outcome = run({ notes: many }, "foo");

    expect(outcome.results).toHaveLength(FIND_RESULT_CAP);
    expect(outcome.totalMatched).toBe(FIND_RESULT_CAP + 5);
    expect(outcome.capped).toBe(true);
  });

  it("does not claim to be capped at exactly the cap", () => {
    const exact = Array.from({ length: FIND_RESULT_CAP }, (_, index) =>
      noteRow(`nt${index}`, `foo ${index}`),
    );
    expect(run({ notes: exact }, "foo").capped).toBe(false);
  });
});

describe("no matches", () => {
  it("returns an empty outcome rather than throwing", () => {
    const outcome = run({ outline: [node({ id: "n1", name: "nothing here" })] }, "foo");
    expect(outcome).toEqual({ results: [], totalMatched: 0, capped: false });
  });
});

function noteRow(id: string, title: string, body = "") {
  return { id, title, subject: "", body, contexts: [] };
}

function appointmentRow(id: string, subject: string, day: string) {
  return {
    id,
    subject,
    location: "",
    notes: "",
    contexts: [],
    startAt: fromDateKey(day),
  };
}

function blankNodeItem() {
  return {
    id: "",
    nodeId: "",
    kind: "objective" as const,
    ownerName: "",
    title: "",
    description: "",
    criteria: "",
    stakeholders: "",
    stake: "",
    detection: "",
    prevention: "",
    mitigation: "",
    advantages: "",
    disadvantages: "",
    decision: "",
    idealCandidate: "",
    candidates: "",
    filledBy: "",
    association: "",
    contact: "",
    source: "",
    resolution: "",
    url: "",
    purpose: "",
    strategy: "",
    people: "",
    conditions: "",
    reason: "",
    category: "",
    question: "",
    target: "",
    assignedTo: "",
    comments: "",
  };
}
