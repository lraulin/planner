import { describe, expect, it } from "vitest";
import {
  extractPageTitle,
  normalizeHttpUrl,
  shouldAutofillAttachmentTitle,
} from "./pageTitle";

describe("normalizeHttpUrl", () => {
  it("accepts absolute http(s) URLs", () => {
    expect(normalizeHttpUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(normalizeHttpUrl("http://example.com")).toBe("http://example.com/");
  });

  it("adds https for bare hosts", () => {
    expect(normalizeHttpUrl("example.com/docs")).toBe("https://example.com/docs");
  });

  it("trims whitespace", () => {
    expect(normalizeHttpUrl("  https://example.com  ")).toBe("https://example.com/");
  });

  it("rejects empty, non-http schemes, and junk", () => {
    expect(normalizeHttpUrl("")).toBeNull();
    expect(normalizeHttpUrl("   ")).toBeNull();
    expect(normalizeHttpUrl("file:///tmp/x")).toBeNull();
    expect(normalizeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeHttpUrl("not a url at all :::")).toBeNull();
  });
});

describe("shouldAutofillAttachmentTitle", () => {
  it("only fills blank attachment names with a usable web URL", () => {
    expect(
      shouldAutofillAttachmentTitle({
        kind: "attachment",
        title: "",
        url: "https://example.com",
      }),
    ).toBe(true);

    expect(
      shouldAutofillAttachmentTitle({
        kind: "attachment",
        title: "  ",
        url: "example.com",
      }),
    ).toBe(true);
  });

  it("does not overwrite a name the user already set", () => {
    expect(
      shouldAutofillAttachmentTitle({
        kind: "attachment",
        title: "My doc",
        url: "https://example.com",
      }),
    ).toBe(false);
  });

  it("ignores other list kinds and non-web URLs", () => {
    expect(
      shouldAutofillAttachmentTitle({
        kind: "risk",
        title: "",
        url: "https://example.com",
      }),
    ).toBe(false);

    expect(
      shouldAutofillAttachmentTitle({
        kind: "attachment",
        title: "",
        url: "file:///notes.txt",
      }),
    ).toBe(false);
  });
});

describe("extractPageTitle", () => {
  it("prefers the document title (browser tab) over og:title", () => {
    // AWS cert pages put a path slug in og:title and the real name in <title>.
    const html = `
      <html><head>
        <title>AWS Certified Developer - Associate</title>
        <meta property="og:title" content="certified-developer-associate" />
      </head></html>
    `;
    expect(extractPageTitle(html)).toBe("AWS Certified Developer - Associate");
  });

  it("falls back to og:title when the document title is empty", () => {
    const html = `
      <title>   </title>
      <meta content="Card title" property="og:title" />
    `;
    expect(extractPageTitle(html)).toBe("Card title");
  });

  it("falls back to twitter:title when neither title nor og is usable", () => {
    expect(
      extractPageTitle(`
        <meta name="twitter:title" content="Tweet title" />
      `),
    ).toBe("Tweet title");
  });

  it("uses a lone document title", () => {
    expect(extractPageTitle(`<title>  Just a tab  </title>`)).toBe("Just a tab");
  });

  it("decodes common entities and collapses whitespace", () => {
    expect(extractPageTitle(`<title>Tom &amp; Jerry\n  guide</title>`)).toBe(
      "Tom & Jerry guide",
    );
    expect(extractPageTitle(`<title>It&#39;s fine</title>`)).toBe("It's fine");
  });

  it("returns null when nothing usable is present", () => {
    expect(extractPageTitle("<html><body>no title</body></html>")).toBeNull();
    expect(extractPageTitle("<title>   </title>")).toBeNull();
  });
});
