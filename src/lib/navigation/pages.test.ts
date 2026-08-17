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

const PAGED_MODULES = [
  "plan",
  "schedule",
  "fitness",
  "notes",
  "finances",
  "library",
] as const;

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
    expect(pagesForModule("chooser")).toEqual([]);
    expect(defaultPageFor("chooser")).toBeNull();
    expect(hasPageBar("chooser")).toBe(false);
  });
});

describe("hasPageBar", () => {
  it("is true for every module with two or more built pages", () => {
    expect(hasPageBar("plan")).toBe(true);
    expect(hasPageBar("schedule")).toBe(true);
    expect(hasPageBar("fitness")).toBe(true);
    expect(hasPageBar("notes")).toBe(true);
    expect(hasPageBar("library")).toBe(true);
    // Finances is ordered by how often a page is opened, not by when it was built.
    expect(builtPagesForModule("finances").map((page) => page.id)).toEqual([
      "dashboard",
      "commitments",
      "insights",
      "register",
      "statements",
      "orders",
    ]);
    expect(hasPageBar("finances")).toBe(true);
  });
});

describe("the consolidated modules", () => {
  it("gives Plan the seven outline destinations, in Achieve's order", () => {
    expect(builtPagesForModule("plan").map((page) => page.id)).toEqual([
      "overview",
      "outline",
      "projects",
      "tasks",
      "goals",
      "wishes",
      "result-areas",
    ]);
  });

  it("gives Library the reference lists and the life-history pages", () => {
    // Contacts stays first and stays the default; the three life-history pages were appended
    // rather than interleaved, so nobody's remembered `lastPage` moves under them.
    expect(builtPagesForModule("library").map((page) => page.id)).toEqual([
      "contacts",
      "resources",
      "timeline",
      "jobs",
      "residences",
    ]);
  });

  it("puts Time Charts last in Schedule, after the three week surfaces and Day", () => {
    expect(builtPagesForModule("schedule").map((page) => page.id)).toEqual([
      "day",
      "calendar",
      "agenda",
      "week-plan",
      "time-charts",
    ]);
  });
});

describe("reserved pages", () => {
  /**
   * Every declared page is `built` today — Insights was the last `reserved` one and it
   * shipped. So this asserts the filter still agrees with the statuses rather than that a
   * particular page is hidden; the moment a `reserved` page is declared again it starts
   * catching the real thing, which a test naming one specific page would not.
   */
  it("are the only ones the filter drops", () => {
    for (const moduleId of PAGED_MODULES) {
      expect(builtPagesForModule(moduleId), moduleId).toEqual(
        pagesForModule(moduleId).filter((page) => page.status === "built"),
      );
      for (const page of pagesForModule(moduleId)) {
        const navigable = builtPageById(moduleId, page.id) !== null;
        expect(navigable, `${moduleId}/${page.id}`).toBe(page.status === "built");
      }
    }
  });

  it("has no route for a segment that was never declared", () => {
    expect(pageForPathname("finances", "/finances", "/finances/envelopes")).toBeNull();
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
    expect(pageForPathname("fitness", "/fitness", "/fitness/log")).toBeNull();
  });

  /**
   * The whole reason the time-chart editor kept its **singular** segment when its list moved
   * into Schedule as the plural one. A declared segment matches its own subtree, so
   * `/schedule/time-charts/abc` would resolve to the Time Charts page and the shell would draw
   * the page bar on a focused flow that already has its own exit.
   *
   * These two assertions are one letter apart on purpose. Anyone "fixing" the inconsistency
   * fails here rather than shipping a bar onto the editor.
   */
  it("keeps the time-chart editor out of the Time Charts page's subtree", () => {
    expect(pageForPathname("schedule", "/schedule", "/schedule/time-charts")?.id).toBe(
      "time-charts",
    );
    expect(
      pageForPathname("schedule", "/schedule", "/schedule/time-chart/abc123"),
    ).toBeNull();
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
    expect(pageForPathname("notes", "/notes", "/chooser")).toBeNull();
    // `/notesomething` shares a prefix with `/notes` and is a different route entirely.
    expect(pageForPathname("notes", "/notes", "/notesomething/grid")).toBeNull();
  });

  it("returns null for a module with no pages", () => {
    expect(pageForPathname("chooser", "/chooser", "/chooser")).toBeNull();
    expect(pageForPathname("chooser", "/chooser", "/chooser/anything")).toBeNull();
  });
});

describe("defaultPageFor and builtPageById", () => {
  it("resolves the declared default", () => {
    // Plan's is Overview because `/` redirects here: the hub is where a session with no
    // history lands, not where every session lands.
    expect(defaultPageFor("plan")?.id).toBe("overview");
    expect(defaultPageFor("schedule")?.id).toBe("calendar");
    expect(defaultPageFor("fitness")?.id).toBe("sessions");
    expect(defaultPageFor("notes")?.id).toBe("grid");
    expect(defaultPageFor("finances")?.id).toBe("dashboard");
    expect(defaultPageFor("library")?.id).toBe("contacts");
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
    expect(builtPageById("chooser", "grid")).toBeNull();
    // The consolidation's own case: `shell.lastPage` still holds keys written when these were
    // modules, and they have to fall out rather than resolve against the module that absorbed
    // them.
    expect(builtPageById("plan", "chooser")).toBeNull();
    expect(builtPageById("library", "time-charts")).toBeNull();
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
