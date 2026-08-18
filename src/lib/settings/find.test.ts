import { describe, expect, it } from "vitest";
import { DEFAULT_FIND_SETTINGS, parseFindSettings } from "./find";

describe("parseFindSettings", () => {
  it("returns defaults for junk", () => {
    expect(parseFindSettings(null)).toEqual(DEFAULT_FIND_SETTINGS);
    expect(parseFindSettings("nope")).toEqual(DEFAULT_FIND_SETTINGS);
    expect(parseFindSettings(42)).toEqual(DEFAULT_FIND_SETTINGS);
  });

  it("keeps a stored selection", () => {
    const parsed = parseFindSettings({
      sources: ["notes", "finances"],
      fieldClasses: ["name"],
      match: { matchCase: true, wholeWord: false, regex: true },
      include: { completed: true, shelved: false },
    });

    expect(parsed.sources).toEqual(["notes", "finances"]);
    expect(parsed.fieldClasses).toEqual(["name"]);
    expect(parsed.match).toEqual({ matchCase: true, wholeWord: false, regex: true });
    expect(parsed.include).toEqual({ completed: true, shelved: false });
  });

  it("falls back to everything when a stored list is empty", () => {
    // Unlike a grid filter, an empty selection here would mean "search nothing" — a page
    // that can never match anything reads as broken rather than as filtered.
    const parsed = parseFindSettings({ sources: [], fieldClasses: [] });
    expect(parsed.sources).toEqual(DEFAULT_FIND_SETTINGS.sources);
    expect(parsed.fieldClasses).toEqual(DEFAULT_FIND_SETTINGS.fieldClasses);
  });

  it("drops a source that no longer exists rather than failing to load", () => {
    const parsed = parseFindSettings({ sources: ["notes", "file-organizer"] });
    expect(parsed.sources).toEqual(["notes"]);
  });

  it("fills in a half-written options record", () => {
    const parsed = parseFindSettings({ match: { regex: true } });
    expect(parsed.match).toEqual({ matchCase: false, wholeWord: false, regex: true });
  });
});
