import { afterEach, describe, expect, it } from "vitest";
import { issueAccessToken, issueAuthCode, verifyClaims } from "./tokens";

const originalSecret = process.env.PLANNER_AGENT_API_KEY;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.PLANNER_AGENT_API_KEY;
  else process.env.PLANNER_AGENT_API_KEY = originalSecret;
});

describe("OAuth signed tokens", () => {
  it("round-trips an access token and rejects a tampered one", () => {
    process.env.PLANNER_AGENT_API_KEY = "test-key";
    const token = issueAccessToken("user-1", "https://example.com/api/mcp");
    expect(verifyClaims(token, "at")).toMatchObject({
      typ: "at",
      sub: "user-1",
      aud: "https://example.com/api/mcp",
    });
    expect(verifyClaims(token.slice(0, -2) + "xx", "at")).toBeNull();
    expect(verifyClaims(token, "rt")).toBeNull();
  });

  it("rejects an expired authorization code", () => {
    process.env.PLANNER_AGENT_API_KEY = "test-key";
    const code = issueAuthCode(
      {
        sub: "user-1",
        clientId: "planner",
        redirectUri: "https://grok.com/cb",
        challenge: "abc",
        method: "S256",
        resource: "https://example.com/api/mcp",
      },
      Date.now() - 10 * 60 * 1000,
    );
    expect(verifyClaims(code, "code")).toBeNull();
  });
});
