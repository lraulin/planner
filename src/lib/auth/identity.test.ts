import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DEV_USER_EMAIL,
  agentUserEmail,
  devUserEmail,
  normalizeEmail,
} from "./identity";

/**
 * These resolvers decide *whose data* an unauthenticated local request and a machine client
 * get. The bug they exist to prevent was an unconfigured environment quietly resolving to a
 * real account, so the cases below are mostly about what happens when nothing is set.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

function withEnv(env: {
  nodeEnv?: string;
  devUser?: string;
  agentUser?: string;
}): void {
  vi.stubEnv("NODE_ENV", env.nodeEnv ?? "development");
  vi.stubEnv("AUTH_DEV_USER_EMAIL", env.devUser);
  vi.stubEnv("PLANNER_AGENT_USER_EMAIL", env.agentUser);
}

describe("devUserEmail", () => {
  it("falls back to the test account when unconfigured", () => {
    withEnv({});
    expect(devUserEmail()).toBe(DEFAULT_DEV_USER_EMAIL);

    withEnv({ devUser: "" });
    expect(devUserEmail()).toBe(DEFAULT_DEV_USER_EMAIL);

    // Whitespace is a typo, not a configuration.
    withEnv({ devUser: "   " });
    expect(devUserEmail()).toBe(DEFAULT_DEV_USER_EMAIL);
  });

  it("normalizes a configured address", () => {
    withEnv({ devUser: "  Someone@Example.com\n" });
    expect(devUserEmail()).toBe("someone@example.com");
  });
});

describe("normalizeEmail", () => {
  // Better Auth signs in by looking up `email.toLowerCase()`, so a stored address with any
  // uppercase in it is an account nobody can reach.
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Lee.Raulin@GMail.com \n")).toBe("lee.raulin@gmail.com");
  });
});

describe("agentUserEmail", () => {
  it("uses the configured account", () => {
    withEnv({ nodeEnv: "production", agentUser: " Owner@Example.com " });
    expect(agentUserEmail()).toBe("owner@example.com");
  });

  it("throws in production rather than guessing an account", () => {
    withEnv({ nodeEnv: "production" });
    expect(() => agentUserEmail()).toThrow(/PLANNER_AGENT_USER_EMAIL/);

    withEnv({ nodeEnv: "production", agentUser: "  " });
    expect(() => agentUserEmail()).toThrow(/PLANNER_AGENT_USER_EMAIL/);
  });

  it("falls back to the dev user outside production", () => {
    withEnv({ devUser: "local@example.com" });
    expect(agentUserEmail()).toBe("local@example.com");
  });
});

describe("an unconfigured environment", () => {
  it("resolves both identities to the test account, never a real one", () => {
    withEnv({});
    expect(devUserEmail()).toBe(DEFAULT_DEV_USER_EMAIL);
    expect(agentUserEmail()).toBe(DEFAULT_DEV_USER_EMAIL);
  });
});
