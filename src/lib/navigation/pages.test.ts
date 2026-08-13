import { describe, expect, it } from "vitest";
import {
  builtPageById,
  builtPagesForModule,
  defaultPageFor,
  hasPageBar,
  pageForPathname,
  pageHref,
  pagesForModule,
} from "./pages";

const PAGED_MODULES = ["schedule", "fitness", "notes", "finances"] as const;

describe("the registry itself", () => {
  /**
   * The bare module path resolves through `isDefault`, and a module with two of them would land
   * on whichever happened to be declared first — a coin flip that changes when someone reorders
   * the list for readability.
   */
  it("gives every module exactly one built default", () => {
    for (const moduleId of PAGED_MODULES) {
      const defaults = builtPagesForModule(moduleId).filter((page) => page.isDefault);
      expect(defaults, moduleId).toHaveLength(1);
    }
  });

  it("keeps ids and segments unique within a module", () => {
    for (const moduleId of PAGED_MODULES) {
      const pages = pagesForModule(moduleId);
      expect(new Set(pages.map((page) => page.id)).size, moduleId).toBe(pages.length);
      expect(new Set(pages.map((page) => page.segment)).size, moduleId).toBe(
        pages.length,
      );
    }
  });

  it("returns nothing for a module that has no pages", () => {
    expect(pagesForModule("tasks")).toEqual([]);
    expect(defaultPageFor("tasks")).toBeNull();
    expect(hasPageBar("tasks")).toBe(false);
  });
});

describe("hasPageBar", () => {
  it("is false for Finances, which has one built page and one reserved", () => {
    // Not a bug to fix: a single tab spends a row saying "you are in the only place there is".
    // The active insights spec flips `insights` to built and the bar appears.
    expect(pagesForModule("finances")).toHaveLength(2);
    expect(builtPagesForModule("finances")).toHaveLength(1);
    expect(hasPageBar("finances")).toBe(false);
  });

  it("is true for the modules with two or more built pages", () => {
    expect(hasPageBar("schedule")).toBe(true);
    expect(hasPageBar("fitness")).toBe(true);
    expect(hasPageBar("notes")).toBe(true);
  });
});

describe("reserved pages", () => {
  it("are declared but never navigable", () => {
    expect(pagesForModule("finances").map((page) => page.id)).toContain("insights");
    expect(builtPagesForModule("finances").map((page) => page.id)).not.toContain(
      "insights",
    );
    expect(builtPageById("finances", "insights")).toBeNull();
    expect(pageForPathname("finances", "/finances", "/finances/insights")).toBeNull();
  });
});

describe("pageForPathname", () => {
  it("matches a page on its own path", () => {
    expect(pageForPathname("fitness", "/fitness", "/fitness/exercises")?.id).toBe(
      "exercises",
    );
    expect(pageForPathname("notes", "/notes", "/notes/journal")?.id).toBe("journal");
  });

  /**
   * The session editor is rendered *inside* the Sessions page by `FitnessView`. An exact-match
   * rule would drop the bar here and the editor would look like it had left the module.
   */
  it("matches a page from inside its subtree", () => {
    expect(pageForPathname("fitness", "/fitness", "/fitness/sessions/abc123")?.id).toBe(
      "sessions",
    );
    expect(pageForPathname("fitness", "/fitness", "/fitness/exercises/new")?.id).toBe(
      "exercises",
    );
  });

  /**
   * The other half of the rule, and the reason it is not "the first segment after the module":
   * these are focused flows with their own Back, and a bar on them would offer a second, wrong
   * way out.
   */
  it("matches nothing for an undeclared segment", () => {
    expect(pageForPathname("schedule", "/schedule", "/schedule/plan")).toBeNull();
    expect(
      pageForPathname("schedule", "/schedule", "/schedule/time-chart/abc123"),
    ).toBeNull();
    expect(pageForPathname("fitness", "/fitness", "/fitness/log")).toBeNull();
  });

  it("does not let one segment claim another that merely starts the same way", () => {
    // `/schedule/week-plan` must not resolve through a hypothetical `week`, and `day` must not
    // swallow it either. The trailing-slash boundary is what enforces this.
    expect(pageForPathname("schedule", "/schedule", "/schedule/week-plan")?.id).toBe(
      "week-plan",
    );
    expect(pageForPathname("schedule", "/schedule", "/schedule/dayzzz")).toBeNull();
    expect(pageForPathname("notes", "/notes", "/notes/gridiron")).toBeNull();
  });

  it("returns null on the bare module path, where no page has been chosen yet", () => {
    expect(pageForPathname("schedule", "/schedule", "/schedule")).toBeNull();
    expect(pageForPathname("schedule", "/schedule", "/schedule/")).toBeNull();
  });

  it("returns null for a pathname outside the module", () => {
    expect(pageForPathname("notes", "/notes", "/tasks")).toBeNull();
    // `/notesomething` shares a prefix with `/notes` and is a different route entirely.
    expect(pageForPathname("notes", "/notes", "/notesomething/grid")).toBeNull();
  });

  it("returns null for a module with no pages", () => {
    expect(pageForPathname("tasks", "/tasks", "/tasks")).toBeNull();
    expect(pageForPathname("tasks", "/tasks", "/tasks/anything")).toBeNull();
  });
});

describe("defaultPageFor and builtPageById", () => {
  it("resolves the declared default", () => {
    expect(defaultPageFor("schedule")?.id).toBe("calendar");
    expect(defaultPageFor("fitness")?.id).toBe("sessions");
    expect(defaultPageFor("notes")?.id).toBe("grid");
    expect(defaultPageFor("finances")?.id).toBe("register");
  });

  /**
   * A stored `lastPage` is whatever an older build wrote. An id that has since been renamed,
   * removed or shelved has to fall out and let the default answer, the same way an unknown
   * Commands-panel section key does — a dead key, not a broken shell.
   */
  it("drops a stored page id this build no longer recognises", () => {
    expect(builtPageById("notes", "diary")).toBeNull();
    expect(builtPageById("schedule", "week")).toBeNull();
    expect(builtPageById("notes", null)).toBeNull();
    expect(builtPageById("tasks", "grid")).toBeNull();
  });

  it("returns the page when the id is still good", () => {
    expect(builtPageById("schedule", "agenda")?.label).toBe("Agenda");
  });
});

describe("pageHref", () => {
  it("hangs the segment off the module path", () => {
    const agenda = builtPageById("schedule", "agenda");
    expect(agenda).not.toBeNull();
    expect(pageHref("/schedule", agenda!)).toBe("/schedule/agenda");
  });

  it("round-trips with pageForPathname for every built page", () => {
    for (const moduleId of PAGED_MODULES) {
      const basePath = `/${moduleId}`;
      for (const page of builtPagesForModule(moduleId)) {
        const href = pageHref(basePath, page);
        expect(pageForPathname(moduleId, basePath, href)?.id, href).toBe(page.id);
      }
    }
  });
});
