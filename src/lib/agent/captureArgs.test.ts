import { describe, expect, it } from "vitest";
import { MAX_CAPTURE_ITEMS, parseCaptureArgs } from "./captureArgs";

/**
 * The `capture` tool's argument parsing. Worth testing on its own because it is the only
 * place a bad request can turn into a *plausible* write — a dropped `externalSource` still
 * imports the task, it just imports it again tomorrow, and nothing downstream notices.
 */

describe("parseCaptureArgs — single item", () => {
  it("takes a bare name, the shape Alfred posts", () => {
    expect(parseCaptureArgs({ name: "Call the dentist" })).toEqual({
      single: true,
      items: [{ depth: 0, name: "Call the dentist", note: "" }],
    });
  });

  it("trims padding off the name and note", () => {
    const { items } = parseCaptureArgs({ name: "  Call  ", note: "  soon  " });
    expect(items[0]).toMatchObject({ name: "Call", note: "soon" });
  });

  it("rejects a missing, blank, or whitespace-only name", () => {
    expect(() => parseCaptureArgs({})).toThrow("name or items is required");
    expect(() => parseCaptureArgs({ name: "" })).toThrow("name is required");
    expect(() => parseCaptureArgs({ name: "   " })).toThrow("name is required");
  });

  it("rejects a non-string name", () => {
    expect(() => parseCaptureArgs({ name: 42 })).toThrow("name must be a string");
  });
});

describe("parseCaptureArgs — batch", () => {
  it("parses items and marks the result as not single", () => {
    const result = parseCaptureArgs({
      items: [{ name: "One" }, { name: "Two", note: "with a note" }],
    });

    expect(result.single).toBe(false);
    expect(result.items).toEqual([
      { depth: 0, name: "One", note: "" },
      { depth: 0, name: "Two", note: "with a note" },
    ]);
  });

  // Everything in a batch is a sibling. Reminders has no indentation to carry over, and a
  // stray depth would silently reparent one task under another.
  it("gives every item depth 0", () => {
    const { items } = parseCaptureArgs({
      items: [{ name: "One" }, { name: "Two" }, { name: "Three" }],
    });
    expect(items.map((i) => i.depth)).toEqual([0, 0, 0]);
  });

  it("names the offending index when one item is bad", () => {
    expect(() =>
      parseCaptureArgs({ items: [{ name: "Fine" }, { name: "  " }] }),
    ).toThrow("items[1].name is required");

    expect(() => parseCaptureArgs({ items: [{ name: "Fine" }, "nope"] })).toThrow(
      "items[1] must be an object",
    );
  });

  it("rejects an empty or non-array items", () => {
    expect(() => parseCaptureArgs({ items: [] })).toThrow("items must not be empty");
    expect(() => parseCaptureArgs({ items: "one, two" })).toThrow(
      "items must be an array",
    );
  });

  it("rejects a batch past the cap", () => {
    const items = Array.from({ length: MAX_CAPTURE_ITEMS + 1 }, (_, i) => ({
      name: `Item ${i}`,
    }));
    expect(() => parseCaptureArgs({ items })).toThrow("at most 100");
  });

  it("accepts a batch exactly at the cap", () => {
    const items = Array.from({ length: MAX_CAPTURE_ITEMS }, (_, i) => ({
      name: `Item ${i}`,
    }));
    expect(parseCaptureArgs({ items }).items).toHaveLength(MAX_CAPTURE_ITEMS);
  });

  // Two shapes with different response contracts; guessing which one was meant would send
  // a caller the wrong answer shape.
  it("refuses name and items together", () => {
    expect(() => parseCaptureArgs({ name: "One", items: [{ name: "Two" }] })).toThrow(
      "not both",
    );
  });
});

describe("parseCaptureArgs — deadlines", () => {
  it("parses an ISO deadline into a Date", () => {
    const { items } = parseCaptureArgs({
      items: [{ name: "File taxes", deadline: "2026-04-15T00:00:00Z" }],
    });
    expect(items[0].deadline).toEqual(new Date("2026-04-15T00:00:00Z"));
  });

  it("leaves deadline unset when absent, and null when explicitly null", () => {
    const absent = parseCaptureArgs({ items: [{ name: "No date" }] });
    expect(absent.items[0].deadline).toBeUndefined();

    const explicit = parseCaptureArgs({ items: [{ name: "Cleared", deadline: null }] });
    expect(explicit.items[0].deadline).toBeNull();
  });

  it("rejects a deadline that is not a date, naming the item", () => {
    expect(() =>
      parseCaptureArgs({ items: [{ name: "One" }, { name: "Two", deadline: "soon" }] }),
    ).toThrow("items[1].deadline must be a valid ISO date");
  });
});

describe("parseCaptureArgs — external refs", () => {
  it("pairs an item id with the batch-level source", () => {
    const { items } = parseCaptureArgs({
      externalSource: "apple_reminders",
      items: [
        { name: "One", externalId: "a" },
        { name: "Two", externalId: "b" },
      ],
    });

    expect(items.map((i) => i.external)).toEqual([
      { source: "apple_reminders", id: "a" },
      { source: "apple_reminders", id: "b" },
    ]);
  });

  it("lets an item override the batch source", () => {
    const { items } = parseCaptureArgs({
      externalSource: "apple_reminders",
      items: [{ name: "One", externalId: "a", externalSource: "raycast" }],
    });
    expect(items[0].external).toEqual({ source: "raycast", id: "a" });
  });

  // The whole point of the column is a unique (source, id) pair. An id with no source
  // still writes a row, it just writes a *second* one next time — the exact failure this
  // feature exists to prevent, and invisible without this check.
  it("refuses an externalId with no source anywhere", () => {
    expect(() => parseCaptureArgs({ name: "One", externalId: "a" })).toThrow(
      "externalId requires externalSource",
    );
    expect(() =>
      parseCaptureArgs({ items: [{ name: "One", externalId: "a" }] }),
    ).toThrow("items[0].externalId requires externalSource");
  });

  it("leaves external unset when there is no id, source or not", () => {
    const { items } = parseCaptureArgs({
      externalSource: "apple_reminders",
      items: [{ name: "Typed by hand" }],
    });
    expect(items[0].external).toBeUndefined();
  });

  it("ignores a blank externalId rather than pairing it with a source", () => {
    const { items } = parseCaptureArgs({
      items: [{ name: "One", externalId: "   ", externalSource: "apple_reminders" }],
    });
    expect(items[0].external).toBeUndefined();
  });
});
