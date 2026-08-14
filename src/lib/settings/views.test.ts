import { describe, expect, it } from "vitest";
import { isValidScope } from "./scopes";
import {
  addSavedView,
  baseViewId,
  findSavedView,
  isValidViewId,
  MAX_SAVED_VIEWS,
  NO_SAVED_VIEWS,
  parseSavedViews,
  removeSavedView,
  reconcileDefaultViews,
  renameSavedView,
  restoreDefaultViews,
  serializeSavedViews,
  uniqueViewName,
  updateSavedView,
  viewSnapshotEquals,
  type SavedView,
  type SavedViewSettings,
  type SavedViews,
} from "./views";

function view(id: string, name = id): SavedView {
  return {
    id,
    name,
    base: null,
    order: null,
    widths: {},
    filters: {},
    advancedFilter: null,
    search: "",
    sorts: [],
    groupBy: [],
    collapsedGroups: [],
    density: "comfortable",
    switches: {},
    defaultSeed: null,
  };
}

function saved(...views: SavedView[]): SavedViews {
  return { views, deletedDefaults: [] };
}

describe("isValidViewId", () => {
  it("accepts ids that survive being part of a scope key", () => {
    // The id becomes `grid:{tab}.{id}`, so a `.` would make `parseScope` ambiguous about
    // where the tab ends.
    expect(isValidViewId("saved-1a2b")).toBe(true);
    expect(isValidViewId("a")).toBe(true);
    expect(isValidViewId("my.view")).toBe(false);
    expect(isValidViewId("My-View")).toBe(false);
    expect(isValidViewId("-leading")).toBe(false);
    expect(isValidViewId("")).toBe(false);
    expect(isValidViewId("x".repeat(33))).toBe(false);
  });

  it("produces a scope the settings store will accept", () => {
    expect(isValidScope("grid:tasks.saved-1a2b")).toBe(true);
    expect(isValidScope("views:tasks")).toBe(true);
  });
});

describe("parseSavedViews", () => {
  it("falls back for anything that is not a view list", () => {
    for (const value of [null, undefined, 42, "views", [], { views: "no" }]) {
      expect(parseSavedViews(value)).toEqual(NO_SAVED_VIEWS);
    }
  });

  it("round-trips what it serializes", () => {
    const source = saved({
      id: "saved-1",
      name: "This week",
      base: "active-status",
      order: ["name", "deadline"],
      widths: { name: 280 },
      filters: { state: { mode: "options", ids: ["value:NS"] } },
      advancedFilter: {
        join: "and",
        conditions: [{ columnId: "purpose", op: "contains", value: "q1" }],
      },
      search: "report",
      sorts: [{ columnId: "deadline", direction: "desc" }],
      groupBy: ["project"],
      collapsedGroups: ["project:health"],
      density: "compact",
      switches: { nextActions: true, showPurpose: false },
      defaultSeed: null,
    });
    expect(parseSavedViews(serializeSavedViews(source))).toEqual(source);
  });

  it("keeps only boolean switches, so one junk value cannot cost the whole view", () => {
    const parsed = parseSavedViews({
      views: [
        {
          id: "a",
          name: "A",
          switches: { on: true, off: false, junk: "yes", missing: null },
        },
      ],
    });
    expect(parsed.views[0].switches).toEqual({ on: true, off: false });
  });

  it("drops a base that could never name a view", () => {
    expect(
      parseSavedViews({ views: [{ id: "a", name: "A", base: "has.dot" }] }).views[0]
        .base,
    ).toBeNull();
    expect(
      parseSavedViews({ views: [{ id: "a", name: "A" }] }).views[0].base,
    ).toBeNull();
  });

  it("drops entries that could not address a scope, rather than failing the list", () => {
    const parsed = parseSavedViews({
      views: [
        { id: "ok", name: "Fine" },
        { id: "has.dot", name: "Broken" },
        { id: "noname", name: "   " },
        "nonsense",
      ],
    });
    expect(parsed.views.map((v) => v.id)).toEqual(["ok"]);
  });

  it("keeps the first of a duplicated id", () => {
    // Two entries sharing an id would share one `grid:` scope and silently edit each other.
    const parsed = parseSavedViews({
      views: [
        { id: "dup", name: "First" },
        { id: "dup", name: "Second" },
      ],
    });
    expect(parsed.views).toHaveLength(1);
    expect(parsed.views[0].name).toBe("First");
  });

  it("honours an explicitly empty order, as every other stored order does", () => {
    expect(
      parseSavedViews({ views: [{ id: "a", name: "A", order: [] }] }).views[0].order,
    ).toEqual([]);
    expect(
      parseSavedViews({ views: [{ id: "a", name: "A" }] }).views[0].order,
    ).toBeNull();
  });

  it("fills in empty defaults for fields older views never stored", () => {
    // Views saved before sort/density/search/widths were captured must still open.
    const parsed = parseSavedViews({ views: [{ id: "a", name: "A" }] }).views[0];
    expect(parsed.advancedFilter).toBeNull();
    expect(parsed.search).toBe("");
    expect(parsed.sorts).toEqual([]);
    expect(parsed.widths).toEqual({});
    expect(parsed.collapsedGroups).toEqual([]);
    expect(parsed.density).toBe("comfortable");
  });

  it("keeps an advanced filter when present", () => {
    const filter = {
      join: "or",
      conditions: [{ columnId: "state", op: "eq", value: "NS" }],
    };
    expect(
      parseSavedViews({
        views: [{ id: "a", name: "A", advancedFilter: filter }],
      }).views[0].advancedFilter,
    ).toEqual(filter);
  });
});

