import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mcpResourceUrl, oauthSigningSecret, publicOrigin } from "./origin";

// These read process.env directly, and the unit suite runs non-isolated (files share a
// worker's module registry — see testing.md), so every test that changes one of these vars
// must put it back rather than leak a value into whatever file runs next in this worker.
const ENV_KEYS = [
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "PLANNER_AGENT_API_KEY",
] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("publicOrigin", () => {
  it("prefers BETTER_AUTH_URL, stripped of a trailing slash", () => {
    process.env.BETTER_AUTH_URL = "https://planner.example/";
    expect(publicOrigin()).toBe("https://planner.example");
  });

  it("leaves a URL with no trailing slash unchanged", () => {
    process.env.BETTER_AUTH_URL = "https://planner.example";
    expect(publicOrigin()).toBe("https://planner.example");
  });

  it("treats a blank BETTER_AUTH_URL as unset", () => {
    process.env.BETTER_AUTH_URL = "   ";
    expect(publicOrigin()).toBe("http://localhost:3047");
  });

  it("falls back to the request's own origin when BETTER_AUTH_URL is unset", () => {
    delete process.env.BETTER_AUTH_URL;
    const request = new Request("https://from-request.example/api/mcp?x=1");
    expect(publicOrigin(request)).toBe("https://from-request.example");
  });

  it("falls back to localhost:3047 when neither is available", () => {
    delete process.env.BETTER_AUTH_URL;
    expect(publicOrigin()).toBe("http://localhost:3047");
  });

  it("prefers BETTER_AUTH_URL over a supplied request", () => {
    process.env.BETTER_AUTH_URL = "https://planner.example";
    const request = new Request("https://from-request.example/api/mcp");
    expect(publicOrigin(request)).toBe("https://planner.example");
  });
});

describe("mcpResourceUrl", () => {
  it("appends the MCP path to an origin", () => {
    expect(mcpResourceUrl("https://planner.example")).toBe(
      "https://planner.example/api/mcp",
    );
  });
});

describe("oauthSigningSecret", () => {
  it("prefers BETTER_AUTH_SECRET over the agent API key", () => {
    process.env.BETTER_AUTH_SECRET = "auth-secret";
    process.env.PLANNER_AGENT_API_KEY = "agent-key";
    expect(oauthSigningSecret()).toBe("auth-secret");
  });

  it("falls back to PLANNER_AGENT_API_KEY when BETTER_AUTH_SECRET is unset", () => {
    delete process.env.BETTER_AUTH_SECRET;
    process.env.PLANNER_AGENT_API_KEY = "agent-key";
    expect(oauthSigningSecret()).toBe("agent-key");
  });

  it("treats a blank BETTER_AUTH_SECRET as unset", () => {
    process.env.BETTER_AUTH_SECRET = "   ";
    process.env.PLANNER_AGENT_API_KEY = "agent-key";
    expect(oauthSigningSecret()).toBe("agent-key");
  });

  it("throws when neither secret is configured", () => {
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.PLANNER_AGENT_API_KEY;
    expect(() => oauthSigningSecret()).toThrow(/BETTER_AUTH_SECRET is not configured/);
  });
});
