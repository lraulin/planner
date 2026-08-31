import { describe, expect, it } from "vitest";
import {
  BROWSER_PENDING_AUTHORITY_MS,
  hasBrowserPendingAuthority,
} from "./browserPendingAuthority";

const CAPTURED_AT = new Date("2026-08-18T16:00:00Z");

describe("hasBrowserPendingAuthority", () => {
  it("keeps a complete snapshot authoritative until its window expires", () => {
    expect(hasBrowserPendingAuthority(CAPTURED_AT, CAPTURED_AT.getTime())).toBe(true);
    expect(
      hasBrowserPendingAuthority(
        CAPTURED_AT,
        CAPTURED_AT.getTime() + BROWSER_PENDING_AUTHORITY_MS - 1,
      ),
    ).toBe(true);
    expect(
      hasBrowserPendingAuthority(
        CAPTURED_AT,
        CAPTURED_AT.getTime() + BROWSER_PENDING_AUTHORITY_MS,
      ),
    ).toBe(false);
    expect(hasBrowserPendingAuthority(null, CAPTURED_AT.getTime())).toBe(false);
  });
});
