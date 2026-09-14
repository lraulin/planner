import { describe, expect, it } from "vitest";
import { extractHttpUrls, rewriteNameReplacingUrls } from "./extractHttpUrls";

describe("extractHttpUrls", () => {
  it("matches a plain https URL", () => {
    const matches = extractHttpUrls("See https://example.com/foo for details");
    expect(matches).toEqual([
      {
        raw: "https://example.com/foo",
        index: 4,
        normalized: "https://example.com/foo",
      },
    ]);
  });

  it("matches a www. URL with no scheme", () => {
    const matches = extractHttpUrls("go to www.example.com/path");
    expect(matches).toHaveLength(1);
    expect(matches[0].raw).toBe("www.example.com/path");
    expect(matches[0].normalized).toBe("https://www.example.com/path");
  });

  it("finds every occurrence, each at its own index", () => {
    const text = "https://a.com then https://b.com";
    const matches = extractHttpUrls(text);
    expect(matches.map((m) => m.raw)).toEqual(["https://a.com", "https://b.com"]);
    expect(matches.map((m) => m.index)).toEqual([0, text.indexOf("https://b.com")]);
  });

  it("peels sentence punctuation that trails a URL", () => {
    // The plausible mistake: matching the regex's greedy span verbatim and shipping the
    // period as part of the href.
    expect(extractHttpUrls("Read https://example.com/foo.")[0].raw).toBe(
      "https://example.com/foo",
    );
    expect(extractHttpUrls("Read https://example.com/foo,")[0].raw).toBe(
      "https://example.com/foo",
    );
    expect(extractHttpUrls("Read https://example.com/foo!")[0].raw).toBe(
      "https://example.com/foo",
    );
  });

  it("peels an unbalanced trailing paren but keeps a balanced one attached", () => {
    // "(see https://x.com/a)" — the opening paren sits outside the regex match (it isn't
    // part of the URL charset), so the trailing ")" is unbalanced from the match's own point
    // of view and reads as prose wrapping the link.
    expect(extractHttpUrls("(see https://example.com/a)")[0].raw).toBe(
      "https://example.com/a",
    );

    // A paren that is genuinely part of the URL (Wikipedia-style) must survive.
    expect(extractHttpUrls("https://en.wikipedia.org/wiki/Plan_(drawing)")[0].raw).toBe(
      "https://en.wikipedia.org/wiki/Plan_(drawing)",
    );
  });

  it("peels only the stray outer paren when the URL's own paren is doubly wrapped", () => {
    // "(...Plan_(drawing))" — one paren belongs to the URL, the outer one is prose.
    const matches = extractHttpUrls(
      "(see https://en.wikipedia.org/wiki/Plan_(drawing))",
    );
    expect(matches[0].raw).toBe("https://en.wikipedia.org/wiki/Plan_(drawing)");
  });

  it("peels a lone trailing bracket the same way", () => {
    expect(extractHttpUrls("[https://example.com/a]")[0].raw).toBe(
      "https://example.com/a",
    );
  });

  it("promotes a whole bare-host name with no scheme", () => {
    const matches = extractHttpUrls("example.com/path");
    expect(matches).toEqual([
      { raw: "example.com/path", index: 0, normalized: "https://example.com/path" },
    ]);
  });

  it("does not promote a single word that merely parses as a hostname", () => {
    // The comment's own stated reason this guard exists: "Untitled" and "v1.2" both parse
    // fine as a URL() hostname but are not links.
    expect(extractHttpUrls("Untitled")).toEqual([]);
    expect(extractHttpUrls("v1.2")).toEqual([]);
  });

  it("does not promote a bare host when it is only part of a longer name", () => {
    expect(extractHttpUrls("Notes about example.com stuff")).toEqual([]);
  });

  it("does not double-promote a name that already starts with a scheme or www", () => {
    // These already matched via the main regex pass above; the bare-host fallback only
    // runs when that pass found nothing, so this also guards against double-counting.
    expect(extractHttpUrls("https://example.com")).toHaveLength(1);
    expect(extractHttpUrls("www.example.com")).toHaveLength(1);
  });

  it("returns nothing for empty or whitespace-only text", () => {
    expect(extractHttpUrls("")).toEqual([]);
    expect(extractHttpUrls("   ")).toEqual([]);
  });
});

describe("rewriteNameReplacingUrls", () => {
  it("replaces a matched span with its title", () => {
    const text = "Check https://example.com/foo now";
    const matches = extractHttpUrls(text);
    const result = rewriteNameReplacingUrls(text, matches, () => "Example Foo");
    expect(result).toBe("Check Example Foo now");
  });

  it("leaves a span unchanged when no title is available", () => {
    const text = "Check https://example.com/foo now";
    const matches = extractHttpUrls(text);
    const result = rewriteNameReplacingUrls(text, matches, () => null);
    expect(result).toBe(text);
  });

  it("rewrites multiple spans without corrupting later indices", () => {
    // The plausible mistake: replacing left-to-right and letting an earlier, shorter
    // replacement shift every later match's stored index out from under it.
    const text = "https://a.com and https://bb.com";
    const matches = extractHttpUrls(text);
    const result = rewriteNameReplacingUrls(text, matches, (normalized) =>
      normalized.includes("a.com") ? "Alpha Site With A Long Title" : "B",
    );
    expect(result).toBe("Alpha Site With A Long Title and B");
  });

  it("collapses whitespace left behind by a replacement", () => {
    const text = "  https://example.com/foo  ";
    const matches = extractHttpUrls(text);
    const result = rewriteNameReplacingUrls(text, matches, () => "Foo");
    expect(result).toBe("Foo");
  });

  it("does not rewrite a span whose text no longer matches at its stored index", () => {
    // Guard for a stale match after the source string was already edited elsewhere.
    const matches = extractHttpUrls("https://example.com/foo");
    const edited = "totally different text";
    const result = rewriteNameReplacingUrls(edited, matches, () => "Foo");
    expect(result).toBe(edited);
  });
});
