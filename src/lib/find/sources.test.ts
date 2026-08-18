import { describe, expect, it } from "vitest";
import {
  FIND_SOURCES,
  RESULT_KIND_LABELS,
  findSource,
  normalizeFieldClasses,
  normalizeSources,
} from "./sources";
import { FIND_FIELD_CLASSES, FIND_SOURCE_IDS, type FindResultKind } from "./types";

describe("the source registry", () => {
  it("covers every source id exactly once", () => {
    expect(FIND_SOURCES.map((source) => source.id)).toEqual([...FIND_SOURCE_IDS]);
  });

  it("resolves every declared id", () => {
    for (const id of FIND_SOURCE_IDS) {
      expect(findSource(id).id).toBe(id);
    }
  });

  it("labels every result kind", () => {
    // A kind added to the union without a label here would print `undefined` in the Type
    // column, which the type checker catches — this pins that none is blank either.
    for (const [kind, label] of Object.entries(RESULT_KIND_LABELS)) {
      expect(label, `${kind} has no label`).not.toBe("");
    }
  });
});

describe("normalizeSources", () => {
  it("drops unknown ids rather than throwing", () => {
    expect(normalizeSources(["notes", "atlantis", 7, null])).toEqual(["notes"]);
  });

  it("returns registry order, not the caller's", () => {
    // A stored blob written in some other order must not reorder the picker.
    expect(normalizeSources(["finances", "outline", "notes"])).toEqual([
      "outline",
      "notes",
      "finances",
    ]);
  });

  it("de-duplicates", () => {
    expect(normalizeSources(["notes", "notes"])).toEqual(["notes"]);
  });

  it("returns empty for junk", () => {
    expect(normalizeSources([])).toEqual([]);
    expect(normalizeSources(["nope"])).toEqual([]);
  });
});

describe("normalizeFieldClasses", () => {
  it("keeps only live classes, in registry order", () => {
    expect(normalizeFieldClasses(["subrecord", "name", "dates"])).toEqual([
      "name",
      "subrecord",
    ]);
  });

  it("accepts the full set", () => {
    expect(normalizeFieldClasses([...FIND_FIELD_CLASSES])).toEqual([
      ...FIND_FIELD_CLASSES,
    ]);
  });
});

describe("sub-record sources", () => {
  it("marks exactly the three families that have child lists", () => {
    // node_items, contact_items and workout_session_exercises. If a fourth arrives, this
    // fails and the Sources picker's help text needs updating with it.
    const withSubrecords = FIND_SOURCES.filter((source) => source.hasSubrecords).map(
      (source) => source.id,
    );
    expect(withSubrecords).toEqual(["outline", "contacts", "fitness"]);
  });
});

describe("result kinds", () => {
  it("names the four node types the schema actually has", () => {
    // Wishes are `node_items`, not a fifth node type — a plausible mistake, since the app
    // has a Wish List page that looks like a sibling of Tasks and Goals.
    const nodeKinds: FindResultKind[] = ["result_area", "goal", "project", "task"];
    for (const kind of nodeKinds) {
      expect(RESULT_KIND_LABELS[kind]).toBeTruthy();
    }
    expect(RESULT_KIND_LABELS).not.toHaveProperty("wish");
  });
});
