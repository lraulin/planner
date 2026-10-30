import { describe, expect, it } from "vitest";
import { oneOf, oneOfOrNull } from "./oneOf";

const STATES = ["open", "done"] as const;

describe("oneOf", () => {
  it("returns a member unchanged", () => {
    expect(oneOf(STATES, "done", "nodes.state")).toBe("done");
  });

  it("throws on a string outside the set, naming the column and value", () => {
    expect(() => oneOf(STATES, "Done", "nodes.state")).toThrow(
      'nodes.state holds "Done", which is not one of open, done',
    );
  });

  it("throws on null and on a missing column", () => {
    expect(() => oneOf(STATES, null, "nodes.state")).toThrow("nodes.state holds null");
    expect(() => oneOf(STATES, undefined, "nodes.state")).toThrow("nodes.state");
  });

  it("does not accept a non-string that compares loosely", () => {
    expect(() => oneOf(["1"], 1, "x")).toThrow("x holds 1");
  });
});

describe("oneOfOrNull", () => {
  it("passes SQL null through", () => {
    expect(oneOfOrNull(STATES, null, "nodes.state")).toBeNull();
  });

  it("narrows a present value", () => {
    expect(oneOfOrNull(STATES, "open", "nodes.state")).toBe("open");
  });

  it("throws on undefined, which means the column was never selected", () => {
    expect(() => oneOfOrNull(STATES, undefined, "nodes.state")).toThrow(
      "nodes.state holds undefined",
    );
  });

  it("throws on a stray string", () => {
    expect(() => oneOfOrNull(STATES, "archived", "nodes.state")).toThrow(
      'nodes.state holds "archived"',
    );
  });
});
