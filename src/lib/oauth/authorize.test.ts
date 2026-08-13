import { describe, expect, it } from "vitest";
import { parseAuthorizeRequest } from "./authorize";

describe("parseAuthorizeRequest", () => {
  it("accepts a PKCE request for the static planner client", async () => {
    process.env.PLANNER_AGENT_API_KEY = "test-key";
    process.env.BETTER_AUTH_URL = "https://planner.example";
    const parsed = await parseAuthorizeRequest(
      {
        response_type: "code",
        client_id: "planner",
        redirect_uri: "https://grok.com/connectors/callback",
        code_challenge: "abc",
        code_challenge_method: "S256",
        state: "s1",
      },
      "https://planner.example",
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.resource).toBe("https://planner.example/api/mcp");
      expect(parsed.client.clientName).toBe("Grok");
    }
  });

  it("rejects a missing PKCE challenge", async () => {
    const parsed = await parseAuthorizeRequest({
      response_type: "code",
      client_id: "planner",
      redirect_uri: "https://grok.com/connectors/callback",
    });
    expect(parsed).toMatchObject({ ok: false });
  });
});
