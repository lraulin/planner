import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "./route";

const originalKey = process.env.PLANNER_AGENT_API_KEY;

function request(tool: string, body: string, token = "test-key") {
  return new Request(`http://localhost/api/agent/${tool}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body,
  });
}

beforeEach(() => {
  process.env.PLANNER_AGENT_API_KEY = "test-key";
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.PLANNER_AGENT_API_KEY;
  else process.env.PLANNER_AGENT_API_KEY = originalKey;
});

describe("agent HTTP boundary", () => {
  it("serves authenticated health and focused GET discovery without account lookup", async () => {
    const health = await POST(request("health", "{}"), {
      params: Promise.resolve({ tool: "health" }),
    });
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      ok: true,
      data: { status: "ok", contractVersion: 2 },
    });

    const discovery = await GET(
      new Request("http://localhost/api/agent/list_tools", {
        headers: { authorization: "Bearer test-key" },
      }),
      { params: Promise.resolve({ tool: "list_tools" }) },
    );
    expect(discovery.status).toBe(200);
    const payload = (await discovery.json()) as {
      ok: boolean;
      data: { tools: unknown[] };
    };
    expect(payload.ok).toBe(true);
    expect(payload.data.tools).toHaveLength(10);
  });

  it("returns the standard validation envelope for an unknown argument", async () => {
    const response = await POST(request("health", '{"surprise":true}'), {
      params: Promise.resolve({ tool: "health" }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "validation",
        message:
          "Unknown field surprise. Remove it or call describe_tool for the schema.",
      },
    });
  });

  it("keeps malformed JSON and unknown tools inside the same envelope", async () => {
    const malformed = await POST(request("health", "{"), {
      params: Promise.resolve({ tool: "health" }),
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });

    const unknown = await POST(request("no_such_tool", "{}"), {
      params: Promise.resolve({ tool: "no_such_tool" }),
    });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it("rejects a missing bearer key before dispatch", async () => {
    const response = await POST(
      new Request("http://localhost/api/agent/health", {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ tool: "health" }) },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "unauthorized" },
    });
  });
});
