import { describe, expect, it } from "vitest";
import {
  clientRedirectAllowed,
  isStaticPlannerRedirect,
  registerPublicClient,
  resolveClient,
} from "./clients";

describe("OAuth clients", () => {
  it("allows Grok and xAI https callbacks for the static planner client", () => {
    expect(isStaticPlannerRedirect("https://grok.com/connectors/callback")).toBe(true);
    expect(isStaticPlannerRedirect("https://accounts.x.ai/mcp/callback")).toBe(true);
    expect(isStaticPlannerRedirect("http://127.0.0.1:8787/cb")).toBe(true);
    expect(isStaticPlannerRedirect("https://evil.example/steal")).toBe(false);
  });

  it("resolves the static planner client and a registered public client", async () => {
    process.env.PLANNER_AGENT_API_KEY = "test-key";
    const staticClient = await resolveClient("planner");
    expect(staticClient?.clientName).toBe("Grok");
    expect(
      staticClient &&
        clientRedirectAllowed(staticClient, "https://grok.com/oauth/callback"),
    ).toBe(true);

    const registered = registerPublicClient("Cursor", ["https://cursor.com/callback"]);
    const resolved = await resolveClient(registered.clientId);
    expect(resolved?.clientName).toBe("Cursor");
    expect(
      resolved && clientRedirectAllowed(resolved, "https://cursor.com/callback"),
    ).toBe(true);
    expect(
      resolved && clientRedirectAllowed(resolved, "https://grok.com/callback"),
    ).toBe(false);
  });
});
