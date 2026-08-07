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

  /**
   * The comparison hashes both sides so `timingSafeEqual` always gets equal lengths. These
   * pin the two ways that could go wrong: a token of a different length must still be
   * rejected rather than throwing out of `timingSafeEqual`, and a token that merely shares a
   * prefix must not pass.
   */
  it("rejects tokens of every wrong shape without throwing something else", () => {
    process.env.PLANNER_AGENT_API_KEY = "secret";
    for (const token of ["", "s", "secre", "secrets", "SECRET", "x".repeat(500)]) {
      expect(() => requireAgentApiKey(requestWithAuth(`Bearer ${token}`))).toThrow(
        /Invalid API key|Authorization must be Bearer/,
      );
    }
  });

  it("accepts a key long enough to be a real one", () => {
    const key = "k".repeat(64);
    process.env.PLANNER_AGENT_API_KEY = key;
    expect(() => requireAgentApiKey(requestWithAuth(`Bearer ${key}`))).not.toThrow();
  });
});
