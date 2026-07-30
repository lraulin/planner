import { afterEach, describe, expect, it, vi } from "vitest";
import { devAuthBypassEnabled } from "./dev-bypass";

/**
 * The failure mode this guards is an unauthenticated production app, so both gates are
 * tested independently — including the cases where someone sets the flag to something
 * *nearly* right.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

function withEnv(nodeEnv: string, flag: string | undefined): boolean {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("AUTH_DEV_BYPASS", flag);
  return devAuthBypassEnabled();
}

describe("devAuthBypassEnabled", () => {
  it("is on only when both gates pass", () => {
    expect(withEnv("development", "true")).toBe(true);
    expect(withEnv("test", "true")).toBe(true);
  });

  it("is off in production no matter what the flag says", () => {
    expect(withEnv("production", "true")).toBe(false);
    expect(withEnv("production", "TRUE")).toBe(false);
    expect(withEnv("production", "1")).toBe(false);
  });

  it("is off unless the flag is opted into exactly", () => {
    expect(withEnv("development", undefined)).toBe(false);
    expect(withEnv("development", "")).toBe(false);
    expect(withEnv("development", "false")).toBe(false);
    // Not truthy-coerced: only the exact string turns it on.
    expect(withEnv("development", "1")).toBe(false);
    expect(withEnv("development", "yes")).toBe(false);
    expect(withEnv("development", "True")).toBe(false);
  });
});
