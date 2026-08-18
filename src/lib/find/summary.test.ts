import { describe, expect, it } from "vitest";
import { DEFAULT_FIND_SETTINGS, type FindSettings } from "@/lib/settings/find";
import { summarizeFindScope } from "./summary";

function settings(over: Partial<FindSettings> = {}): FindSettings {
  return { ...DEFAULT_FIND_SETTINGS, ...over };
}

describe("summarizeFindScope", () => {
  it("says everything when nothing is narrowed", () => {
    expect(summarizeFindScope(settings())).toBe("everything");
  });

  it("names one or two sources rather than counting them", () => {
    expect(summarizeFindScope(settings({ sources: ["notes"] }))).toBe("Notes");
    expect(summarizeFindScope(settings({ sources: ["notes", "finances"] }))).toBe(
      "Notes and Finances",
    );
  });

  it("counts three or more, where naming them would not fit", () => {
    expect(
      summarizeFindScope(settings({ sources: ["outline", "notes", "finances"] })),
    ).toBe("3 of 8 sources");
  });

  it("mentions field classes only when some are off", () => {
    expect(summarizeFindScope(settings({ fieldClasses: ["name"] }))).toBe(
      "everything · names & titles",
    );
    // All three on is the default; saying so every time trains you to stop reading the row.
    expect(summarizeFindScope(settings())).not.toContain("names & titles");
  });

  it("lists the options that are on, and no others", () => {
    const result = summarizeFindScope(
      settings({
        match: { matchCase: true, wholeWord: false, regex: true },
        include: { completed: true, shelved: false },
      }),
    );
    expect(result).toBe("everything · match case · regex · completed");
  });
});
