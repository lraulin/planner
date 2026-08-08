import { describe, expect, it } from "vitest";
import { tomboyToMarkdown, tomboyXmlText } from "./markup";

describe("tomboyToMarkdown", () => {
  it("preserves nested emphasis, code, entities and links", () => {
    const result = tomboyToMarkdown(
      `Use <bold>very <italic>careful</italic></bold> &amp; <monospace>a\`b</monospace> at <link:url>https://example.com?a=1&amp;b=2</link:url>.`,
    );

    expect(result.markdown).toBe(
      "Use **very *careful*** & ``a`b`` at https://example.com?a=1&b=2.",
    );
    expect(result.unknownTags).toEqual([]);
  });

  it("turns Tomboy size headings and lists into Markdown blocks", () => {
    const result = tomboyToMarkdown(
      `<size:huge>Tonight</size:huge>\n<list><list-item dir="ltr">First</list-item><list-item dir="ltr">Second\n<list><list-item>Nested</list-item></list></list-item></list>`,
    );

    expect(result.markdown).toBe("## Tonight\n\n- First\n- Second\n  - Nested");
  });

  it("keeps text from unknown valid markup and reports the tag", () => {
    expect(tomboyToMarkdown("before <future>inside</future> after")).toEqual({
      markdown: "before inside after",
      unknownTags: ["future"],
    });
  });

  it("rejects mismatched tags instead of silently dropping content", () => {
    expect(() => tomboyToMarkdown("<bold>text</italic>")).toThrow(
      "Unexpected closing </italic>",
    );
  });
});

describe("tomboyXmlText", () => {
  it("decodes named and numeric XML entities", () => {
    expect(tomboyXmlText("Tom &amp; Lee &#x1F44B;")).toBe("Tom & Lee 👋");
  });
});
