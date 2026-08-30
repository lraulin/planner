import { describe, expect, it } from "vitest";
import {
  ATTACH_NO_LINK,
  clipboardAttachRefusal,
  clipboardAttachStatus,
} from "./attachUrls";

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

describe("clipboardAttachStatus", () => {
  it("reports how many rows were created, and dupes as already attached", () => {
    expect(clipboardAttachStatus(0)).toBe("Already attached.");
    expect(clipboardAttachStatus(1)).toBe("Added 1 attachment.");
    expect(clipboardAttachStatus(2)).toBe("Added 2 attachments.");
  });
});
