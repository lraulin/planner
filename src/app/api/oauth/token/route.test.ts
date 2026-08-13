import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { issueAuthCode } from "@/lib/oauth/tokens";
import { POST } from "./route";

const originalKey = process.env.PLANNER_AGENT_API_KEY;
const originalUrl = process.env.BETTER_AUTH_URL;

const VERIFIER = "a".repeat(43);
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

beforeEach(() => {
  process.env.PLANNER_AGENT_API_KEY = "test-key";
  process.env.BETTER_AUTH_URL = "https://planner.example";
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.PLANNER_AGENT_API_KEY;
  else process.env.PLANNER_AGENT_API_KEY = originalKey;
  if (originalUrl === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = originalUrl;
});

describe("OAuth token endpoint", () => {
  it("exchanges a PKCE authorization code for access and refresh tokens", async () => {
    const code = issueAuthCode({
      sub: "user-1",
      clientId: "planner",
      redirectUri: "https://grok.com/connectors/callback",
      challenge: CHALLENGE,
      method: "S256",
      resource: "https://planner.example/api/mcp",
    });

    const response = await POST(
      new Request("https://planner.example/api/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: "https://grok.com/connectors/callback",
          client_id: "planner",
          code_verifier: VERIFIER,
          resource: "https://planner.example/api/mcp",
        }).toString(),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      token_type: string;
    };
    expect(body.token_type).toBe("Bearer");
    expect(body.access_token.startsWith("p1.")).toBe(true);
    expect(body.refresh_token.startsWith("p1.")).toBe(true);
  });

  it("rejects a wrong PKCE verifier", async () => {
    const code = issueAuthCode({
      sub: "user-1",
      clientId: "planner",
      redirectUri: "https://grok.com/connectors/callback",
      challenge: CHALLENGE,
      method: "S256",
      resource: "https://planner.example/api/mcp",
    });
    const response = await POST(
      new Request("https://planner.example/api/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: "https://grok.com/connectors/callback",
          code_verifier: "b".repeat(43),
        }).toString(),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_grant" });
  });
});