describe("uniqueViewName", () => {
  it("leaves a free name alone", () => {
    expect(uniqueViewName(saved(view("a", "Mine")), "Yours")).toBe("Yours");
  });

  it("suffixes until it finds a gap", () => {
    const existing = saved(view("a", "Mine"), view("b", "Mine (2)"));
    expect(uniqueViewName(existing, "Mine")).toBe("Mine (3)");
  });

  it("names an empty request rather than storing a blank picker entry", () => {
    expect(uniqueViewName(NO_SAVED_VIEWS, "   ")).toBe("Untitled view");
  });
});

describe("addSavedView / removeSavedView / renameSavedView", () => {
  it("appends, and de-duplicates the name on the way in", () => {
    const first = addSavedView(NO_SAVED_VIEWS, view("a", "Mine"));
    const second = addSavedView(first, view("b", "Mine"));
    expect(second.views.map((v) => v.name)).toEqual(["Mine", "Mine (2)"]);
  });

  it("refuses a duplicate id", () => {
    const once = addSavedView(NO_SAVED_VIEWS, view("a"));
    expect(addSavedView(once, view("a"))).toBe(once);
  });

  it("stops at the cap rather than evicting silently", () => {
    let all = NO_SAVED_VIEWS;
    for (let i = 0; i < MAX_SAVED_VIEWS; i += 1) {
      all = addSavedView(all, view(`v${i}`));
    }
    expect(all.views).toHaveLength(MAX_SAVED_VIEWS);
    expect(addSavedView(all, view("one-more"))).toBe(all);
  });

  it("removes by id and leaves the rest in order", () => {
    const all = saved(view("a"), view("b"), view("c"));
    expect(removeSavedView(all, "b").views.map((v) => v.id)).toEqual(["a", "c"]);
  });

  it("renames without colliding with a different view", () => {
    const all = saved(view("a", "One"), view("b", "Two"));
    expect(renameSavedView(all, "a", "Two").views[0].name).toBe("Two (2)");
  });

  it("lets a view keep its own name when renamed to itself", () => {
    const all = saved(view("a", "One"));
    expect(renameSavedView(all, "a", "One").views[0].name).toBe("One");
  });
});

describe("findSavedView", () => {
  it("returns null for a built-in view id", () => {
    expect(findSavedView(saved(view("a")), "active-status")).toBeNull();
  });
});

describe("updateSavedView", () => {
  const settings = {
    order: ["name"],
    widths: { name: 200 },
    filters: { state: { mode: "options", ids: ["value:CO"] } } as SavedView["filters"],
    advancedFilter: {
      join: "and" as const,
      conditions: [{ columnId: "purpose", op: "contains" as const, value: "q1" }],
    },
    search: "q1",
    sorts: [{ columnId: "priority", direction: "asc" as const }],
    groupBy: ["project"],
    collapsedGroups: [] as string[],
    density: "compact" as const,
    switches: { nextActions: true },
  };

  it("writes the grid back without touching the view's identity", () => {
    // Replace writes the working set into a saved view you pick. Name, id and base stay.
    const before = saved({ ...view("saved-1", "This week"), base: "active-status" });
    const [after] = updateSavedView(before, "saved-1", settings).views;

    expect(after.name).toBe("This week");
    expect(after.id).toBe("saved-1");
    expect(after.base).toBe("active-status");
    expect(after.groupBy).toEqual(["project"]);
    expect(after.switches).toEqual({ nextActions: true });
    expect(after.advancedFilter).toEqual(settings.advancedFilter);
    expect(after.sorts).toEqual(settings.sorts);
    expect(after.density).toBe("compact");
    expect(after.search).toBe("q1");
  });

  it("leaves other views alone", () => {
    const before = saved(view("a"), view("b"));
    const after = updateSavedView(before, "a", settings);
    expect(after.views[1]).toEqual(before.views[1]);
  });
});

