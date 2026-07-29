import { afterEach, describe, expect, it } from "vitest";
import { requireAgentApiKey } from "./auth";
import { AgentError } from "./errors";

const ORIGINAL = process.env.PLANNER_AGENT_API_KEY;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PLANNER_AGENT_API_KEY;
  else process.env.PLANNER_AGENT_API_KEY = ORIGINAL;
});

function requestWithAuth(value: string | null): Request {
  const headers = new Headers();
  if (value !== null) headers.set("authorization", value);
  return new Request("http://localhost/api/agent/get_context", {
    method: "POST",
    headers,
  });
}

describe("requireAgentApiKey", () => {
  it("rejects when the server key is not configured", () => {
    delete process.env.PLANNER_AGENT_API_KEY;
    expect(() => requireAgentApiKey(requestWithAuth("Bearer x"))).toThrow(AgentError);
    try {
      requireAgentApiKey(requestWithAuth("Bearer x"));
    } catch (e) {
      expect(e).toBeInstanceOf(AgentError);
      expect((e as AgentError).code).toBe("internal");
    }
  });

  it("rejects a missing Authorization header", () => {
    process.env.PLANNER_AGENT_API_KEY = "secret";
    expect(() => requireAgentApiKey(requestWithAuth(null))).toThrow(
      /Missing Authorization/,
    );
  });

  it("rejects a wrong key", () => {
    process.env.PLANNER_AGENT_API_KEY = "secret";
    expect(() => requireAgentApiKey(requestWithAuth("Bearer other"))).toThrow(
      /Invalid API key/,
    );
  });

  it("accepts a matching Bearer token", () => {
    process.env.PLANNER_AGENT_API_KEY = "secret";
    expect(() => requireAgentApiKey(requestWithAuth("Bearer secret"))).not.toThrow();
  });
});
