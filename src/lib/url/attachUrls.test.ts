import { describe, expect, it } from "vitest";
import { ATTACH_NO_LINK, clipboardAttachRefusal } from "./attachUrls";

describe("clipboardAttachRefusal", () => {
  it("refuses empty or non-URL clipboard text", () => {
    expect(clipboardAttachRefusal("")).toBe(ATTACH_NO_LINK);
    expect(clipboardAttachRefusal("   ")).toBe(ATTACH_NO_LINK);
    expect(clipboardAttachRefusal("hello")).toBe(ATTACH_NO_LINK);
    expect(clipboardAttachRefusal("see v1.2 notes")).toBe(ATTACH_NO_LINK);
  });

  it("accepts a clip that extractHttpUrls would attach", () => {
    expect(clipboardAttachRefusal("https://example.com/a")).toBeNull();
    expect(clipboardAttachRefusal("Read https://example.com/a later")).toBeNull();
    expect(clipboardAttachRefusal("www.example.com/path")).toBeNull();
    expect(clipboardAttachRefusal("example.com/docs")).toBeNull();
  });
});
