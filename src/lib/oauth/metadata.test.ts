import { describe, expect, it } from "vitest";
import {
  authorizationServerMetadata,
  protectedResourceMetadata,
  wwwAuthenticateChallenge,
} from "./metadata";

describe("OAuth discovery documents", () => {
  it("names the Planner authorize, token, and MCP resource URLs", () => {
    expect(authorizationServerMetadata("https://planner.example")).toMatchObject({
      issuer: "https://planner.example",
      authorization_endpoint: "https://planner.example/oauth/authorize",
      token_endpoint: "https://planner.example/api/oauth/token",
      registration_endpoint: "https://planner.example/api/oauth/register",
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
    expect(protectedResourceMetadata("https://planner.example")).toMatchObject({
      resource: "https://planner.example/api/mcp",
      authorization_servers: ["https://planner.example"],
    });
    expect(wwwAuthenticateChallenge("https://planner.example")).toContain(
      "https://planner.example/.well-known/oauth-protected-resource",
    );
  });
});
