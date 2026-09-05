import { describe, expect, it } from "vitest";
import { urlHostLabel } from "./displayUrl";

describe("urlHostLabel", () => {
  it("drops the scheme, www, and path", () => {
    expect(urlHostLabel("https://www.chase.com/personal/login?x=1")).toBe("chase.com");
    expect(urlHostLabel("http://bank.example.org/a/b")).toBe("bank.example.org");
  });

  it("reads a bare host as a host", () => {
    expect(urlHostLabel("geico.com/policy")).toBe("geico.com");
  });

  it("shows back what was typed when it is not a URL", () => {
    expect(urlHostLabel("ask Cheryl for the link")).toBe("ask Cheryl for the link");
  });

  it("is empty for empty input", () => {
    expect(urlHostLabel("")).toBe("");
    expect(urlHostLabel("   ")).toBe("");
  });
});
