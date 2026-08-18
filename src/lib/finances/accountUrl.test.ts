import { describe, expect, it } from "vitest";
import { parseAccountUrl } from "./accountUrl";

describe("parseAccountUrl", () => {
  it("keeps Capital One's + and = and Chase's hash", () => {
    const card =
      "https://myaccounts.capitalone.com/Card/bUYVJfmNzUx2MzsklEZuBCO1t1eOQrXRqSdOcvuBrJ8=";
    const checking =
      "https://myaccounts.capitalone.com/Bank/jg5mFCxvS9+soKzXLPBNRDRUhDVwyi769es9a2D2t2Y=";
    const chase =
      "https://secure.chase.com/web/auth/dashboard#/dashboard/transactions/1197428459/CARD/BAC";

    expect(parseAccountUrl(card)).toBe(card);
    expect(parseAccountUrl(checking)).toBe(checking);
    expect(parseAccountUrl(chase)).toBe(chase);
  });

  it("accepts any https URL and refuses everything else", () => {
    expect(parseAccountUrl("https://example.com/account")).toBe(
      "https://example.com/account",
    );
    expect(parseAccountUrl("  ")).toBe("");
    expect(parseAccountUrl("javascript:alert(1)")).toBeNull();
    expect(parseAccountUrl("http://secure.chase.com/x")).toBeNull();
    expect(parseAccountUrl("not a url")).toBeNull();
  });
});
