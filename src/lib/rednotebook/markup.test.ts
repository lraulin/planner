import { describe, expect, it } from "vitest";
import { normalizeBody, rednotebookToMarkdown } from "./markup";

describe("rednotebookToMarkdown", () => {
  it("converts headings by equals count", () => {
    expect(rednotebookToMarkdown("=== Multiple entries ===\nBody").markdown).toBe(
      "### Multiple entries\nBody",
    );
    expect(rednotebookToMarkdown("= Big =\n").markdown).toBe("# Big");
  });

  it("converts italic and strike, drops % comments", () => {
    const { markdown } = rednotebookToMarkdown(
      "% hidden\nSee //emphasis// and --old-- ideas",
    );
    expect(markdown).toBe("See *emphasis* and ~~old~~ ideas");
  });

  it("does not mangle https URLs as italic", () => {
    const { markdown } = rednotebookToMarkdown("see https://example.com/path");
    expect(markdown).toContain("https://example.com/path");
    expect(markdown).not.toContain("*example");
  });

  it("collects hashtags into contexts", () => {
    const { markdown, contexts } = rednotebookToMarkdown(
      "Talked about #work and #play and #work again",
    );
    expect(contexts).toEqual(["work", "play"]);
    expect(markdown).toContain("#work");
  });

  it("normalizeBody trims trailing newlines only", () => {
    expect(normalizeBody("a\n\n")).toBe("a");
    expect(normalizeBody("a\n b")).toBe("a\n b");
  });
});
