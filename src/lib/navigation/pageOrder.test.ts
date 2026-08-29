import { describe, expect, it } from "vitest";
import { applyPageOrder, placePage } from "./pageOrder";
import type { PageEntry } from "./pages";

function pages(...ids: string[]): PageEntry[] {
  return ids.map((id) => ({
    id,
    label: id,
    segment: id,
    status: "built",
  }));
}

const PLAN = pages(
  "overview",
  "outline",
  "projects",
  "tasks",
  "goals",
  "wishes",
  "result-areas",
);

describe("applyPageOrder", () => {
  it("returns registry order when nothing is stored", () => {
    expect(applyPageOrder(PLAN, undefined).map((page) => page.id)).toEqual(
      PLAN.map((page) => page.id),
    );
    expect(applyPageOrder(PLAN, []).map((page) => page.id)).toEqual(
      PLAN.map((page) => page.id),
    );
  });

  it("keeps a stored permutation of the current pages", () => {
    expect(
      applyPageOrder(PLAN, [
        "tasks",
        "overview",
        "goals",
        "outline",
        "projects",
        "wishes",
        "result-areas",
      ]).map((page) => page.id),
    ).toEqual([
      "tasks",
      "overview",
      "goals",
      "outline",
      "projects",
      "wishes",
      "result-areas",
    ]);
  });

  it("drops unknown ids and never leaves a hole", () => {
    const registry = pages("dashboard", "budget", "register");
    expect(
      applyPageOrder(registry, [
        "dashboard",
        "gone",
        "budget",
        "insights",
        "register",
      ]).map((page) => page.id),
    ).toEqual(["dashboard", "budget", "register"]);
  });

  it("inserts a newly shipped page in its registry neighbourhood", () => {
    // Budget shipped after the user arranged Dashboard then Register.
    const registry = pages("dashboard", "budget", "register");
    expect(
      applyPageOrder(registry, ["dashboard", "register"]).map((page) => page.id),
    ).toEqual(["dashboard", "budget", "register"]);
  });

  it("places a new first page first", () => {
    expect(
      applyPageOrder(pages("day", "calendar", "agenda"), ["calendar", "agenda"]).map(
        (page) => page.id,
      ),
    ).toEqual(["day", "calendar", "agenda"]);
  });

  it("places a new page after predecessors as they are actually arranged", () => {
    // Tasks was dragged in front of Overview. A new Outline must not follow Tasks
    // just because the registry lists Tasks after it.
    const registry = pages("overview", "outline", "projects", "tasks");
    expect(
      applyPageOrder(registry, ["tasks", "overview", "projects"]).map(
        (page) => page.id,
      ),
    ).toEqual(["tasks", "overview", "outline", "projects"]);
  });

  it("keeps two new neighbours in registry order", () => {
    const registry = pages("a", "b", "c", "d");
    expect(applyPageOrder(registry, ["a", "d"]).map((page) => page.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("falls back to the registry when every stored id is unknown", () => {
    expect(
      applyPageOrder(pages("grid", "journal"), ["deleted", "also-gone"]).map(
        (page) => page.id,
      ),
    ).toEqual(["grid", "journal"]);
  });

  it("ignores duplicate stored ids", () => {
    expect(
      applyPageOrder(pages("a", "b", "c"), ["c", "a", "c", "b"]).map((page) => page.id),
    ).toEqual(["c", "a", "b"]);
  });
});

describe("placePage", () => {
  it("inserts a new id at the requested drop slot", () => {
    expect(placePage(["a", "c"], "b", 1)).toEqual(["a", "b", "c"]);
    expect(placePage(["a", "b"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(placePage(["a", "b"], "c", 99)).toEqual(["a", "b", "c"]);
  });

  it("moves an existing id using list-including drop slots", () => {
    // Drag c before a (slot 0).
    expect(placePage(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    // Drag a to the end (slot 3) or just before where c was after a left (slot 2).
    expect(placePage(["a", "b", "c"], "a", 3)).toEqual(["b", "c", "a"]);
    expect(placePage(["a", "b", "c"], "a", 2)).toEqual(["b", "a", "c"]);
    // Dropping on its own slot is a no-op.
    expect(placePage(["a", "b", "c"], "b", 1)).toEqual(["a", "b", "c"]);
    expect(placePage(["a", "b", "c"], "b", 2)).toEqual(["a", "b", "c"]);
  });
});