describe("viewSnapshotEquals", () => {
  const snap = (): SavedViewSettings => ({
    order: ["name", "effort"],
    widths: { name: 200 },
    filters: { state: { mode: "options", ids: ["open"] } },
    advancedFilter: null,
    search: "",
    sorts: [{ columnId: "name", direction: "asc" }],
    groupBy: ["area"],
    collapsedGroups: ["area:1", "area:2"],
    density: "comfortable",
    switches: { groups: true },
  });

  it("is true for the same snapshot", () => {
    expect(viewSnapshotEquals(snap(), snap())).toBe(true);
  });

  it("treats collapsed group order as irrelevant", () => {
    const left = { ...snap(), collapsedGroups: ["a", "b"] };
    const right = { ...snap(), collapsedGroups: ["b", "a"] };
    expect(viewSnapshotEquals(left, right)).toBe(true);
  });

  it("is false when a captured field drifts", () => {
    expect(viewSnapshotEquals(snap(), { ...snap(), search: "budget" })).toBe(false);
    expect(viewSnapshotEquals(snap(), { ...snap(), order: ["effort", "name"] })).toBe(
      false,
    );
  });
});

describe("baseViewId", () => {
  const builtIn = ["active-status", "completed", "all"];

  it("resolves a built-in to itself", () => {
    expect(
      baseViewId(NO_SAVED_VIEWS.views, "completed", builtIn, "active-status"),
    ).toBe("completed");
  });

  describe("default views", () => {
    const seed = {
      id: "active-status",
      name: "Active Status",
      base: "active-status",
      settings: {
        order: ["name"],
        widths: {},
        filters: {},
        advancedFilter: null,
        search: "",
        sorts: [],
        groupBy: [],
        collapsedGroups: [],
        density: "comfortable" as const,
        switches: {},
      },
    };

    it("reconciles missing defaults unless they were explicitly deleted", () => {
      const seeded = reconcileDefaultViews(NO_SAVED_VIEWS, [seed]);
      expect(seeded.views.find((entry) => entry.id === seed.id)?.defaultSeed).toEqual(seed);

      const removed = removeSavedView(seeded, seed.id);
      const afterDelete = reconcileDefaultViews(removed, [seed]);
      expect(afterDelete.views.some((entry) => entry.id === seed.id)).toBe(false);
    });

    it("restores default definitions and recreates deleted defaults", () => {
      const withDefault = reconcileDefaultViews(NO_SAVED_VIEWS, [seed]);
      const renamed = renameSavedView(withDefault, seed.id, "Changed");
      const restored = restoreDefaultViews(renamed);
      expect(restored.views.find((entry) => entry.id === seed.id)?.name).toBe(
        "Active Status",
      );

      const removed = removeSavedView(restored, seed.id);
      const recreated = restoreDefaultViews(removed);
      expect(recreated.views.some((entry) => entry.id === seed.id)).toBe(true);
    });
  });

  it("resolves a saved view to the built-in it was saved from", () => {
    const all = saved({ ...view("saved-1"), base: "completed" });
    expect(baseViewId(all.views, "saved-1", builtIn, "active-status")).toBe(
      "completed",
    );
  });

  it("falls back to the default for a view saved before base existed", () => {
    const all = saved({ ...view("saved-1"), base: null });
    expect(baseViewId(all.views, "saved-1", builtIn, "active-status")).toBe(
      "active-status",
    );
  });

  it("falls back for a base naming a preset this build no longer has", () => {
    const all = saved({ ...view("saved-1"), base: "retired-view" });
    // baseViewId follows base to "retired-view", which is not built-in and has no entry.
    expect(baseViewId(all.views, "saved-1", builtIn, "active-status")).toBe(
      "active-status",
    );
  });

  it("follows a chain from a hand-edited blob through to a built-in", () => {
    const all = saved(
      { ...view("mid"), base: "completed" },
      { ...view("leaf"), base: "mid" },
    );
    expect(baseViewId(all.views, "leaf", builtIn, "active-status")).toBe("completed");
  });

  it("terminates on a cycle instead of hanging", () => {
    const all = saved({ ...view("a"), base: "b" }, { ...view("b"), base: "a" });
    expect(baseViewId(all.views, "a", builtIn, "active-status")).toBe("active-status");
  });
});
