import { describe, expect, it } from "vitest";
import { parseChooserSettings, serializeChooserSettings } from "./settings";
import { defaultSettings } from "./views";

/**
 * The blob these read is user-editable in devtools and survives refactors of
 * `ChooserWeights`. A value that slips through wrong does not error — it silently reorders
 * the list the user is choosing their next task from.
 */

describe("parseChooserSettings", () => {
  it("falls back to the view's defaults for a non-object", () => {
    for (const value of [null, undefined, "settings", 3, []]) {
      expect(parseChooserSettings(value, "todo-list")).toEqual(
        defaultSettings("todo-list"),
      );
    }
  });

  it("round-trips what it serializes", () => {
    const settings = defaultSettings("best-overall");
    expect(
      parseChooserSettings(serializeChooserSettings(settings), "best-overall"),
    ).toEqual(settings);
  });

  it("keeps each view's own defaults", () => {
    // hidePlanned is on for the To-do List and off elsewhere; parsing an empty blob must
    // not flatten the two.
    expect(parseChooserSettings({}, "todo-list").hidePlanned).toBe(
      defaultSettings("todo-list").hidePlanned,
    );
    expect(parseChooserSettings({}, "best-overall").hidePlanned).toBe(
      defaultSettings("best-overall").hidePlanned,
    );
  });

  it("merges weights key by key rather than wholesale", () => {
    const base = defaultSettings("best-overall");
    const key = Object.keys(base.weights)[0] as keyof typeof base.weights;

    const parsed = parseChooserSettings({ weights: { [key]: 99 } }, "best-overall");

    expect(parsed.weights[key]).toBe(99);
    expect(Object.keys(parsed.weights).sort()).toEqual(
      Object.keys(base.weights).sort(),
    );
  });

  it("falls back for a weight that is not a finite number", () => {
    const base = defaultSettings("best-overall");
    const key = Object.keys(base.weights)[0] as keyof typeof base.weights;

    for (const bad of ["5", Number.NaN, null, Number.POSITIVE_INFINITY]) {
      const parsed = parseChooserSettings({ weights: { [key]: bad } }, "best-overall");
      expect(parsed.weights[key]).toBe(base.weights[key]);
    }
  });

  it("ignores a weight key that no longer exists", () => {
    const parsed = parseChooserSettings(
      { weights: { retiredWeight: 5 } },
      "best-overall",
    );
    expect(parsed.weights).toEqual(defaultSettings("best-overall").weights);
  });

  it("drops a state the schema no longer has, keeping the rest", () => {
    expect(
      parseChooserSettings({ states: ["not_started", "retired"] }, "best-overall")
        .states,
    ).toEqual(["not_started"]);
  });

  it("honours an explicitly empty state list", () => {
    // "Show me nothing" is odd but legal, and overriding it would make the checkboxes
    // disagree with the grid.
    expect(parseChooserSettings({ states: [] }, "best-overall").states).toEqual([]);
  });

  it("falls back when states is not a list at all", () => {
    expect(
      parseChooserSettings({ states: "not_started" }, "best-overall").states,
    ).toEqual(defaultSettings("best-overall").states);
  });
});
