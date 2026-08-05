import { describe, expect, it } from "vitest";
import { derive } from "./derive";
import { row } from "./fixtures";
import {
  effectiveState,
  laterShelf,
  ownEffectiveState,
  ownShelf,
  shelfHolds,
  type Shelf,
} from "./shelving";

const TODAY = "2026-03-08";

/** Local midnight — same key space as `toDateKey` / DateField. */
function at(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shelf(until: string | null, sourceId = "n"): Shelf {
  return { until: until === null ? null : at(until), sourceId };
}

describe("ownShelf", () => {
  it("shelves only a postponed row", () => {
    expect(ownShelf({ id: "a", state: "postponed", deferredDate: null })).toEqual({
      until: null,
      sourceId: "a",
    });
    expect(ownShelf({ id: "a", state: "not_started", deferredDate: null })).toBeNull();
  });

  it("ignores a deferred date on a row that is not postponed", () => {
    // Expiry is derived, never swept, so a row un-postponed by hand keeps its old date.
    // The date on its own means nothing — the state is what shelves.
    expect(
      ownShelf({ id: "a", state: "in_progress", deferredDate: at("2099-01-01") }),
    ).toBeNull();
  });
});

describe("laterShelf", () => {
  it("takes the later of two dates", () => {
    expect(
      laterShelf(shelf("2026-04-01", "a"), shelf("2026-09-01", "b"))?.sourceId,
    ).toBe("b");
    expect(
      laterShelf(shelf("2026-09-01", "a"), shelf("2026-04-01", "b"))?.sourceId,
    ).toBe("a");
  });

  it("lets an indefinite shelf beat any date, from either side", () => {
    expect(laterShelf(shelf(null, "a"), shelf("2099-01-01", "b"))?.sourceId).toBe("a");
    expect(laterShelf(shelf("2099-01-01", "a"), shelf(null, "b"))?.sourceId).toBe("b");
  });

  it("passes through when only one side has a shelf", () => {
    expect(laterShelf(null, shelf("2026-04-01", "b"))?.sourceId).toBe("b");
    expect(laterShelf(shelf("2026-04-01", "a"), null)?.sourceId).toBe("a");
    expect(laterShelf(null, null)).toBeNull();
  });
});

describe("shelfHolds", () => {
  it("holds until the date arrives, then stops", () => {
    expect(shelfHolds(shelf("2026-03-09"), TODAY)).toBe(true);
    // A shelf expiring today is open all day, matching how deadlines are banded.
    expect(shelfHolds(shelf("2026-03-08"), TODAY)).toBe(false);
    expect(shelfHolds(shelf("2026-03-01"), TODAY)).toBe(false);
  });

  it("never expires an indefinite shelf", () => {
    expect(shelfHolds(shelf(null), TODAY)).toBe(true);
  });

  it("expires nothing before hydration, when today is unknown", () => {
    // Server and client must agree, so an unknown today treats every shelf as holding.
    expect(shelfHolds(shelf("2026-03-01"), null)).toBe(true);
  });
});

describe("effectiveState", () => {
  it("reads postponed while a shelf holds, whatever the stored state", () => {
    expect(effectiveState("not_started", shelf("2026-03-09"), TODAY)).toBe("postponed");
    expect(effectiveState("in_progress", shelf(null), TODAY)).toBe("postponed");
  });

  it("reads not_started again once a dated shelf expires", () => {
    // The whole point of deriving expiry: no sweep runs, so the stored state still says
    // postponed and the row is available anyway.
    expect(effectiveState("postponed", shelf("2026-03-01"), TODAY)).toBe("not_started");
  });

  it("lets finished work outrank a shelf", () => {
    expect(effectiveState("completed", shelf(null), TODAY)).toBe("completed");
    expect(effectiveState("cancelled", shelf(null), TODAY)).toBe("cancelled");
  });

  it("leaves an unshelved state alone", () => {
    expect(effectiveState("in_progress", null, TODAY)).toBe("in_progress");
    expect(effectiveState("waiting", null, TODAY)).toBe("waiting");
  });
});

describe("ownEffectiveState", () => {
  it("un-postpones a routine the morning after its shelf ran out", () => {
    // The case the whole model exists for: tick off "empty cat litter", recurrence shelves
    // it until tomorrow, and tomorrow it is simply due again — with nothing having written
    // to the row overnight. Reading the stored state here is what made a view filtering
    // Postponed out hide the routine forever.
    const routine = { id: "t", state: "postponed" as const, deferredDate: at(TODAY) };
    expect(ownEffectiveState(routine, TODAY)).toBe("not_started");
  });

  it("still reads postponed on the day it was shelved", () => {
    expect(
      ownEffectiveState(
        { id: "t", state: "postponed", deferredDate: at("2026-03-09") },
        TODAY,
      ),
    ).toBe("postponed");
  });

  it("keeps an undated shelf indefinitely", () => {
    expect(
      ownEffectiveState({ id: "t", state: "postponed", deferredDate: null }, TODAY),
    ).toBe("postponed");
  });

  it("ignores a shelf inherited from an ancestor", () => {
    // Unlike `effectiveState`. The State cell is an editor of this row's own field, so it
    // has to say what writing to it would change; the inherited shelf shows up in the
    // read-only Status column and in what the row hides with.
    const child = { id: "t", state: "in_progress" as const, deferredDate: null };
    expect(ownEffectiveState(child, TODAY)).toBe("in_progress");
  });

  it("treats nothing as expired before hydration", () => {
    // `today` is null on the server and on the first client render; both must agree.
    expect(
      ownEffectiveState(
        { id: "t", state: "postponed", deferredDate: at("2026-03-01") },
        null,
      ),
    ).toBe("postponed");
  });
});

describe("derive — inherited shelving", () => {
  /** Result area > project > task, with a shelf on whichever levels are given. */
  function tree(opts: {
    project?: { until: string | null };
    task?: { until: string | null };
    taskState?: "not_started" | "completed";
  }) {
    return derive([
      row({ id: "ra", type: "result_area" }),
      row({
        id: "p",
        type: "project",
        parentId: "ra",
        depth: 1,
        state: opts.project ? "postponed" : "not_started",
        deferredDate: opts.project?.until ? at(opts.project.until) : null,
      }),
      row({
        id: "t",
        type: "task",
        parentId: "p",
        depth: 2,
        state: opts.task ? "postponed" : (opts.taskState ?? "not_started"),
        deferredDate: opts.task?.until ? at(opts.task.until) : null,
      }),
    ]);
  }

  const taskIn = (nodes: ReturnType<typeof derive>) => nodes.find((n) => n.id === "t")!;

  it("passes an ancestor's shelf down and names its source", () => {
    const task = taskIn(tree({ project: { until: "2027-02-15" } }));
    expect(task.shelf?.sourceId).toBe("p");
    expect(shelfHolds(task.shelf, TODAY)).toBe(true);
  });

  it("keeps a descendant's later date over its ancestor's", () => {
    const task = taskIn(
      tree({ project: { until: "2026-04-01" }, task: { until: "2027-01-01" } }),
    );
    expect(task.shelf?.sourceId).toBe("t");
  });

  it("keeps an ancestor's later date over its descendant's", () => {
    const task = taskIn(
      tree({ project: { until: "2027-01-01" }, task: { until: "2026-04-01" } }),
    );
    expect(task.shelf?.sourceId).toBe("p");
  });

  it("lets an indefinitely shelved ancestor outrank a dated descendant", () => {
    const task = taskIn(
      tree({ project: { until: null }, task: { until: "2026-04-01" } }),
    );
    expect(task.shelf?.until).toBeNull();
  });

  it("contributes nothing from an ancestor whose shelf has expired", () => {
    const task = taskIn(tree({ project: { until: "2026-03-01" } }));
    expect(shelfHolds(task.shelf, TODAY)).toBe(false);
    expect(effectiveState(task.state, task.shelf, TODAY)).toBe("not_started");
  });

  it("still reads a completed task under a shelved project as completed", () => {
    const task = taskIn(
      tree({ project: { until: "2027-02-15" }, taskState: "completed" }),
    );
    expect(effectiveState(task.state, task.shelf, TODAY)).toBe("completed");
  });

  it("leaves an unshelved tree with no shelf at all", () => {
    expect(taskIn(tree({})).shelf).toBeNull();
  });
});
