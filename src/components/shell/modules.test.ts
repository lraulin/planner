import { describe, expect, it } from "vitest";
import { builtPagesForModule } from "@/lib/navigation/pages";
import { destinationLabel, documentTitle, modulePages } from "./modules";

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
