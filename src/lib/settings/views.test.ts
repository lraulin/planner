import { describe, expect, it } from "vitest";
import { isValidScope } from "./scopes";
import {
  addSavedView,
  findSavedView,
  isValidViewId,
  MAX_SAVED_VIEWS,
  NO_SAVED_VIEWS,
  parseSavedViews,
  removeSavedView,
  renameSavedView,
  serializeSavedViews,
  uniqueViewName,
  type SavedView,
  type SavedViews,
} from "./views";

function view(id: string, name = id): SavedView {
  return { id, name, order: null, filters: {}, groupBy: [] };
}

function saved(...views: SavedView[]): SavedViews {
  return { views };
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
      order: ["name", "deadline"],
      filters: { state: { mode: "options", ids: ["value:NS"] } },
      groupBy: ["project"],
    });
    expect(parseSavedViews(serializeSavedViews(source))).toEqual(source);
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
    // Comparing against the list *including* the view being renamed would push it to
    // "One (2)" for changing nothing.
    const all = saved(view("a", "One"));
    expect(renameSavedView(all, "a", "One").views[0].name).toBe("One");
  });
});

describe("findSavedView", () => {
  it("returns null for a built-in view id", () => {
    expect(findSavedView(saved(view("a")), "active-status")).toBeNull();
  });
});
