import { describe, expect, it } from "vitest";
import { builtPagesForModule } from "@/lib/navigation/pages";
import {
  BUILT_MODULES,
  destinationLabel,
  documentTitle,
  moduleDefaultPageHref,
  moduleEntryHref,
  moduleForPathname,
  modulePages,
} from "./modules";

describe("modulePages", () => {
  it("returns registry order when no permutation is stored", () => {
    expect(modulePages("plan").map(({ page }) => page.id)).toEqual(
      builtPagesForModule("plan").map((page) => page.id),
    );
  });

  it("applies a stored permutation and still fills in missing pages", () => {
    expect(
      modulePages("plan", ["tasks", "overview"]).map(({ page }) => page.id),
    ).toEqual([
      "tasks",
      "overview",
      "outline",
      "projects",
      "goals",
      "wishes",
      "result-areas",
    ]);
  });
});

describe("moduleEntryHref", () => {
  it("points at the remembered page, so a link skips the redirect", () => {
    expect(moduleEntryHref("plan", "goals")).toBe("/plan/goals");
    expect(moduleEntryHref("finances", "register")).toBe("/finances/register");
  });

  it("falls back to the default page for nothing remembered or a page no longer built", () => {
    for (const remembered of [undefined, null, "a-page-that-was-renamed"]) {
      expect(moduleEntryHref("plan", remembered)).toBe(moduleDefaultPageHref("plan"));
    }
  });

  it("leaves a module with no pages on its own path, which is a real page", () => {
    expect(moduleEntryHref("find", undefined)).toBe("/find");
    expect(moduleEntryHref("find", "anything")).toBe("/find");
  });

  it("never links to a bare path that would only redirect", () => {
    for (const entry of BUILT_MODULES) {
      const landing = moduleDefaultPageHref(entry.id);
      expect(moduleEntryHref(entry.id, undefined)).toBe(landing ?? entry.href);
    }
  });
});

describe("moduleForPathname", () => {
  it("resolves every built module's own path and everything beneath it", () => {
    for (const entry of BUILT_MODULES) {
      expect(moduleForPathname(entry.href)).toBe(entry.id);
      expect(moduleForPathname(`${entry.href}/anything/below`)).toBe(entry.id);
    }
  });

  it("resolves the pages whose bare path redirects, which is where every link points", () => {
    expect(moduleForPathname("/plan/tasks")).toBe("plan");
    expect(moduleForPathname("/finances/register")).toBe("finances");
    expect(moduleForPathname("/schedule/time-chart/abc")).toBe("schedule");
    expect(moduleForPathname("/fitness/sessions/abc")).toBe("fitness");
  });

  it("ignores a query string or hash, so a whole destination can be passed", () => {
    expect(moduleForPathname("/finances/budget?month=2026-09")).toBe("finances");
    expect(moduleForPathname("/notes/journal#today")).toBe("notes");
  });

  it("is null for the shell routes that belong to no module", () => {
    expect(moduleForPathname("/organize")).toBeNull();
    expect(moduleForPathname("/settings")).toBeNull();
    expect(moduleForPathname("/login")).toBeNull();
  });

  it("keeps the segment boundary, so /plan does not claim /planning", () => {
    expect(moduleForPathname("/planning")).toBeNull();
    expect(moduleForPathname("/finances-old")).toBeNull();
  });

  it("is null for a reserved module, which renders nowhere", () => {
    expect(moduleForPathname("/focus")).toBeNull();
    expect(moduleForPathname("/reports/anything")).toBeNull();
  });
});

describe("destinationLabel", () => {
  it("names the page, not the module, when the module has a page bar", () => {
    expect(destinationLabel("/plan/tasks")).toBe("Tasks");
    expect(destinationLabel("/plan/outline")).toBe("Outline");
    expect(destinationLabel("/finances/budget")).toBe("Budget");
    expect(destinationLabel("/notes/journal")).toBe("Journal");
    expect(destinationLabel("/schedule/calendar")).toBe("Calendar");
    expect(destinationLabel("/library/contacts")).toBe("Contacts");
  });

  it("names the module when there are no pages to distinguish", () => {
    expect(destinationLabel("/chooser")).toBe("Task Chooser");
    expect(destinationLabel("/metrics")).toBe("Metrics");
    expect(destinationLabel("/find")).toBe("Find");
  });

  it("names a page from inside its subtree, the same way the page bar does", () => {
    expect(destinationLabel("/fitness/sessions/abc123")).toBe("Sessions");
    expect(destinationLabel("/fitness/exercises/new")).toBe("Exercises");
  });

  it("falls back to the module on a focused flow that is not a declared page", () => {
    expect(destinationLabel("/schedule/plan")).toBe("Schedule");
    expect(destinationLabel("/schedule/time-chart/abc123")).toBe("Schedule");
    expect(destinationLabel("/fitness/log")).toBe("Fitness");
  });

  it("names chrome routes that are not modules", () => {
    expect(destinationLabel("/settings")).toBe("Settings");
    expect(destinationLabel("/organize")).toBe("New Task Organizer");
    expect(destinationLabel("/login")).toBe("Sign in");
    expect(destinationLabel("/signup")).toBe("Sign up");
    expect(destinationLabel("/oauth/authorize")).toBe("Authorize");
  });

  it("strips a query string before matching", () => {
    expect(destinationLabel("/plan/tasks?detail=abc")).toBe("Tasks");
    expect(destinationLabel("/settings?section=sync")).toBe("Settings");
  });

  it("uses the caller fallback for a path in no module and no chrome list", () => {
    expect(destinationLabel("/nope")).toBe("Back");
    expect(destinationLabel("/nope", "Planner")).toBe("Planner");
  });
});

describe("documentTitle", () => {
  it("puts the place first so a row of tabs can be told apart", () => {
    expect(documentTitle("/plan/tasks")).toBe("Tasks · Planner");
    expect(documentTitle("/schedule/calendar")).toBe("Calendar · Planner");
    expect(documentTitle("/finances/budget")).toBe("Budget · Planner");
    expect(documentTitle("/chooser")).toBe("Task Chooser · Planner");
    expect(documentTitle("/settings")).toBe("Settings · Planner");
  });

  it("does not double the app name when the place is already Planner", () => {
    expect(documentTitle("/")).toBe("Planner");
    expect(documentTitle("/nope")).toBe("Planner");
  });
});
