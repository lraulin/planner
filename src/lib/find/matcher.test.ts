import { describe, expect, it } from "vitest";
import { makeMatcher, snippet, type Matcher } from "./matcher";
import { DEFAULT_MATCH_OPTIONS, type FindMatchOptions } from "./types";

function matcherFor(query: string, options: Partial<FindMatchOptions> = {}): Matcher {
  const built = makeMatcher(query, { ...DEFAULT_MATCH_OPTIONS, ...options });
  if (!built.ok) throw new Error(`expected a matcher, got: ${built.error}`);
  return built.match;
}

describe("makeMatcher", () => {
  it("matches case-insensitively by default", () => {
    const match = matcherFor("foo");
    expect(match("a FOO b")).toEqual({ start: 2, end: 5 });
  });

  it("respects match case", () => {
    const match = matcherFor("Foo", { matchCase: true });
    expect(match("foo")).toBeNull();
    expect(match("Foo")).toEqual({ start: 0, end: 3 });
  });

  it("treats the query as literal text unless regex is on", () => {
    // Without escaping, `a.c` would match "abc" — the bug this test pins.
    const literal = matcherFor("a.c");
    expect(literal("abc")).toBeNull();
    expect(literal("a.c")).toEqual({ start: 0, end: 3 });

    expect(matcherFor("a.c", { regex: true })("abc")).toEqual({ start: 0, end: 3 });
  });

  it("returns null rather than throwing on null and empty fields", () => {
    const match = matcherFor("foo");
    expect(match(null)).toBeNull();
    expect(match(undefined)).toBeNull();
    expect(match("")).toBeNull();
  });

  it("refuses an empty or whitespace-only query", () => {
    expect(makeMatcher("", DEFAULT_MATCH_OPTIONS).ok).toBe(false);
    expect(makeMatcher("   ", DEFAULT_MATCH_OPTIONS).ok).toBe(false);
  });

  it("reports an invalid regex instead of throwing or matching nothing", () => {
    const built = makeMatcher("[unterminated", {
      ...DEFAULT_MATCH_OPTIONS,
      regex: true,
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.error).toContain("Invalid regular expression");
  });

  it("escapes a would-be-invalid regex when regex is off", () => {
    // The same string is a fine literal search. Only the regex checkbox makes it an error.
    expect(matcherFor("[unterminated")("say [unterminated here")).toEqual({
      start: 4,
      end: 17,
    });
  });

  it("treats a zero-length match as no match", () => {
    // `a*` matches the empty string at offset 0 of literally every field, which would make
    // every record in the database a result.
    expect(matcherFor("a*", { regex: true })("zzz")).toBeNull();
    expect(matcherFor("^", { regex: true })("zzz")).toBeNull();
    // It still finds a real occurrence.
    expect(matcherFor("a*", { regex: true })("zaaz")).toEqual({ start: 1, end: 3 });
  });

  it("does not carry state between calls", () => {
    // A `g` flag would make the second call resume from `lastIndex` and miss the hit.
    const match = matcherFor("foo");
    expect(match("foo")).toEqual({ start: 0, end: 3 });
    expect(match("foo")).toEqual({ start: 0, end: 3 });
  });
});

describe("whole word", () => {
  it("rejects a hit inside a longer word", () => {
    const match = matcherFor("cat", { wholeWord: true });
    expect(match("concatenate")).toBeNull();
    expect(match("the cat sat")).toEqual({ start: 4, end: 7 });
  });

  it("matches at the very start and very end of a field", () => {
    const match = matcherFor("cat", { wholeWord: true });
    expect(match("cat")).toEqual({ start: 0, end: 3 });
    expect(match("a cat")).toEqual({ start: 2, end: 5 });
    expect(match("cat.")).toEqual({ start: 0, end: 3 });
  });

  it("works for a query that starts or ends with punctuation", () => {
    // `\b` boundaries are relative to the pattern's own edge characters, so `\bC\+\+\b`
    // would never match. The lookaround form asks the question the checkbox means.
    expect(matcherFor("C++", { wholeWord: true })("I write C++ daily")).toEqual({
      start: 8,
      end: 11,
    });
    expect(matcherFor(".", { wholeWord: true })("a . b")).toEqual({ start: 2, end: 3 });
    expect(matcherFor(".", { wholeWord: true })("a.b")).toBeNull();
  });

  it("composes with regex", () => {
    const match = matcherFor("ca[tr]", { wholeWord: true, regex: true });
    expect(match("concatenate")).toBeNull();
    expect(match("the car sat")).toEqual({ start: 4, end: 7 });
  });
});

describe("snippet", () => {
  it("returns a short field whole, with no ellipses", () => {
    expect(snippet("Max 2 drinks daily", { start: 4, end: 5 })).toBe(
      "Max 2 drinks daily",
    );
  });

  it("elides only the end that was actually cut", () => {
    const text = `${"a".repeat(100)}foo`;
    // Nothing follows the hit, so there is a leading ellipsis and no trailing one.
    const result = snippet(text, { start: 100, end: 103 });
    expect(result.startsWith("…")).toBe(true);
    expect(result.endsWith("foo")).toBe(true);
  });

  it("elides both ends when the hit is in the middle of a long field", () => {
    const text = `${"a".repeat(100)}foo${"b".repeat(100)}`;
    const result = snippet(text, { start: 100, end: 103 });
    expect(result.startsWith("…")).toBe(true);
    expect(result.endsWith("…")).toBe(true);
    expect(result).toContain("foo");
  });

  it("collapses whitespace so a Markdown body does not arrive as blank lines", () => {
    const text = "line one\n\n\n   line two foo bar";
    expect(snippet(text, { start: 22, end: 25 })).toBe("line one line two foo bar");
  });

  it("clamps at the start of the string", () => {
    // Radius reaches past offset 0; slicing must not wrap around.
    expect(snippet("foo bar", { start: 0, end: 3 })).toBe("foo bar");
  });
});
