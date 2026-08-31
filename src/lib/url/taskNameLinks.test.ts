import { describe, expect, it } from "vitest";
import { extractHttpUrls, rewriteNameReplacingUrls } from "./taskNameLinks";

describe("extractHttpUrls", () => {
  it("finds a sole absolute URL", () => {
    const matches = extractHttpUrls("https://example.com/a");
    expect(matches).toHaveLength(1);
    expect(matches[0].raw).toBe("https://example.com/a");
    expect(matches[0].normalized).toBe("https://example.com/a");
    expect(matches[0].index).toBe(0);
  });

  it("finds a URL mid-sentence", () => {
    const text = "Read https://example.com/docs later";
    const matches = extractHttpUrls(text);
    expect(matches).toHaveLength(1);
    expect(matches[0].raw).toBe("https://example.com/docs");
    expect(matches[0].index).toBe(text.indexOf("https://"));
  });

  it("finds multiple URLs", () => {
    const matches = extractHttpUrls(
      "See https://a.example/x and http://b.example/y please",
    );
    expect(matches.map((m) => m.normalized)).toEqual([
      "https://a.example/x",
      "http://b.example/y",
    ]);
  });

  it("peels trailing punctuation from a URL next to prose", () => {
    const matches = extractHttpUrls("Check https://example.com/a).");
    expect(matches).toHaveLength(1);
    expect(matches[0].raw).toBe("https://example.com/a");
  });

  it("keeps a closing parenthesis that is part of the path", () => {
    // Wikipedia and many other sites put (disambiguators) in the path. Peeling every
    // trailing `)` because the shorter form still "looks like a URL" would attach the
    // wrong href and rewrite the name off a 404.
    const text = "See https://en.wikipedia.org/wiki/Plan_(drawing)";
    const matches = extractHttpUrls(text);
    expect(matches).toHaveLength(1);
    expect(matches[0].raw).toBe("https://en.wikipedia.org/wiki/Plan_(drawing)");
    expect(matches[0].normalized).toBe("https://en.wikipedia.org/wiki/Plan_(drawing)");
  });

  it("still peels a wrapping parenthesis that is not in the path", () => {
    const matches = extractHttpUrls("(https://example.com/a)");
    expect(matches).toHaveLength(1);
    expect(matches[0].raw).toBe("https://example.com/a");
  });

  it("peels a markdown-wrap closing bracket that is not in the path", () => {
    const matches = extractHttpUrls("[https://example.com/a]");
    expect(matches).toHaveLength(1);
    expect(matches[0].raw).toBe("https://example.com/a");
  });

  it("accepts www hosts via https normalize", () => {
    const matches = extractHttpUrls("www.example.com/path");
    expect(matches).toHaveLength(1);
    expect(matches[0].normalized).toBe("https://www.example.com/path");
  });

  it("treats a bare host as a URL only when it is the whole name", () => {
    expect(extractHttpUrls("example.com/docs")).toEqual([
      expect.objectContaining({
        raw: "example.com/docs",
        normalized: "https://example.com/docs",
      }),
    ]);

    // Mid-sentence bare hosts are not URLs — version-like tokens and prose.
    expect(extractHttpUrls("see v1.2 notes")).toEqual([]);
    expect(extractHttpUrls("talk to bob.smith tomorrow")).toEqual([]);
  });

  it("does not treat ordinary single-word task names as bare hosts", () => {
    expect(extractHttpUrls("Untitled")).toEqual([]);
    expect(extractHttpUrls("Plain")).toEqual([]);
    expect(extractHttpUrls("Buy milk")).toEqual([]);
  });

  it("returns nothing for empty text", () => {
    expect(extractHttpUrls("")).toEqual([]);
    expect(extractHttpUrls("   ")).toEqual([]);
  });
});

describe("rewriteNameReplacingUrls", () => {
  it("replaces a sole URL with its title", () => {
    const text = "https://example.com/a";
    const matches = extractHttpUrls(text);
    expect(rewriteNameReplacingUrls(text, matches, () => "Example Page")).toBe(
      "Example Page",
    );
  });

  it("keeps surrounding text and collapses whitespace", () => {
    const text = "Read  https://example.com/a   later";
    const matches = extractHttpUrls(text);
    expect(rewriteNameReplacingUrls(text, matches, () => "Docs")).toBe(
      "Read Docs later",
    );
  });

  it("leaves the URL when no title is available", () => {
    const text = "Read https://example.com/a later";
    const matches = extractHttpUrls(text);
    expect(rewriteNameReplacingUrls(text, matches, () => null)).toBe(text);
  });

  it("replaces each URL that has a title", () => {
    const text = "A https://a.example/x and https://b.example/y";
    const matches = extractHttpUrls(text);
    const titles = new Map([
      ["https://a.example/x", "Alpha"],
      ["https://b.example/y", "Beta"],
    ]);
    expect(
      rewriteNameReplacingUrls(text, matches, (href) => titles.get(href) ?? null),
    ).toBe("A Alpha and Beta");
  });
});
