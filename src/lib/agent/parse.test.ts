import { describe, expect, it } from "vitest";
import { nodeStateEnum, nodeTypeEnum, priorityLetterEnum } from "@/db/schema";
import { AgentError } from "./errors";
import {
  asObject,
  optionalNumber,
  optionalString,
  optionalStringArray,
  parseDate,
  parseNodeState,
  parseNodeType,
  parsePriorityLetter,
  requireString,
} from "./parse";

/**
 * The agent API's front door. Everything here reads a JSON body that arrived over HTTP from
 * outside the app, so "what does it accept" is a contract and not an implementation detail —
 * which is why these test the boundaries rather than restating the branches.
 */

describe("the accepted vocabularies track the schema", () => {
  /**
   * The point of the whole file. These three lists used to be typed out by hand, and the
   * compiler cannot catch a *missing* member — only a wrong one. So a tenth node state would
   * reach every grid and form while the agent API alone rejected it, with a message listing
   * nine and blaming the caller.
   */
  it("accepts exactly the node states the database has", () => {
    for (const state of nodeStateEnum.enumValues) {
      expect(parseNodeState(state)).toBe(state);
    }
    expect(() => parseNodeState("archived")).toThrow(AgentError);
  });

  it("accepts exactly the node types the database has", () => {
    for (const type of nodeTypeEnum.enumValues) {
      expect(parseNodeType(type)).toBe(type);
    }
    // `dream` is a *kind* in the UI, not a type — it is a goal with a flag. The agent API
    // deliberately speaks types.
    expect(() => parseNodeType("dream")).toThrow(AgentError);
  });

  it("accepts exactly the priority letters the database has", () => {
    for (const letter of priorityLetterEnum.enumValues) {
      expect(parsePriorityLetter(letter)).toBe(letter);
    }
    expect(parsePriorityLetter(null)).toBeNull();
    expect(() => parsePriorityLetter("E")).toThrow(AgentError);
    // Lower case is a different value, not a lenient spelling: the column is an enum.
    expect(() => parsePriorityLetter("a")).toThrow(AgentError);
  });

  it("names what it would have accepted, so a rejection is actionable", () => {
    expect(() => parseNodeState("archived")).toThrow(/not_started/);
    expect(() => parseNodeType("dream")).toThrow(/result_area/);
  });
});

describe("asObject", () => {
  it("treats a missing body as an empty one", () => {
    // Tools with no arguments (`health`, `get_context`) are called with no body at all.
    expect(asObject(null)).toEqual({});
    expect(asObject(undefined)).toEqual({});
  });

  it("refuses anything that is not a JSON object", () => {
    // An array is the one that matters: `typeof [] === "object"`, so a naive check lets it
    // through and every field then reads as absent.
    for (const body of [[], "text", 3, true]) {
      expect(() => asObject(body)).toThrow(AgentError);
    }
  });
});

describe("field readers", () => {
  it("tells absent from present-and-wrong", () => {
    expect(optionalString({}, "name")).toBeUndefined();
    expect(optionalString({ name: "x" }, "name")).toBe("x");
    expect(() => optionalString({ name: 3 }, "name")).toThrow(/name must be a string/);
  });

  it("rejects a blank required string rather than writing one", () => {
    // `createNode` would otherwise happily store a row named "   ".
    expect(() => requireString({ name: "   " }, "name")).toThrow(/name is required/);
    expect(() => requireString({}, "name")).toThrow(/name is required/);
    expect(requireString({ name: " kept " }, "name")).toBe(" kept ");
  });

  it("refuses NaN, which is a number and is never a value", () => {
    expect(optionalNumber({ n: 0 }, "n")).toBe(0);
    expect(optionalNumber({ n: null }, "n")).toBeUndefined();
    expect(() => optionalNumber({ n: Number.NaN }, "n")).toThrow(AgentError);
    expect(() => optionalNumber({ n: "5" }, "n")).toThrow(AgentError);
  });

  it("refuses a mixed array rather than dropping the non-strings", () => {
    expect(optionalStringArray({ contexts: ["home"] }, "contexts")).toEqual(["home"]);
    expect(optionalStringArray({}, "contexts")).toBeUndefined();
    expect(() => optionalStringArray({ contexts: ["home", 2] }, "contexts")).toThrow(
      AgentError,
    );
    expect(() => optionalStringArray({ contexts: "home" }, "contexts")).toThrow(
      AgentError,
    );
  });
});

describe("parseDate", () => {
  it("separates absent, cleared, and set", () => {
    // Three different instructions: leave it alone, remove the date, use this one. Collapsing
    // any two of them is how a patch silently clears a field it was not asked about.
    expect(parseDate(undefined, "deadline")).toBeUndefined();
    expect(parseDate(null, "deadline")).toBeNull();
    expect(parseDate("", "deadline")).toBeNull();
    expect(parseDate("2026-03-11T09:00:00.000Z", "deadline")).toEqual(
      new Date("2026-03-11T09:00:00.000Z"),
    );
  });

  it("rejects junk", () => {
    for (const bad of ["not a date", "2026-13-01", "2026-00-05"]) {
      expect(() => parseDate(bad, "deadline")).toThrow(/deadline/);
    }
  });

  /**
   * The trap this guards. `new Date("2026-06-31")` is **not** Invalid Date — June has thirty
   * days, so it rolls over to July 1 and the caller is told nothing. An agent asked for a
   * month-end deadline produces `06-31` sooner or later, and a deadline silently a day late
   * is worse than an error.
   */
  it("refuses a day that month does not have, instead of rolling it over", () => {
    for (const bad of ["2026-06-31", "2026-02-30", "2026-04-31", "2025-02-29"]) {
      expect(() => parseDate(bad, "deadline")).toThrow(/not a date that exists/);
    }
    // …and does not over-reject: these days all exist.
    expect(parseDate("2026-06-30", "deadline")).toEqual(new Date("2026-06-30"));
    expect(parseDate("2024-02-29", "deadline")).toEqual(new Date("2024-02-29"));
    expect(parseDate("2026-12-31", "deadline")).toEqual(new Date("2026-12-31"));
  });

  it("applies the same rule to the date half of a timestamp", () => {
    expect(() => parseDate("2026-06-31T09:00:00.000Z", "deadline")).toThrow(
      /not a date that exists/,
    );
    expect(parseDate("2026-06-30T09:00:00.000Z", "deadline")).toEqual(
      new Date("2026-06-30T09:00:00.000Z"),
    );
  });
});
