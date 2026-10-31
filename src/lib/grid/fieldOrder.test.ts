import { describe, expect, it } from "vitest";
import { hideField, moveField, showField, withNewColumns } from "./fieldOrder";

describe("moveField", () => {
  it("swaps one step up or down", () => {
    expect(moveField(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveField(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
  });

  it("is a no-op at the ends or for unknown ids", () => {
    expect(moveField(["a", "b"], "a", "up")).toEqual(["a", "b"]);
    expect(moveField(["a", "b"], "b", "down")).toEqual(["a", "b"]);
    expect(moveField(["a", "b"], "z", "up")).toEqual(["a", "b"]);
  });
});

describe("showField / hideField", () => {
  it("appends only once and removes by id", () => {
    expect(showField(["a"], "b")).toEqual(["a", "b"]);
    expect(showField(["a", "b"], "b")).toEqual(["a", "b"]);
    expect(hideField(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
});

describe("withNewColumns", () => {
  const preset = ["name", "cadence", "category", "matchers", "url"];

  it("shows a column that shipped after the layout was saved", () => {
    // The Commitments bug: Category was added to the grid, and everyone who had ever
    // arranged that grid never saw it. `known` is what the layout knew at the time, so
    // Category and URL are both new here and both appear.
    const saved = ["name", "cadence", "matchers"];
    expect(withNewColumns(saved, saved, preset)).toEqual([
      "name",
      "cadence",
      "category",
      "matchers",
      "url",
    ]);
  });

  it("leaves a column the user hid where they put it", () => {
    // `matchers` and `url` were known when the layout was saved and are not in the order, so
    // they were hidden on purpose and stay hidden.
    expect(withNewColumns(["name", "cadence"], preset, preset)).toEqual([
      "name",
      "cadence",
    ]);
  });

  it("puts a new first column first", () => {
    expect(
      withNewColumns(["cadence"], ["cadence", "category", "matchers", "url"], preset),
    ).toEqual(["name", "cadence"]);
  });

  it("places a new column after the columns it follows as they are actually arranged", () => {
    // Someone dragged Matchers to the front. A new column must not follow it up there just
    // because the preset lists Matchers before URL.
    const saved = ["matchers", "name"];
    expect(withNewColumns(saved, saved, preset)).toEqual([
      "matchers",
      "name",
      "cadence",
      "category",
      "url",
    ]);
  });

  it("changes nothing when the layout already knows every column", () => {
    expect(withNewColumns(["name", "url"], preset, preset)).toEqual(["name", "url"]);
  });
});
